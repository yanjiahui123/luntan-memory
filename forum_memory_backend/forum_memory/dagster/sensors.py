"""Dagster sensor — polls DomainEvent table for thread.resolved events."""

import logging

from dagster import sensor, RunRequest, SensorEvaluationContext, SkipReason
from sqlmodel import Session, select

from forum_memory.database import engine
from forum_memory.models.event import DomainEvent

logger = logging.getLogger(__name__)


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
