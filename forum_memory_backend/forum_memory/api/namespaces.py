"""Namespace (board) API routes — sync."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from forum_memory.api.deps import get_db, get_current_user, require_admin, check_board_permission
from forum_memory.models.user import User
from forum_memory.models.namespace_moderator import NamespaceModerator
from forum_memory.models.enums import SystemRole
from forum_memory.schemas.namespace import NamespaceCreate, NamespaceUpdate, NamespaceRead, NamespaceStats, DictionaryUpdate
from forum_memory.schemas.user import UserRead
from forum_memory.services import namespace_service

router = APIRouter(prefix="/namespaces", tags=["namespaces"])


class ModeratorAdd(BaseModel):
    employee_id: str


@router.get("", response_model=list[NamespaceRead])
def list_namespaces(session: Session = Depends(get_db)):
    """所有人可查看板块列表。"""
    return namespace_service.list_namespaces(session)


@router.get("/stats/aggregate", response_model=NamespaceStats)
def get_aggregate_stats(session: Session = Depends(get_db)):
    """聚合所有板块的统计数据。"""
    return namespace_service.get_aggregate_stats(session)


@router.get("/{ns_id}", response_model=NamespaceRead)
def get_namespace(ns_id: UUID, session: Session = Depends(get_db)):
    """所有人可查看板块详情。"""
    ns = namespace_service.get_namespace(session, ns_id)
    if not ns:
        raise HTTPException(404, "Namespace not found")
    return ns


@router.post("", response_model=NamespaceRead, status_code=201)
def create_namespace(
    data: NamespaceCreate,
    session: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """仅超级管理员可创建板块。"""
    return namespace_service.create_namespace(session, data, admin.id)


@router.put("/{ns_id}", response_model=NamespaceRead)
def update_namespace(
    ns_id: UUID,
    data: NamespaceUpdate,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """超级管理员或板块管理员可修改板块。"""
    check_board_permission(ns_id, session, user)
    ns = namespace_service.update_namespace(session, ns_id, data)
    if not ns:
        raise HTTPException(404, "Namespace not found")
    return ns


@router.delete("/{ns_id}", response_model=NamespaceRead)
def delete_namespace(
    ns_id: UUID,
    session: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """仅超级管理员可删除板块（软删除）。"""
    try:
        return namespace_service.delete_namespace(session, ns_id)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/{ns_id}/stats", response_model=NamespaceStats)
def get_stats(ns_id: UUID, session: Session = Depends(get_db)):
    return namespace_service.get_stats(session, ns_id)


@router.put("/{ns_id}/dictionary", response_model=NamespaceRead)
def update_dictionary(
    ns_id: UUID,
    data: DictionaryUpdate,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """超级管理员或板块管理员可修改黑话字典。"""
    check_board_permission(ns_id, session, user)
    ns = namespace_service.update_dictionary(session, ns_id, data.entries)
    if not ns:
        raise HTTPException(404, "Namespace not found")
    return ns


# ── Moderator management (super admin only) ──────────────────

@router.get("/{ns_id}/moderators", response_model=list[UserRead])
def list_moderators(
    ns_id: UUID,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """查看板块管理员列表（超级管理员或该板块管理员可查看）。"""
    check_board_permission(ns_id, session, user)
    stmt = (
        select(User)
        .join(NamespaceModerator, NamespaceModerator.user_id == User.id)
        .where(NamespaceModerator.namespace_id == ns_id)
    )
    return list(session.exec(stmt).all())


@router.post("/{ns_id}/moderators", response_model=UserRead, status_code=201)
def add_moderator(
    ns_id: UUID,
    data: ModeratorAdd,
    session: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """仅超级管理员可指派板块管理员。通过工号查找用户。"""
    ns = namespace_service.get_namespace(session, ns_id)
    if not ns:
        raise HTTPException(404, "板块不存在")

    # 通过工号查找用户
    target_user = session.exec(
        select(User).where(User.employee_id == data.employee_id.strip(), User.is_active == True)
    ).first()
    if not target_user:
        raise HTTPException(404, f"工号 {data.employee_id} 不存在或已停用")

    if target_user.role == SystemRole.SUPER_ADMIN:
        raise HTTPException(400, "超级管理员无需指派为板块管理员")

    # Check duplicate
    existing = session.exec(
        select(NamespaceModerator).where(
            NamespaceModerator.user_id == target_user.id,
            NamespaceModerator.namespace_id == ns_id,
        )
    ).first()
    if existing:
        raise HTTPException(409, "该用户已是此板块管理员")

    # Update user role to board_admin if currently a regular user
    if target_user.role == SystemRole.USER:
        target_user.role = SystemRole.BOARD_ADMIN
        session.add(target_user)

    mod = NamespaceModerator(user_id=target_user.id, namespace_id=ns_id)
    session.add(mod)
    session.commit()
    session.refresh(target_user)
    return target_user


@router.delete("/{ns_id}/moderators/{user_id}", status_code=204)
def remove_moderator(
    ns_id: UUID,
    user_id: UUID,
    session: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """仅超级管理员可移除板块管理员。"""
    stmt = select(NamespaceModerator).where(
        NamespaceModerator.user_id == user_id,
        NamespaceModerator.namespace_id == ns_id,
    )
    mod = session.exec(stmt).first()
    if not mod:
        raise HTTPException(404, "未找到该管理员分配记录")
    session.delete(mod)
    session.commit()

    # If user has no more moderator assignments, revert role to USER
    remaining = session.exec(
        select(NamespaceModerator).where(NamespaceModerator.user_id == user_id)
    ).first()
    if not remaining:
        target_user = session.get(User, user_id)
        if target_user and target_user.role == SystemRole.BOARD_ADMIN:
            target_user.role = SystemRole.USER
            session.commit()
