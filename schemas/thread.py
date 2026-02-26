"""Pydantic schemas for thread (post) and comment API."""

from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field

from ..models.enums import ThreadStatus, ResolvedType, Priority


# ── Thread schemas ────────────────────────────────────────────

class ThreadCreate(BaseModel):
    namespace_id: UUID
    title: str = Field(max_length=500)
    content: str
    tags: list[str] | None = None
    priority: Priority | None = None
    knowledge_type: str | None = None
    environment: str | None = None


class ThreadRead(BaseModel):
    id: UUID
    namespace_id: UUID
    author_id: UUID
    title: str
    content: str
    status: ThreadStatus
    resolved_type: ResolvedType | None
    best_answer_id: UUID | None
    tags: list[str] | None
    priority: Priority | None
    knowledge_type: str | None
    environment: str | None
    comment_count: int
    view_count: int
    created_at: datetime
    resolved_at: datetime | None

    model_config = {"from_attributes": True}


class ThreadResolve(BaseModel):
    """Request to mark a thread as resolved."""
    best_answer_id: UUID


class ThreadListParams(BaseModel):
    namespace_id: UUID | None = None
    status: ThreadStatus | None = None
    tags: list[str] | None = None
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)


# ── Comment schemas ───────────────────────────────────────────

class CommentCreate(BaseModel):
    thread_id: UUID
    content: str


class CommentRead(BaseModel):
    id: UUID
    thread_id: UUID
    author_id: UUID | None
    is_ai: bool
    content: str
    author_role: str
    upvote_count: int
    is_best_answer: bool
    cited_memory_ids: list[str] | None
    created_at: datetime

    model_config = {"from_attributes": True}
