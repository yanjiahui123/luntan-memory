"""Pydantic schemas for namespace (board) API."""

from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field


class NamespaceCreate(BaseModel):
    name: str = Field(max_length=200)
    display_name: str = Field(max_length=200)
    description: str | None = None
    access_mode: str = "public"
    config: dict = Field(default_factory=dict)
    dictionary: dict = Field(default_factory=dict)


class NamespaceUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    access_mode: str | None = None
    config: dict | None = None


class NamespaceRead(BaseModel):
    id: UUID
    name: str
    display_name: str
    description: str | None
    owner_id: UUID
    access_mode: str
    config: dict
    dictionary: dict
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class DictionaryUpdate(BaseModel):
    """Update slang/alias dictionary for query preprocessing."""
    entries: dict[str, str] = Field(
        description="Mapping of slang term to canonical term",
        examples=[{"天启": "支付网关 payment-gateway"}],
    )


class NamespaceStats(BaseModel):
    total_memories: int = 0
    active_memories: int = 0
    locked_memories: int = 0
    pending_confirm: int = 0
    total_threads: int = 0
    resolved_threads: int = 0
    ai_resolve_rate: float = 0.0
