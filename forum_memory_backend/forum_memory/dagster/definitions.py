"""Dagster Definitions entry point.

Start with:
    dagster dev -m forum_memory.dagster.definitions
"""

from dagster import Definitions

from forum_memory.dagster.assets import extract_memories_job
from forum_memory.dagster.sensors import thread_resolved_sensor

defs = Definitions(
    jobs=[extract_memories_job],
    sensors=[thread_resolved_sensor],
)
