"""Pydantic schemas for feedback API."""

from uuid import UUID
from datetime import datetime

from pydantic import BaseModel

from ..models.enums import FeedbackType


class FeedbackCreate(BaseModel):
    feedback_type: FeedbackType
    comment: str | None = None
    thread_id: str | None = None


class FeedbackRead(BaseModel):
    id: UUID
    memory_id: UUID
    user_id: UUID | None
    feedback_type: FeedbackType
    comment: str | None
    thread_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FeedbackSummary(BaseModel):
    memory_id: UUID
    useful: int = 0
    not_useful: int = 0
    wrong: int = 0
    outdated: int = 0
    useful_ratio: float = 0.0
