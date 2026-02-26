"""Namespace (board/section) model."""

from uuid import UUID

from sqlmodel import SQLModel, Field
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB

from .base import UUIDMixin, TimestampMixin


class Namespace(UUIDMixin, TimestampMixin, table=True):
    """Forum board / knowledge namespace."""

    __tablename__ = "namespaces"

    name: str = Field(max_length=200, unique=True, index=True)
    display_name: str = Field(max_length=200)
    description: str | None = Field(default=None)
    owner_id: UUID = Field(foreign_key="users.id", index=True)

    # Access: public / internal / restricted
    access_mode: str = Field(default="public", max_length=20)

    # Board-level config stored as JSONB
    config: dict = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False, server_default="{}"))

    # Slang / alias dictionary for query preprocessing
    dictionary: dict = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False, server_default="{}"))

    is_active: bool = Field(default=True)
