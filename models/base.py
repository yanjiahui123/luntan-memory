"""Shared base model with timestamp fields."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, DateTime, func


class TimestampMixin(SQLModel):
    """Mixin that adds created_at and updated_at."""

    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False),
    )


class UUIDMixin(SQLModel):
    """Mixin that adds a UUID primary key."""

    id: UUID = Field(default_factory=uuid4, primary_key=True)
