"""Admin API routes — batch operations."""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from forum_memory.api.deps import get_db, get_current_user
from forum_memory.models.user import User
from forum_memory.models.enums import SystemRole
from forum_memory.models.namespace import Namespace
from forum_memory.schemas.admin import ImportTopicsRequest, ImportTopicsResult

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_super_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency: only super_admin may call admin endpoints."""
    if user.role != SystemRole.SUPER_ADMIN:
        raise HTTPException(403, "仅超级管理员可执行此操作")
    return user


@router.post("/import-topics", response_model=ImportTopicsResult)
def import_topics(
    req: ImportTopicsRequest,
    session: Session = Depends(get_db),
    _user: User = Depends(_require_super_admin),
) -> ImportTopicsResult:
    """批量导入历史帖子 JSON 文件到指定板块。

    - 幂等：通过 `_src:<topic_id>` 标签跳过已导入帖子
    - 并发：记忆提取阶段使用 `workers` 线程并发执行
    - 演练：`dry_run=true` 时只解析文件，不写入数据库
    """
    # Validate namespace
    ns = session.get(Namespace, req.namespace_id)
    if not ns:
        raise HTTPException(404, f"板块 {req.namespace_id} 不存在")

    # Validate directory
    dir_path = Path(req.dir_path)
    if not req.dry_run and not dir_path.is_dir():
        raise HTTPException(400, f"目录不存在或无法访问: {req.dir_path}")

    logger.info(
        "Admin import-topics: namespace=%s  dir=%s  workers=%d  dry_run=%s",
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
        logger.exception("import_topics failed")
        raise HTTPException(500, f"导入失败: {e}")

    return ImportTopicsResult(**stats)
