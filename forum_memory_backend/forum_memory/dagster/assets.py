"""Dagster ops/jobs for memory extraction and lifecycle automation."""

import logging
from uuid import UUID

from dagster import op, job, graph, Config, RetryPolicy, Backoff
from sqlmodel import Session

from forum_memory.database import engine
from forum_memory.models.event import DomainEvent
from forum_memory.models.enums import ThreadStatus
from forum_memory.config import get_settings

logger = logging.getLogger(__name__)


# ── Extraction (5-step graph pipeline) ──────────────────

class ExtractConfig(Config):
    thread_id: str
    event_id: str


@op
def load_thread_discussion(config: ExtractConfig) -> dict:
    """Step 1: Load thread + comments and build discussion text."""
    from forum_memory.models.thread import Thread
    from forum_memory.services.extraction_service import _already_extracted, _build_discussion

    thread_id = UUID(config.thread_id)

    with Session(engine) as session:
        if _already_extracted(session, thread_id):
            logger.info("Thread %s already extracted, skipping", thread_id)
            return {"skip": True, "thread_id": config.thread_id, "event_id": config.event_id}

        thread = session.get(Thread, thread_id)
        if not thread:
            raise ValueError(f"Thread {thread_id} not found")
        if thread.status not in (ThreadStatus.RESOLVED, ThreadStatus.TIMEOUT_CLOSED):
            raise ValueError(
                f"Thread {thread_id} is in {thread.status} state, "
                f"expected RESOLVED or TIMEOUT_CLOSED"
            )

        discussion = _build_discussion(session, thread_id)
        return {
            "skip": False,
            "thread_id": config.thread_id,
            "event_id": config.event_id,
            "title": thread.title,
            "content": thread.content,
            "discussion": discussion,
            "namespace_id": str(thread.namespace_id),
            "environment": thread.environment,
            "resolved_type": thread.resolved_type.value if thread.resolved_type else None,
            "best_answer_id": str(thread.best_answer_id) if thread.best_answer_id else None,
        }


@op
def compress_discussion(context_data: dict) -> dict:
    """Step 2: Compress discussion if > 3000 chars."""
    if context_data.get("skip"):
        return context_data

    from forum_memory.core.extraction import build_compress_messages
    from forum_memory.providers import get_provider

    discussion = context_data["discussion"]
    if len(discussion) < 3000:
        context_data["compressed"] = discussion
        logger.info("Discussion < 3000 chars, no compression needed")
    else:
        llm = get_provider()
        msgs = build_compress_messages(context_data["title"], discussion)
        context_data["compressed"] = llm.complete(msgs)
        logger.info("Compressed discussion from %d to %d chars", len(discussion), len(context_data["compressed"]))
    return context_data


@op
def extract_facts(context_data: dict) -> dict:
    """Step 3: Extract atomic facts from the compressed discussion."""
    if context_data.get("skip"):
        return context_data

    from forum_memory.core.extraction import build_extract_messages, parse_extracted_facts
    from forum_memory.providers import get_provider

    llm = get_provider()
    msgs = build_extract_messages(
        context_data["title"],
        context_data["content"],
        context_data["compressed"],
    )
    raw = llm.complete(msgs)
    facts = parse_extracted_facts(raw)
    context_data["facts"] = facts
    logger.info("Extracted %d facts from thread %s", len(facts), context_data["thread_id"])
    return context_data


@op
def process_facts_audn(context_data: dict) -> dict:
    """Step 4: For each fact — find similar memories, run AUDN decision, persist."""
    if context_data.get("skip"):
        return context_data

    from forum_memory.models.thread import Thread
    from forum_memory.services.extraction_service import _create_record, _process_one_fact
    from forum_memory.core.state_machine import default_authority, needs_human_confirm
    from forum_memory.models.enums import ExtractionStatus
    from forum_memory.providers import get_provider

    thread_id = UUID(context_data["thread_id"])

    with Session(engine) as session:
        thread = session.get(Thread, thread_id)
        record = _create_record(session, thread)
        llm = get_provider()
        authority = default_authority(thread.resolved_type)
        pending = needs_human_confirm(thread.resolved_type)
        memory_ids = []

        for i, fact in enumerate(context_data.get("facts", [])):
            mid = _process_one_fact(session, llm, thread, fact, authority, pending)
            if mid:
                memory_ids.append(str(mid))
            logger.info("  Fact %d/%d: AUDN -> %s",
                        i + 1, len(context_data["facts"]),
                        "created" if mid else "skipped")

        record.status = ExtractionStatus.COMPLETED
        record.memory_ids_created = ",".join(memory_ids)
        session.commit()

    context_data["memory_ids"] = memory_ids
    logger.info("AUDN processed %d facts, created %d memories",
                len(context_data.get("facts", [])), len(memory_ids))
    return context_data


@op
def finalize_extraction(context_data: dict):
    """Step 5: Mark the domain event as processed."""
    event_id = UUID(context_data["event_id"])

    with Session(engine) as session:
        event = session.get(DomainEvent, event_id)
        if event:
            event.processed = True
            session.commit()

    if context_data.get("skip"):
        logger.info("Thread %s already extracted, skipped", context_data["thread_id"])
    else:
        memory_count = len(context_data.get("memory_ids", []))
        logger.info("Extraction finalized: %d memories from thread %s",
                     memory_count, context_data["thread_id"])


@graph
def extract_memories_graph():
    ctx = load_thread_discussion()
    compressed = compress_discussion(ctx)
    with_facts = extract_facts(compressed)
    processed = process_facts_audn(with_facts)
    finalize_extraction(processed)


extract_memories_job = extract_memories_graph.to_job(name="extract_memories_job")


# ── AI Auto-Answer ──────────────────────────────────────

class AIAnswerConfig(Config):
    thread_id: str
    event_id: str


@op(retry_policy=RetryPolicy(max_retries=3, delay=30, backoff=Backoff.EXPONENTIAL))
def auto_ai_answer(config: AIAnswerConfig):
    """Generate an AI answer for a newly created thread.

    Retry policy: up to 3 retries with exponential backoff (30s, 60s, 120s)
    to handle transient LLM API failures. The event is only marked as
    processed on success, so persistent failures remain visible and
    recoverable.
    """
    from forum_memory.models.thread import Comment
    from forum_memory.services.thread_service import generate_ai_answer
    from sqlmodel import select

    thread_id = UUID(config.thread_id)
    event_id = UUID(config.event_id)

    with Session(engine) as session:
        # ── Idempotency: skip if an AI comment already exists ──
        existing_ai = session.exec(
            select(Comment).where(
                Comment.thread_id == thread_id,
                Comment.is_ai == True,  # noqa: E712
            )
        ).first()

        if existing_ai:
            logger.info(
                "AI answer already exists for thread %s (comment %s), skipping generation",
                thread_id, existing_ai.id,
            )
        else:
            comment = generate_ai_answer(session, thread_id)
            logger.info(
                "Auto AI answer created for thread %s (comment %s)",
                thread_id, comment.id,
            )

        # ── Mark event processed only on success ──
        event = session.get(DomainEvent, event_id)
        if event:
            event.processed = True
            session.commit()


@job
def auto_ai_answer_job():
    auto_ai_answer()


# ── Thread Timeout ───────────────────────────────────────

@op
def timeout_threads_op():
    """Batch timeout-close OPEN threads past the configured timeout."""
    from forum_memory.services.thread_service import batch_timeout_threads
    settings = get_settings()
    with Session(engine) as session:
        count = batch_timeout_threads(session, settings.thread_timeout_days)
        logger.info("Timeout-closed %d threads", count)


@job
def timeout_threads_job():
    timeout_threads_op()


# ── Memory Lifecycle ─────────────────────────────────────

@op
def lifecycle_memories_op():
    """Transition inactive memories: ACTIVE→COLD, COLD→ARCHIVED."""
    from forum_memory.services.memory_service import transition_cold_memories, transition_archived_memories
    settings = get_settings()
    with Session(engine) as session:
        cold_count = transition_cold_memories(session, settings.cold_inactive_days)
        archive_count = transition_archived_memories(session, settings.archive_inactive_days)
        logger.info("Lifecycle: %d→COLD, %d→ARCHIVED", cold_count, archive_count)


@job
def lifecycle_memories_job():
    lifecycle_memories_op()


# ── Quality Refresh ──────────────────────────────────────

@op
def refresh_quality_op():
    """Refresh quality scores for all ACTIVE memories."""
    from forum_memory.services.memory_service import bulk_refresh_quality
    with Session(engine) as session:
        count = bulk_refresh_quality(session)
        logger.info("Refreshed quality for %d memories", count)


@job
def refresh_quality_job():
    refresh_quality_op()
