"""Memory model — the core knowledge entity."""

from uuid import UUID
from datetime import datetime

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

from .base import UUIDMixin, TimestampMixin
from .enums import Authority, MemoryStatus


class Memory(UUIDMixin, TimestampMixin, table=True):
    """A single knowledge memory extracted from forum threads."""

    __tablename__ = "memories"

    namespace_id: UUID = Field(foreign_key="namespaces.id", index=True)
    content: str = Field(sa_column=Column(Text, nullable=False))

    # ── Two-dimensional state ─────────────────────────────────
    authority: Authority = Field(default=Authority.NORMAL, index=True)
    status: MemoryStatus = Field(default=MemoryStatus.ACTIVE, index=True)

    # ── Quality metrics ───────────────────────────────────────
    quality_score: float = Field(default=0.5)
    useful_count: int = Field(default=0)
    not_useful_count: int = Field(default=0)
    wrong_count: int = Field(default=0)
    outdated_count: int = Field(default=0)
    retrieve_count: int = Field(default=0)
    last_retrieved_at: datetime | None = Field(default=None)

    # ── Fixed metadata (indexed columns) ──────────────────────
    source_type: str = Field(default="forum", max_length=50)
    source_id: str | None = Field(default=None, max_length=200)
    source_role: str = Field(max_length=50)
    knowledge_type: str | None = Field(default=None, max_length=50)
    resolved_type: str = Field(max_length=50)
    tags: list[str] | None = Field(default=None, sa_column=Column(ARRAY(Text)))
    environment: str | None = Field(default=None, max_length=200)
    access_level: int = Field(default=1)
    pending_human_confirm: bool = Field(default=False)

    # ── Extension metadata (JSONB) ────────────────────────────
    extra: dict = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False, server_default="{}"))

    # ── Embedding info ────────────────────────────────────────
    embedding_model: str | None = Field(default=None, max_length=100)

    # ── Citation chain ────────────────────────────────────────
    cited_by: list[str] | None = Field(default=None, sa_column=Column(ARRAY(Text)))
