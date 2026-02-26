"""Extraction record — idempotent guard for memory extraction."""

from datetime import datetime

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Text
from sqlalchemy.dialects.postgresql import ARRAY

from .enums import ExtractionStatus


class ExtractionRecord(SQLModel, table=True):
    """Tracks which threads have been processed."""

    __tablename__ = "extraction_records"

    thread_id: str = Field(primary_key=True, max_length=200)
    status: ExtractionStatus = Field(default=ExtractionStatus.PENDING, index=True)
    processed_at: datetime | None = Field(default=None)
    memory_ids: list[str] | None = Field(default=None, sa_column=Column(ARRAY(Text)))
    error_message: str | None = Field(default=None)
