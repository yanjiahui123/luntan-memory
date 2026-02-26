"""Memory feedback model."""

from uuid import UUID

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Text

from .base import UUIDMixin, TimestampMixin
from .enums import FeedbackType


class MemoryFeedback(UUIDMixin, TimestampMixin, table=True):
    """User feedback on a memory or AI answer."""

    __tablename__ = "memory_feedback"

    memory_id: UUID = Field(foreign_key="memories.id", index=True)
    user_id: UUID | None = Field(default=None, foreign_key="users.id")
    feedback_type: FeedbackType = Field(index=True)
    comment: str | None = Field(default=None, sa_column=Column(Text))
    thread_id: str | None = Field(default=None, max_length=200)
