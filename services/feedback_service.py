"""Feedback service — process user feedback on memories."""

from uuid import UUID

from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.feedback import MemoryFeedback
from ..models.memory import Memory
from ..models.enums import FeedbackType
from ..schemas.feedback import FeedbackCreate, FeedbackSummary
from ..core.quality import should_demote, should_recommend_promote
from ..config import get_settings


class FeedbackService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self._settings = get_settings()

    async def submit(self, memory_id: UUID, data: FeedbackCreate, user_id: UUID | None = None) -> MemoryFeedback:
        feedback = MemoryFeedback(memory_id=memory_id, user_id=user_id, **data.model_dump())
        self.session.add(feedback)
        await self._update_counters(memory_id, data.feedback_type)
        await self.session.commit()
        await self.session.refresh(feedback)
        return feedback

    async def get_summary(self, memory_id: UUID) -> FeedbackSummary:
        counts = await self._count_by_type(memory_id)
        total = counts.get("useful", 0) + counts.get("not_useful", 0)
        ratio = counts["useful"] / total if total > 0 else 0.0
        return FeedbackSummary(memory_id=memory_id, **counts, useful_ratio=ratio)

    async def check_auto_actions(self, memory_id: UUID) -> dict:
        """Check if feedback thresholds trigger automatic actions."""
        memory = await self.session.get(Memory, memory_id)
        if memory is None:
            return {}
        return self._evaluate_thresholds(memory)

    async def list_for_memory(self, memory_id: UUID) -> list[MemoryFeedback]:
        stmt = select(MemoryFeedback).where(MemoryFeedback.memory_id == memory_id)
        result = await self.session.exec(stmt)
        return list(result.all())

    # ── Private helpers ───────────────────────────────────────

    async def _update_counters(self, memory_id: UUID, fb_type: FeedbackType) -> None:
        memory = await self.session.get(Memory, memory_id)
        if memory is None:
            return
        _increment_counter(memory, fb_type)

    async def _count_by_type(self, memory_id: UUID) -> dict:
        result = {}
        for ft in FeedbackType:
            stmt = select(func.count()).where(
                MemoryFeedback.memory_id == memory_id,
                MemoryFeedback.feedback_type == ft,
            )
            count = await self.session.exec(stmt)
            result[ft.value] = count.first() or 0
        return result

    def _evaluate_thresholds(self, memory: Memory) -> dict:
        actions: dict = {}
        if should_demote(memory.wrong_count, self._settings.wrong_feedback_threshold):
            actions["demote"] = True
        total_fb = memory.useful_count + memory.not_useful_count
        if should_recommend_promote(memory.useful_count, total_fb, self._settings.promote_min_feedback, self._settings.promote_useful_ratio):
            actions["recommend_promote"] = True
        return actions


def _increment_counter(memory: Memory, fb_type: FeedbackType) -> None:
    """Pure mutation — increment the right counter on memory."""
    counter_map = {
        FeedbackType.USEFUL: "useful_count",
        FeedbackType.NOT_USEFUL: "not_useful_count",
        FeedbackType.WRONG: "wrong_count",
        FeedbackType.OUTDATED: "outdated_count",
    }
    attr = counter_map.get(fb_type)
    if attr:
        setattr(memory, attr, getattr(memory, attr) + 1)
