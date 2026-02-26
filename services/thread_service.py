"""Thread (post) service — business logic."""

from uuid import UUID
from datetime import datetime, timezone

from sqlmodel import select, col
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.thread import Thread, Comment
from ..models.event import ThreadEvent
from ..models.enums import ThreadStatus, ResolvedType, UserRole
from ..schemas.thread import ThreadCreate, ThreadListParams
from ..core.state_machine import validate_transition, determine_resolved_type


class ThreadService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, data: ThreadCreate, author_id: UUID) -> Thread:
        thread = Thread(**data.model_dump(), author_id=author_id)
        self.session.add(thread)
        await self.session.commit()
        await self.session.refresh(thread)
        return thread

    async def get(self, thread_id: UUID) -> Thread | None:
        return await self.session.get(Thread, thread_id)

    async def list(self, params: ThreadListParams) -> list[Thread]:
        stmt = self._build_list_query(params)
        result = await self.session.exec(stmt)
        return list(result.all())

    async def resolve(self, thread_id: UUID, best_answer_id: UUID) -> Thread:
        """Mark thread as RESOLVED by poster selecting a best answer."""
        thread = await self._get_or_raise(thread_id)
        comment = await self._get_comment_or_raise(best_answer_id)
        resolved_type = determine_resolved_type(comment.is_ai, comment.author_role == "admin")
        return await self._transition_to_resolved(thread, comment, resolved_type)

    async def timeout_close(self, thread_id: UUID) -> Thread:
        """System auto-close after timeout."""
        thread = await self._get_or_raise(thread_id)
        validate_transition(thread.status, ThreadStatus.TIMEOUT_CLOSED)
        return await self._apply_timeout(thread)

    async def add_comment(self, thread_id: UUID, content: str, author_id: UUID, role: str = "commenter") -> Comment:
        comment = Comment(
            thread_id=thread_id, author_id=author_id,
            content=content, author_role=role, is_ai=False,
        )
        return await self._save_comment(comment)

    async def add_ai_comment(self, thread_id: UUID, content: str, cited_ids: list[str] | None = None) -> Comment:
        comment = Comment(
            thread_id=thread_id, content=content,
            author_role="ai", is_ai=True, cited_memory_ids=cited_ids,
        )
        return await self._save_comment(comment)

    async def get_comments(self, thread_id: UUID) -> list[Comment]:
        stmt = select(Comment).where(Comment.thread_id == thread_id).order_by(Comment.created_at)
        result = await self.session.exec(stmt)
        return list(result.all())

    # ── Private helpers (each ≤ 5 lines) ──────────────────────

    async def _get_or_raise(self, thread_id: UUID) -> Thread:
        thread = await self.get(thread_id)
        if thread is None:
            raise ValueError(f"Thread {thread_id} not found")
        return thread

    async def _get_comment_or_raise(self, comment_id: UUID) -> Comment:
        comment = await self.session.get(Comment, comment_id)
        if comment is None:
            raise ValueError(f"Comment {comment_id} not found")
        return comment

    async def _transition_to_resolved(self, thread: Thread, comment: Comment, rt: ResolvedType) -> Thread:
        validate_transition(thread.status, ThreadStatus.RESOLVED)
        thread.status = ThreadStatus.RESOLVED
        thread.resolved_type = rt
        thread.best_answer_id = comment.id
        thread.resolved_at = datetime.now(timezone.utc)
        comment.is_best_answer = True
        await self._emit_event(thread)
        await self.session.commit()
        return thread

    async def _apply_timeout(self, thread: Thread) -> Thread:
        thread.status = ThreadStatus.TIMEOUT_CLOSED
        thread.resolved_type = ResolvedType.TIMEOUT
        thread.timeout_at = datetime.now(timezone.utc)
        await self._emit_event(thread)
        await self.session.commit()
        return thread

    async def _emit_event(self, thread: Thread) -> None:
        event = ThreadEvent(
            thread_id=thread.id, namespace_id=thread.namespace_id,
            status=thread.status, resolved_type=thread.resolved_type,
            best_answer_id=thread.best_answer_id,
        )
        self.session.add(event)

    async def _save_comment(self, comment: Comment) -> Comment:
        self.session.add(comment)
        await self.session.commit()
        await self.session.refresh(comment)
        return comment

    def _build_list_query(self, params: ThreadListParams):
        stmt = select(Thread).order_by(col(Thread.created_at).desc())
        if params.namespace_id:
            stmt = stmt.where(Thread.namespace_id == params.namespace_id)
        if params.status:
            stmt = stmt.where(Thread.status == params.status)
        offset = (params.page - 1) * params.size
        return stmt.offset(offset).limit(params.size)
