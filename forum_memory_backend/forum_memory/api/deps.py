"""FastAPI dependencies — sync session and user stub."""

from uuid import UUID, uuid4

from fastapi import Depends, Header
from sqlmodel import Session

from forum_memory.database import get_session


def get_db() -> Session:
    """Alias for database session dependency."""
    yield from get_session()


def get_current_user_id(x_user_id: str = Header(default="anonymous")) -> UUID:
    """Extract user ID from header. Stub for real auth."""
    try:
        return UUID(x_user_id)
    except ValueError:
        return uuid4()  # fallback for anonymous
