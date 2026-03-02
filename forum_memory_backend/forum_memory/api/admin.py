"""Admin API routes — batch operations."""

import logging
import tempfile
import zipfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlmodel import Session

from forum_memory.api.deps import check_board_permission, get_current_user, get_db
from forum_memory.models.enums import SystemRole
from forum_memory.models.namespace import Namespace
from forum_memory.models.user import User
from forum_memory.schemas.admin import ImportTopicsRequest, ImportTopicsResult

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_super_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency: only super_admin may call admin endpoints."""
    if user.role != SystemRole.SUPER_ADMIN:
        raise HTTPException(403, "仅超级管理员可执行此操作")
    return user


# ─── Server-path import (super admin only) ──────────────────────────────────

@router.post("/import-topics", response_model=ImportTopicsResult)
def import_topics(
    req: ImportTopicsRequest,
    session: Session = Depends(get_db),
    _user: User = Depends(_require_super_admin),
) -> ImportTopicsResult:
    """通过服务器目录路径批量导入历史帖子（仅超级管理员）。"""
    ns = session.get(Namespace, req.namespace_id)
    if not ns:
        raise HTTPException(404, f"板块 {req.namespace_id} 不存在")

    dir_path = Path(req.dir_path)
    if not req.dry_run and not dir_path.is_dir():
        raise HTTPException(400, f"目录不存在或无法访问: {req.dir_path}")

    logger.info(
        "import-topics (path): namespace=%s  dir=%s  workers=%d  dry_run=%s",
        req.namespace_id, req.dir_path, req.workers, req.dry_run,
    )

    from forum_memory.scripts.import_topics import run_import
    try:
        stats = run_import(
            dir_path=dir_path,
            namespace_id=req.namespace_id,
            workers=req.workers,
            skip_extraction=req.skip_extraction,
            dry_run=req.dry_run,
        )
    except Exception as e:
        logger.exception("import_topics (path) failed")
        raise HTTPException(500, f"导入失败: {e}")

    return ImportTopicsResult(**stats)


# ─── File-upload import (super admin or board admin) ────────────────────────

@router.post("/import-topics/upload", response_model=ImportTopicsResult)
def import_topics_upload(
    namespace_id: str = Form(..., description="目标板块 UUID"),
    workers: int = Form(default=4, ge=1, le=16),
    skip_extraction: bool = Form(default=False),
    dry_run: bool = Form(default=False),
    files: list[UploadFile] = File(..., description="JSON 文件或 ZIP 压缩包"),
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ImportTopicsResult:
    """通过文件上传批量导入历史帖子（超级管理员或板块管理员）。

    支持上传格式：
    - 多个 .json 文件（直接选择 JSON）
    - 单个 .zip 文件（内含若干 .json，解压后导入）
    - 混合上传（JSON + ZIP 同时上传）
    """
    # ── Parse & validate namespace_id ────────────────────────────────────────
    try:
        ns_uuid = UUID(namespace_id)
    except ValueError:
        raise HTTPException(400, "namespace_id 格式不正确")

    ns = session.get(Namespace, ns_uuid)
    if not ns:
        raise HTTPException(404, f"板块 {ns_uuid} 不存在")

    # ── Permission: super_admin 或该板块的 board_admin ────────────────────────
    check_board_permission(ns_uuid, session, user)

    if not files:
        raise HTTPException(400, "未上传任何文件")

    logger.info(
        "import-topics (upload): namespace=%s  files=%d  workers=%d  user=%s  dry_run=%s",
        ns_uuid, len(files), workers, user.employee_id, dry_run,
    )

    from forum_memory.scripts.import_topics import run_import

    # ── Save uploaded files to a temp directory ───────────────────────────────
    with tempfile.TemporaryDirectory(prefix="fm_import_") as tmpdir:
        tmp_path = Path(tmpdir)
        json_count = 0

        for uf in files:
            filename = uf.filename or "unknown"
            content = uf.file.read()

            if filename.lower().endswith(".zip"):
                # Extract all JSON files from ZIP (ignore nested dirs)
                zip_tmp = tmp_path / "upload.zip"
                zip_tmp.write_bytes(content)
                try:
                    with zipfile.ZipFile(zip_tmp) as zf:
                        for member in zf.namelist():
                            if member.lower().endswith(".json") and not member.startswith("__"):
                                dest_name = Path(member).name
                                (tmp_path / dest_name).write_bytes(zf.read(member))
                                json_count += 1
                except zipfile.BadZipFile:
                    raise HTTPException(400, f"文件 {filename} 不是有效的 ZIP 压缩包")
                finally:
                    zip_tmp.unlink(missing_ok=True)

            elif filename.lower().endswith(".json"):
                dest = tmp_path / Path(filename).name
                dest.write_bytes(content)
                json_count += 1
            else:
                logger.warning("Skipping unsupported file type: %s", filename)

        if json_count == 0:
            raise HTTPException(400, "未找到任何 JSON 文件（支持直接上传 .json 或包含 .json 的 .zip）")

        logger.info("Prepared %d JSON files in temp dir, starting import…", json_count)

        try:
            stats = run_import(
                dir_path=tmp_path,
                namespace_id=ns_uuid,
                workers=workers,
                skip_extraction=skip_extraction,
                dry_run=dry_run,
            )
        except Exception as e:
            logger.exception("import_topics (upload) failed")
            raise HTTPException(500, f"导入失败: {e}")

    return ImportTopicsResult(**stats)
