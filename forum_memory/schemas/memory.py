"""Pydantic schemas for memory API."""

from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field

from ..models.enums import Authority, MemoryStatus, AUDNAction


# ── Memory CRUD ───────────────────────────────────────────────

class MemoryCreate(BaseModel):
    """Manual memory creation by admin."""
    namespace_id: UUID
    content: str
    authority: Authority = Authority.LOCKED
    knowledge_type: str | None = None
    tags: list[str] | None = None
    environment: str | None = None
    extra: dict = Field(default_factory=dict)


class MemoryUpdate(BaseModel):
    content: str | None = None
    knowledge_type: str | None = None
    tags: list[str] | None = None
    environment: str | None = None
    extra: dict | None = None


class MemoryRead(BaseModel):
    id: UUID
    namespace_id: UUID
    content: str
    authority: Authority
    status: MemoryStatus
    quality_score: float
    useful_count: int
    not_useful_count: int
    wrong_count: int
    retrieve_count: int
    source_type: str
    source_id: str | None
    source_role: str
    knowledge_type: str | None
    resolved_type: str
    tags: list[str] | None
    environment: str | None
    pending_human_confirm: bool
    extra: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MemoryListParams(BaseModel):
    namespace_id: UUID | None = None
    authority: Authority | None = None
    status: MemoryStatus | None = None
    knowledge_type: str | None = None
    pending_confirm: bool | None = None
    min_quality: float | None = None
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)


class AuthorityChange(BaseModel):
    authority: Authority
    reason: str | None = None


# ── Search ────────────────────────────────────────────────────

class MemorySearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    namespace_id: UUID
    top_k: int = Field(default=5, ge=1, le=20)
    env_hint: str | None = None
    include_cold: bool = False


class MemorySearchHit(BaseModel):
    memory: MemoryRead
    score: float
    env_match: bool = True
    env_warning: str | None = None


class MemorySearchResponse(BaseModel):
    hits: list[MemorySearchHit]
    query_expanded: str | None = None
    total_recalled: int = 0


# ── AUDN result ───────────────────────────────────────────────

class AUDNResult(BaseModel):
    action: AUDNAction
    memory_id: UUID | None = None
    content: str | None = None
    reason: str = ""
    conflict_alert: bool = False
