"""Feedback service — sync."""

from uuid import UUID

from sqlmodel import Session, select, func

from forum_memory.models.feedback import Feedback
from forum_memory.models.memory import Memory
from forum_memory.models.enums import FeedbackType
from forum_memory.schemas.feedback import FeedbackCreate, FeedbackSummary
from forum_memory.services.memory_service import refresh_quality


def submit_feedback(session: Session, memory_id: UUID, data: FeedbackCreate, user_id: UUID | None = None) -> Feedback:
    fb = Feedback(
        memory_id=memory_id,
        user_id=user_id,
        feedback_type=FeedbackType(data.feedback_type),
        comment=data.comment,
    )
    session.add(fb)
    _update_counter(session, memory_id, data.feedback_type)
    session.commit()
    session.refresh(fb)
    refresh_quality(session, memory_id)
    return fb


def list_feedback(session: Session, memory_id: UUID) -> list[Feedback]:
    stmt = select(Feedback).where(Feedback.memory_id == memory_id).order_by(Feedback.created_at.desc())
    return list(session.exec(stmt).all())


def get_summary(session: Session, memory_id: UUID) -> FeedbackSummary:
    counts = {}
    for ft in FeedbackType:
        stmt = select(func.count()).select_from(Feedback).where(
            Feedback.memory_id == memory_id, Feedback.feedback_type == ft
        )
        counts[ft.value] = session.exec(stmt).one()

    total = sum(counts.values())
    useful = counts.get("useful", 0)
    ratio = useful / total if total > 0 else 0.0

    return FeedbackSummary(
        useful=useful,
        not_useful=counts.get("not_useful", 0),
        wrong=counts.get("wrong", 0),
        outdated=counts.get("outdated", 0),
        total=total,
        useful_ratio=round(ratio, 4),
    )


def _update_counter(session: Session, memory_id: UUID, feedback_type: str) -> None:
    memory = session.get(Memory, memory_id)
    if not memory:
        return
    counter_map = {
        "useful": "useful_count",
        "not_useful": "not_useful_count",
        "wrong": "wrong_count",
        "outdated": "outdated_count",
    }
    attr = counter_map.get(feedback_type)
    if attr:
        setattr(memory, attr, getattr(memory, attr) + 1)
