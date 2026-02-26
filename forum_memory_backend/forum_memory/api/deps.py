"""FastAPI dependencies — sync session, user lookup, and access control."""

from uuid import UUID

from fastapi import Depends, Header, HTTPException
from sqlmodel import Session, select

from forum_memory.database import get_session
from forum_memory.models.user import User
from forum_memory.models.enums import SystemRole


def get_db() -> Session:
    """Alias for database session dependency."""
    yield from get_session()


def get_current_user(
    x_employee_id: str = Header(alias="X-Employee-Id", default=""),
    session: Session = Depends(get_db),
) -> User:
    """
    根据请求头 X-Employee-Id 查找用户。
    - 找到 → 返回 User 对象
    - 找不到 → 401（需要先由管理员在系统中注册）
    - 未传工号 → 401
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