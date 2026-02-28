"""Thread and comment service — sync."""

import logging
from uuid import UUID
from datetime import datetime, timezone, timedelta

from sqlmodel import Session, select

from forum_memory.models.thread import Thread, Comment
from forum_memory.models.event import DomainEvent
from forum_memory.models.enums import ThreadStatus, ResolvedType
from forum_memory.core.state_machine import can_transition
from forum_memory.schemas.thread import ThreadCreate, CommentCreate
from forum_memory.schemas.memory import MemorySearchRequest
from forum_memory.core.prompts import AI_ANSWER_SYSTEM, AI_ANSWER_USER

logger = logging.getLogger(__name__)


def list_threads(
    session: Session,
    namespace_id: UUID | None = None,
    status: str | None = None,
    page: int = 1,
    size: int = 20,
) -> list[Thread]:
    stmt = select(Thread).where(Thread.status != ThreadStatus.DELETED).order_by(Thread.created_at.desc())
    if namespace_id:
        stmt = stmt.where(Thread.namespace_id == namespace_id)
    if status:
        stmt = stmt.where(Thread.status == status)
    stmt = stmt.offset((page - 1) * size).limit(size)
    return list(session.exec(stmt).all())


def get_thread(session: Session, thread_id: UUID) -> Thread | None:
    return session.get(Thread, thread_id)


def create_thread(session: Session, data: ThreadCreate, author_id: UUID) -> Thread:
    thread = Thread(
        namespace_id=data.namespace_id,
        author_id=author_id,
        title=data.title,
        content=data.content,
        tags=data.tags,
        knowledge_type=data.knowledge_type,
        environment=data.environment,
        priority=data.priority,
    )
    session.add(thread)
    session.commit()
    session.refresh(thread)
    _emit_event(session, "thread.created", "Thread", thread.id, thread.namespace_id)
    return thread


def resolve_thread(session: Session, thread_id: UUID, best_answer_id: UUID | None = None) -> Thread:
    thread = session.get(Thread, thread_id)
    if not thread:
        raise ValueError("Thread not found")
    if not can_transition(thread.status, ThreadStatus.RESOLVED):
        raise ValueError(f"Cannot resolve thread in {thread.status} state")

    resolved_type = _determine_resolved_type(session, best_answer_id)
    thread.status = ThreadStatus.RESOLVED
    thread.resolved_type = resolved_type
    thread.best_answer_id = best_answer_id
    thread.resolved_at = datetime.now(timezone.utc)

    if best_answer_id:
        _mark_best_answer(session, best_answer_id)

    session.commit()
    session.refresh(thread)
    _emit_event(session, "thread.resolved", "Thread", thread.id, thread.namespace_id, {"resolved_type": resolved_type.value})
    return thread


def timeout_close_thread(session: Session, thread_id: UUID) -> Thread:
    thread = session.get(Thread, thread_id)
    if not thread:
        raise ValueError("Thread not found")
    if not can_transition(thread.status, ThreadStatus.TIMEOUT_CLOSED):
        raise ValueError(f"Cannot timeout-close thread in {thread.status} state")

    thread.status = ThreadStatus.TIMEOUT_CLOSED
    thread.resolved_type = ResolvedType.TIMEOUT
    thread.timeout_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(thread)
    _emit_event(session, "thread.timeout_closed", "Thread", thread.id, thread.namespace_id)
    return thread


def delete_thread(session: Session, thread_id: UUID) -> Thread:
    """Soft-delete a thread (admin only)."""
    thread = session.get(Thread, thread_id)
    if not thread:
        raise ValueError("Thread not found")
    if not can_transition(thread.status, ThreadStatus.DELETED):
        raise ValueError(f"Cannot delete thread in {thread.status} state")
    thread.status = ThreadStatus.DELETED
    session.commit()
    session.refresh(thread)
    _emit_event(session, "thread.deleted", "Thread", thread.id, thread.namespace_id)
    return thread


def list_comments(session: Session, thread_id: UUID) -> list[Comment]:
    stmt = select(Comment).where(Comment.thread_id == thread_id).order_by(Comment.created_at)
    return list(session.exec(stmt).all())


def add_comment(session: Session, data: CommentCreate, author_id: UUID | None, is_ai: bool = False, author_role: str = "commenter") -> Comment:
    comment = Comment(
        thread_id=data.thread_id,
        author_id=author_id,
        content=data.content,
        is_ai=is_ai,
        author_role=author_role,
    )
    session.add(comment)
    _increment_comment_count(session, data.thread_id)
    session.commit()
    session.refresh(comment)
    return comment


def _determine_resolved_type(session: Session, best_answer_id: UUID | None) -> ResolvedType:
    if not best_answer_id:
        return ResolvedType.HUMAN_RESOLVED
    comment = session.get(Comment, best_answer_id)
    if comment and comment.is_ai:
        return ResolvedType.AI_RESOLVED
    return ResolvedType.HUMAN_RESOLVED


def _mark_best_answer(session: Session, comment_id: UUID) -> None:
    comment = session.get(Comment, comment_id)
    if comment:
        comment.is_best_answer = True


def upvote_comment(session: Session, comment_id: UUID) -> Comment:
    """Increment the upvote count on a comment."""
    comment = session.get(Comment, comment_id)
    if not comment:
        raise ValueError("Comment not found")
    comment.upvote_count += 1
    session.commit()
    session.refresh(comment)
    return comment


def generate_ai_answer(session: Session, thread_id: UUID) -> Comment:
    """Search memories and generate an AI answer for a thread."""
    from forum_memory.services.search_service import search_memories
    from forum_memory.providers import get_provider

    thread = session.get(Thread, thread_id)
    if not thread:
        raise ValueError("Thread not found")

    # Search related memories
    search_req = MemorySearchRequest(
        query=f"{thread.title}\n{thread.content}",
        namespace_id=thread.namespace_id,
        top_k=5,
    )
    search_result = search_memories(session, search_req)

    # Build memory context for prompt
    if search_result.hits:
        memories_text = "\n\n".join(
            f"[M-{str(h.memory.id)[:8]}] {h.memory.content}"
            for h in search_result.hits
        )
        cited_ids = [h.memory.id for h in search_result.hits]
    else:
        memories_text = "(no relevant memories found)"
        cited_ids = []

    # Generate answer via LLM
    provider = get_provider()
    answer = provider.complete([
        {"role": "system", "content": AI_ANSWER_SYSTEM},
        {"role": "user", "content": AI_ANSWER_USER.format(
            question=f"{thread.title}\n{thread.content}",
            memories=memories_text,
        )},
    ])

    # Create AI comment
    comment = Comment(
        thread_id=thread_id,
        author_id=None,
        content=answer,
        is_ai=True,
        author_role="ai",
        cited_memory_ids=[str(mid) for mid in cited_ids],
    )
    session.add(comment)
    _increment_comment_count(session, thread_id)
    session.commit()
    session.refresh(comment)
    return comment


def batch_timeout_threads(session: Session, timeout_days: int = 7) -> int:
    """Batch timeout-close OPEN threads older than timeout_days. Returns count closed."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=timeout_days)
    stmt = (
        select(Thread)
        .where(Thread.status == ThreadStatus.OPEN)
        .where(Thread.created_at < cutoff)
    )
    threads = list(session.exec(stmt).all())
    count = 0
    for t in threads:
        try:
            timeout_close_thread(session, t.id)
            count += 1
        except ValueError:
            logger.warning("Cannot timeout-close thread %s, skipping", t.id)
    logger.info("Batch timeout-closed %d threads", count)
    return count


def _increment_comment_count(session: Session, thread_id: UUID) -> None:
    thread = session.get(Thread, thread_id)
    if thread:
        thread.comment_count += 1


def _emit_event(session: Session, event_type: str, agg_type: str, agg_id: UUID, ns_id: UUID, payload: dict | None = None) -> None:
    event = DomainEvent(
        event_type=event_type,
        aggregate_type=agg_type,
        aggregate_id=agg_id,
        namespace_id=ns_id,
        payload=payload or {},
    )
    session.add(event)
    session.commit()
