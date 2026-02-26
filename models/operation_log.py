"""Memory operation log for audit trail."""

from uuid import UUID

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Text
from sqlalchemy.dialects.postgresql import JSONB

from .base import UUIDMixin, TimestampMixin
from .enums import OperationType


class MemoryOperation(UUIDMixin, TimestampMixin, table=True):
    """Audit log for every memory mutation."""

    __tablename__ = "memory_operations"

    memory_id: UUID = Field(foreign_key="memories.id", index=True)
    operation: OperationType = Field(index=True)
    operator_id: UUID | None = Field(default=None, foreign_key="users.id")
    operator_type: str = Field(default="system", max_length=50)

    # Snapshot before/after
    content_before: str | None = Field(default=None, sa_column=Column(Text))
    content_after: str | None = Field(default=None, sa_column=Column(Text))
    metadata_diff: dict | None = Field(default=None, sa_column=Column(JSONB))

    reason: str | None = Field(default=None, max_length=500)
    source_thread_id: str | None = Field(default=None, max_length=200)
