"""Supporting models: thread events, summaries, knowledge gaps."""

from uuid import UUID

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Text

from .base import UUIDMixin, TimestampMixin
from .enums import ThreadStatus, ResolvedType


class ThreadEvent(UUIDMixin, TimestampMixin, table=True):
    """Async event emitted on thread state change, consumed by extraction pipeline."""

    __tablename__ = "thread_events"

    thread_id: UUID = Field(foreign_key="threads.id", index=True)
    namespace_id: UUID = Field(foreign_key="namespaces.id")
    status: ThreadStatus
    resolved_type: ResolvedType | None = Field(default=None)
    best_answer_id: UUID | None = Field(default=None)

    # Processing state
    is_processed: bool = Field(default=False, index=True)


class ThreadSummary(UUIDMixin, TimestampMixin, table=True):
    """Compressed summary of a long thread (Layer 2)."""

    __tablename__ = "thread_summaries"

    thread_id: UUID = Field(foreign_key="threads.id", unique=True, index=True)
    summary: str = Field(sa_column=Column(Text, nullable=False))
    message_count: int = Field(default=0)
    compression_model: str | None = Field(default=None, max_length=100)


class KnowledgeGap(UUIDMixin, TimestampMixin, table=True):
    """Tracks queries with no search results — knowledge gaps."""

    __tablename__ = "knowledge_gaps"

    namespace_id: UUID = Field(foreign_key="namespaces.id", index=True)
    query: str = Field(sa_column=Column(Text, nullable=False))
    hit_count: int = Field(default=1)
    is_resolved: bool = Field(default=False)


class NamespaceAdmin(SQLModel, table=True):
    """Many-to-many: namespace admins."""

    __tablename__ = "namespace_admins"

    namespace_id: UUID = Field(foreign_key="namespaces.id", primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", primary_key=True)
    role: str = Field(default="admin", max_length=50)
