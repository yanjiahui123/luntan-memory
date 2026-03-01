"""FastAPI dependencies — sync session, user lookup, and access control."""

from uuid import UUID

from fastapi import Depends, Header, HTTPException
from sqlmodel import Session, select

from forum_memory.database import get_session
from forum_memory.models.user import User
from forum_memory.models.namespace_moderator import NamespaceModerator
from forum_memory.models.enums import SystemRole


def get_db() -> Session:
    """Alias for database session dependency."""
    yield from get_session()


def get_current_user(
    x_employee_id: str = Header(default=""),
    session: Session = Depends(get_db),
) -> User:
    """
    根据请求头 X-Employee-Id 查找用户。

    FastAPI 的 Header() 自动将参数名下划线转连字符匹配，
    即 x_employee_id → 匹配 x-employee-id（HTTP 头不区分大小写，
    前端发 X-Employee-Id 同样能匹配）。
    """
    employee_id = x_employee_id.strip()
    if not employee_id:
        raise HTTPException(401, "缺少 X-Employee-Id 请求头，请设置你的工号")

    stmt = select(User).where(User.employee_id == employee_id, User.is_active == True)
    user = session.exec(stmt).first()
    if not user:
        raise HTTPException(401, f"工号 {employee_id} 未注册，请联系管理员")
    return user


def get_current_user_id(user: User = Depends(get_current_user)) -> UUID:
    """提取当前用户的 UUID（向后兼容）。"""
    return user.id


def require_admin(user: User = Depends(get_current_user)) -> User:
    """要求当前用户是超级管理员，否则 403。"""
    if user.role != SystemRole.SUPER_ADMIN:
        raise HTTPException(403, "需要超级管理员权限")
    return user


def check_board_permission(
    ns_id: UUID,
    session: Session,
    user: User,
) -> None:
    """检查用户是否有板块管理权限（超级管理员或该板块的管理员）。"""
    if user.role == SystemRole.SUPER_ADMIN:
        return
    if user.role == SystemRole.BOARD_ADMIN:
        stmt = select(NamespaceModerator).where(
            NamespaceModerator.user_id == user.id,
            NamespaceModerator.namespace_id == ns_id,
        )
        if session.exec(stmt).first():
            return
    raise HTTPException(403, "需要板块管理权限")
