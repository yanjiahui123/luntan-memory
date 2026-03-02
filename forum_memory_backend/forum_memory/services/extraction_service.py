"""Extraction orchestrator — sync.

Pipeline: idempotent guard → compress → extract facts → AUDN per fact → persist.
"""

import logging
from uuid import UUID

from sqlmodel import Session, select

from forum_memory.models.thread import Thread, Comment
from forum_memory.models.extraction import ExtractionRecord
from forum_memory.models.enums import ExtractionStatus, MemoryStatus
from forum_memory.core.state_machine import default_authority, needs_human_confirm
from forum_memory.core.extraction import build_compress_messages, build_extract_messages, parse_extracted_facts
from forum_memory.core.audn import build_audn_messages, parse_audn_response
from forum_memory.schemas.memory import MemoryCreate
from forum_memory.services.memory_service import apply_audn
from forum_memory.services.search_service import find_similar
from forum_memory.providers import get_provider

logger = logging.getLogger(__name__)


def re_extract(session: Session, thread_id: UUID) -> list[UUID]:
    """Clear old extraction record and re-run extraction pipeline.
    Marks old memories from this thread as DELETED, then re-extracts."""
    from forum_memory.models.memory import Memory
    from forum_memory.services import es_service

    # 1. Delete old extraction record
    stmt = select(ExtractionRecord).where(ExtractionRecord.thread_id == thread_id)
    old_records = list(session.exec(stmt).all())
    for rec in old_records:
        session.delete(rec)

    # 2. Soft-delete old memories sourced from this thread
    mem_stmt = select(Memory).where(Memory.source_id == thread_id, Memory.status != MemoryStatus.DELETED)
    old_memories = list(session.exec(mem_stmt).all())
    for m in old_memories:
        m.status = MemoryStatus.DELETED
        es_service.delete_memory_doc(m.id)

    session.commit()

    # 3. Re-run extraction
    return run_extraction(session, thread_id)


def run_extraction(session: Session, thread_id: UUID) -> list[UUID]:
    """Run full extraction pipeline for a resolved thread. Returns created memory IDs."""
    if _already_extracted(session, thread_id):
        logger.info("Thread %s already extracted, skipping", thread_id)
        return []

    thread = session.get(Thread, thread_id)
    if not thread or not thread.resolved_type:
        raise ValueError("Thread not found or not resolved")

    record = _create_record(session, thread)
    try:
        memory_ids = _execute_pipeline(session, thread, record)
        record.status = ExtractionStatus.COMPLETED
        record.memory_ids_created = ",".join(str(mid) for mid in memory_ids)
        session.commit()
        return memory_ids
    except Exception as e:
        record.status = ExtractionStatus.FAILED
        record.error_message = str(e)[:500]
        session.commit()
        raise


def _already_extracted(session: Session, thread_id: UUID) -> bool:
    stmt = select(ExtractionRecord).where(ExtractionRecord.thread_id == thread_id)
    return session.exec(stmt).first() is not None


def _create_record(session: Session, thread: Thread) -> ExtractionRecord:
    record = ExtractionRecord(
        thread_id=thread.id,
        namespace_id=thread.namespace_id,
        status=ExtractionStatus.IN_PROGRESS,
    )
    session.add(record)
    session.commit()
    return record


def _execute_pipeline(session: Session, thread: Thread, record: ExtractionRecord) -> list[UUID]:
    """Compress → extract → AUDN → persist."""
    llm = get_provider()
    discussion = _build_discussion(session, thread.id)
    compressed = _maybe_compress(llm, thread.title, discussion)
    facts = _extract_facts(llm, thread.title, thread.content, compressed)

    authority = default_authority(thread.resolved_type)
    pending = needs_human_confirm(thread.resolved_type)
    memory_ids = []

    for fact in facts:
        mid = _process_one_fact(session, llm, thread, fact, authority, pending)
        if mid:
            memory_ids.append(mid)

    return memory_ids


def _build_discussion(session: Session, thread_id: UUID) -> str:
    stmt = select(Comment).where(Comment.thread_id == thread_id).order_by(Comment.created_at)
    comments = list(session.exec(stmt).all())
    parts = []
    for c in comments:
        role = "AI" if c.is_ai else c.author_role
        best = " [BEST]" if c.is_best_answer else ""
        parts.append(f"[{role}{best}]: {c.content}")
    return "\n\n".join(parts)


def _maybe_compress(llm, title: str, discussion: str) -> str:
    if len(discussion) < 3000:
        return discussion
    msgs = build_compress_messages(title, discussion)
    return llm.complete(msgs)


def _extract_facts(llm, title: str, question: str, discussion: str) -> list[dict]:
    msgs = build_extract_messages(title, question, discussion)
    raw = llm.complete(msgs)
    return parse_extracted_facts(raw)


def _process_one_fact(session, llm, thread, fact, authority, pending) -> UUID | None:
    similar = find_similar(session, thread.namespace_id, fact["content"])
    msgs = build_audn_messages(fact["content"], similar)
    raw = llm.complete(msgs)
    result = parse_audn_response(raw)

    # Retry once if LLM returned unparseable output
    if result.action.value == "NONE" and "parse_error" in result.reason:
        logger.info("AUDN parse failed for thread %s, retrying once...", thread.id)
        raw = llm.complete(msgs)
        result = parse_audn_response(raw)

    data = MemoryCreate(
        namespace_id=thread.namespace_id,
        content=fact["content"],
        knowledge_type=fact.get("knowledge_type"),
        tags=fact.get("tags"),
        environment=thread.environment,
        source_type="thread",
        source_id=thread.id,
        source_role=_best_answer_role(session, thread),
        resolved_type=thread.resolved_type,
    )

    memory = apply_audn(session, data, result)
    if memory:
        memory.authority = authority
        memory.pending_human_confirm = pending
        session.commit()
        return memory.id
    return None


def _best_answer_role(session: Session, thread: Thread) -> str:
    if not thread.best_answer_id:
        return "unknown"
    comment = session.get(Comment, thread.best_answer_id)
    return comment.author_role if comment else "unknown"
