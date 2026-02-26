"""Extraction orchestrator — coordinates the full memory extraction pipeline."""

from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.thread import Thread, Comment
from ..models.extraction import ExtractionRecord
from ..models.enums import ExtractionStatus, ResolvedType
from ..providers.base import LLMProvider
from ..core.extraction import compress_if_needed, extract_facts, process_facts
from ..core.state_machine import resolve_authority, needs_human_confirm
from ..services.memory_service import MemoryService
from ..services.search_service import SearchService


class ExtractionOrchestrator:
    """Runs the 5-step extraction pipeline for a single thread."""

    def __init__(self, session: AsyncSession, llm: LLMProvider, search: SearchService):
        self.session = session
        self.llm = llm
        self.search = search
        self.memory_svc = MemoryService(session)

    async def run(self, thread_id: UUID) -> list[UUID]:
        """Execute full pipeline. Returns created/updated memory IDs."""
        if await self._already_processed(str(thread_id)):
            return []
        await self._mark_in_progress(str(thread_id))
        try:
            return await self._execute_pipeline(thread_id)
        except Exception as e:
            await self._mark_failed(str(thread_id), str(e))
            raise

    # ── Pipeline steps ────────────────────────────────────────

    async def _execute_pipeline(self, thread_id: UUID) -> list[UUID]:
        thread, messages = await self._load_thread(thread_id)
        compressed = await compress_if_needed(messages, self.llm)
        facts = await self._extract(thread, compressed)
        results = await process_facts(facts, self._similarity_fn(thread.namespace_id), self.llm)
        memory_ids = await self._write_results(results, thread)
        await self._mark_completed(str(thread_id), memory_ids)
        return memory_ids

    async def _load_thread(self, thread_id: UUID) -> tuple[Thread, list[dict]]:
        from sqlmodel import select
        thread = await self.session.get(Thread, thread_id)
        if thread is None:
            raise ValueError(f"Thread {thread_id} not found")
        comments = await self.session.exec(
            select(Comment).where(Comment.thread_id == thread_id).order_by(Comment.created_at)
        )
        messages = _build_messages(thread, list(comments.all()))
        return thread, messages

    async def _extract(self, thread: Thread, compressed: str) -> list[str]:
        best = await self._get_best_answer(thread)
        return await extract_facts(
            content=compressed,
            title=thread.title,
            resolved_type=thread.resolved_type.value if thread.resolved_type else "timeout",
            source_role=best.author_role if best else "ai",
            tags=thread.tags,
            environment=thread.environment,
            llm=self.llm,
        )

    async def _write_results(self, results, thread: Thread) -> list[UUID]:
        ids = []
        metadata = _build_metadata(thread)
        for r in results:
            memory = await self.memory_svc.apply_audn(r, thread.namespace_id, metadata)
            if memory:
                ids.append(memory.id)
        return ids

    # ── Helpers (each ≤ 5 lines) ──────────────────────────────

    def _similarity_fn(self, namespace_id: UUID):
        async def fn(text: str) -> list[dict]:
            return await self.search.find_similar(text, namespace_id)
        return fn

    async def _get_best_answer(self, thread: Thread) -> Comment | None:
        if thread.best_answer_id is None:
            return None
        return await self.session.get(Comment, thread.best_answer_id)

    async def _already_processed(self, thread_id: str) -> bool:
        record = await self.session.get(ExtractionRecord, thread_id)
        return record is not None and record.status == ExtractionStatus.COMPLETED

    async def _mark_in_progress(self, thread_id: str) -> None:
        record = ExtractionRecord(thread_id=thread_id, status=ExtractionStatus.IN_PROGRESS)
        self.session.add(record)
        await self.session.commit()

    async def _mark_completed(self, thread_id: str, memory_ids: list[UUID]) -> None:
        record = await self.session.get(ExtractionRecord, thread_id)
        if record:
            record.status = ExtractionStatus.COMPLETED
            record.processed_at = datetime.now(timezone.utc)
            record.memory_ids = [str(mid) for mid in memory_ids]
        await self.session.commit()

    async def _mark_failed(self, thread_id: str, error: str) -> None:
        record = await self.session.get(ExtractionRecord, thread_id)
        if record:
            record.status = ExtractionStatus.FAILED
            record.error_message = error
        await self.session.commit()


# ── Pure functions ────────────────────────────────────────────

def _build_messages(thread: Thread, comments: list[Comment]) -> list[dict]:
    msgs = [{"role": "poster", "content": f"[Title] {thread.title}\n{thread.content}"}]
    for c in comments:
        msgs.append({"role": c.author_role, "content": c.content})
    return msgs


def _build_metadata(thread: Thread) -> dict:
    rt = thread.resolved_type or ResolvedType.TIMEOUT
    return {
        "source_id": str(thread.id),
        "source_role": "ai" if rt == ResolvedType.AI_RESOLVED else "commenter",
        "resolved_type": rt.value,
        "authority": resolve_authority(rt).value,
        "tags": thread.tags,
        "environment": thread.environment,
        "pending_human_confirm": needs_human_confirm(rt),
    }
