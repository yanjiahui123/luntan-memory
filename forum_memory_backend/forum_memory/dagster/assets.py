"""Dagster ops/jobs for memory extraction."""

import logging
from uuid import UUID

from dagster import op, job, Config
from sqlmodel import Session

from forum_memory.database import engine
from forum_memory.models.event import DomainEvent
from forum_memory.services.extraction_service import run_extraction

logger = logging.getLogger(__name__)


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
