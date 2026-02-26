"""Shared API dependencies."""

from uuid import UUID
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..services import (
    NamespaceService, ThreadService, MemoryService,
    FeedbackService, SearchService, ExtractionOrchestrator,
)
from ..providers import get_llm_provider


SessionDep = Annotated[AsyncSession, Depends(get_session)]


def get_namespace_svc(session: SessionDep) -> NamespaceService:
    return NamespaceService(session)


def get_thread_svc(session: SessionDep) -> ThreadService:
    return ThreadService(session)


def get_memory_svc(session: SessionDep) -> MemoryService:
    return MemoryService(session)


def get_feedback_svc(session: SessionDep) -> FeedbackService:
    return FeedbackService(session)


def get_search_svc(session: SessionDep) -> SearchService:
    return SearchService(session, get_llm_provider())


def get_extraction_svc(session: SessionDep) -> ExtractionOrchestrator:
    llm = get_llm_provider()
    search = SearchService(session, llm)
    return ExtractionOrchestrator(session, llm, search)


async def get_current_user_id(x_user_id: str = Header(default="anonymous")) -> UUID | None:
    """Extract user ID from header. Replace with real auth."""
    try:
        return UUID(x_user_id)
    except ValueError:
        return None


NamespaceSvcDep = Annotated[NamespaceService, Depends(get_namespace_svc)]
ThreadSvcDep = Annotated[ThreadService, Depends(get_thread_svc)]
MemorySvcDep = Annotated[MemoryService, Depends(get_memory_svc)]
FeedbackSvcDep = Annotated[FeedbackService, Depends(get_feedback_svc)]
SearchSvcDep = Annotated[SearchService, Depends(get_search_svc)]
ExtractionSvcDep = Annotated[ExtractionOrchestrator, Depends(get_extraction_svc)]
CurrentUserDep = Annotated[UUID | None, Depends(get_current_user_id)]
