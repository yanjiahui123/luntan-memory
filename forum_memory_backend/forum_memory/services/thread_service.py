"""Thread and comment service — sync."""

from uuid import UUID
from datetime import datetime, timezone

from sqlmodel import Session, select

from forum_memory.models.thread import Thread, Comment
from forum_memory.models.event import DomainEvent
from forum_memory.models.enums import ThreadStatus, ResolvedType
from forum_memory.core.state_machine import can_transition
from forum_memory.schemas.thread import ThreadCreate, CommentCreate


def list_threads(
    session: Session,
    namespace_id: UUID | None = None,
    status: str | None = None,
    page: int = 1,
    size: int = 20,
) -> list[Thread]:
    stmt = select(Thread).order_by(Thread.created_at.desc())
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
