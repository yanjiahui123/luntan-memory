"""Dagster ops/jobs for memory extraction and lifecycle automation."""

import logging
from uuid import UUID

from dagster import op, job, Config
from sqlmodel import Session

from forum_memory.database import engine
from forum_memory.models.event import DomainEvent
from forum_memory.services.extraction_service import run_extraction
from forum_memory.config import get_settings

logger = logging.getLogger(__name__)


# ── Extraction ───────────────────────────────────────────

class ExtractConfig(Config):
    thread_id: str
    event_id: str


@op
def extract_memories_from_thread(config: ExtractConfig):
    """Extract memories from a resolved thread and mark the event as processed."""
    thread_id = UUID(config.thread_id)
    event_id = UUID(config.event_id)

    with Session(engine) as session:
        try:
            memory_ids = run_extraction(session, thread_id)
            logger.info(
                "Extracted %d memories from thread %s",
                len(memory_ids), thread_id,
            )
        except Exception:
            logger.exception("Extraction failed for thread %s", thread_id)
            raise
        finally:
            # Mark event as processed regardless of outcome
            # (extraction_service has its own idempotency guard)
            event = session.get(DomainEvent, event_id)
            if event:
                event.processed = True
                session.commit()


@job
def extract_memories_job():
    extract_memories_from_thread()


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
