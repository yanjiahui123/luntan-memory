"""User model."""

from sqlmodel import Field
from forum_memory.models.base import UUIDMixin, TimestampMixin


class User(UUIDMixin, TimestampMixin, table=True):
    """Forum user."""
    __tablename__ = "users"

    username: str = Field(max_length=100, unique=True, index=True)
    display_name: str = Field(max_length=200)
    email: str = Field(max_length=200, unique=True)
    avatar_url: str | None = Field(default=None, max_length=500)
    is_active: bool = Field(default=True)
