"""Dagster sensors — event polling and scheduled lifecycle tasks."""

import logging

from dagster import sensor, RunRequest, SensorEvaluationContext, SkipReason
from sqlmodel import Session, select

from forum_memory.database import engine
from forum_memory.models.event import DomainEvent

logger = logging.getLogger(__name__)


# ── Event-driven: thread.resolved → extract memories ─────

@sensor(job_name="extract_memories_job", minimum_interval_seconds=30)
def thread_resolved_sensor(context: SensorEvaluationContext):
    """Poll for unprocessed thread.resolved events and trigger extraction."""
    with Session(engine) as session:
        stmt = (
            select(DomainEvent)
            .where(
                DomainEvent.event_type == "thread.resolved",
                DomainEvent.processed == False,  # noqa: E712
            )
            .order_by(DomainEvent.created_at)
            .limit(20)
        )
        events = list(session.exec(stmt).all())

        if not events:
            yield SkipReason("No unprocessed thread.resolved events")
            return

        for event in events:
            thread_id = str(event.aggregate_id)
            logger.info("Triggering extraction for thread %s (event %s)", thread_id, event.id)
            yield RunRequest(
                run_key=f"extract-{event.id}",
                run_config={
                    "ops": {
                        "extract_memories_from_thread": {
                            "config": {
                                "thread_id": thread_id,
                                "event_id": str(event.id),
                            }
                        }
                    }
                },
            )


# ── Scheduled: thread timeout (every hour) ───────────────

@sensor(job_name="timeout_threads_job", minimum_interval_seconds=3600)
def thread_timeout_sensor(context: SensorEvaluationContext):
    """Periodically trigger thread timeout-close check."""
    yield RunRequest(run_key=f"timeout-{context.cursor or '0'}")
    context.update_cursor(str(int(context.cursor or '0') + 1))


# ── Scheduled: memory lifecycle (daily) ──────────────────

@sensor(job_name="lifecycle_memories_job", minimum_interval_seconds=86400)
def memory_lifecycle_sensor(context: SensorEvaluationContext):
    """Daily trigger for memory COLD/ARCHIVED transitions."""
    yield RunRequest(run_key=f"lifecycle-{context.cursor or '0'}")
    context.update_cursor(str(int(context.cursor or '0') + 1))


# ── Scheduled: quality refresh (daily) ───────────────────

@sensor(job_name="refresh_quality_job", minimum_interval_seconds=86400)
def quality_refresh_sensor(context: SensorEvaluationContext):
    """Daily trigger for quality score refresh."""
    yield RunRequest(run_key=f"quality-{context.cursor or '0'}")
    context.update_cursor(str(int(context.cursor or '0') + 1))
