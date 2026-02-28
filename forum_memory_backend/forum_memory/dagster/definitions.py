"""Dagster Definitions entry point.

Start with:
    dagster dev -m forum_memory.dagster.definitions
"""

from dagster import Definitions

from forum_memory.dagster.assets import (
    extract_memories_job,
    auto_ai_answer_job,
    timeout_threads_job,
    lifecycle_memories_job,
    refresh_quality_job,
)
from forum_memory.dagster.sensors import (
    thread_resolved_sensor,
    thread_created_ai_sensor,
    thread_timeout_sensor,
    memory_lifecycle_sensor,
    quality_refresh_sensor,
)

defs = Definitions(
    jobs=[
        extract_memories_job,
        auto_ai_answer_job,
        timeout_threads_job,
        lifecycle_memories_job,
        refresh_quality_job,
    ],
    sensors=[
        thread_resolved_sensor,
        thread_created_ai_sensor,
        thread_timeout_sensor,
        memory_lifecycle_sensor,
        quality_refresh_sensor,
    ],
)
