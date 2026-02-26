"""Feedback API routes."""

from uuid import UUID

from fastapi import APIRouter

from ..schemas.feedback import FeedbackCreate, FeedbackRead, FeedbackSummary
from .deps import FeedbackSvcDep, CurrentUserDep

router = APIRouter(prefix="/api/v1/memories/{memory_id}/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackRead, status_code=201)
async def submit_feedback(memory_id: UUID, data: FeedbackCreate, svc: FeedbackSvcDep, user_id: CurrentUserDep):
    feedback = await svc.submit(memory_id, data, user_id)
    await svc.check_auto_actions(memory_id)
    return feedback


@router.get("", response_model=list[FeedbackRead])
async def list_feedback(memory_id: UUID, svc: FeedbackSvcDep):
    return await svc.list_for_memory(memory_id)


@router.get("/summary", response_model=FeedbackSummary)
async def feedback_summary(memory_id: UUID, svc: FeedbackSvcDep):
    return await svc.get_summary(memory_id)
