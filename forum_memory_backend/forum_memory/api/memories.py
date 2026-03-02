"""Memory API routes — sync."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlmodel import Session

from forum_memory.api.deps import get_db, get_current_user, check_namespace_read_access
from forum_memory.models.user import User
from forum_memory.schemas.memory import (
    MemoryCreate, MemoryUpdate, MemoryRead,
    AuthorityChange, MemorySearchRequest, MemorySearchResponse,
    MemoryBatchRequest,
)
from forum_memory.services import memory_service, search_service, extraction_service

router = APIRouter(prefix="/memories", tags=["memories"])


@router.get("", response_model=list[MemoryRead])
def list_memories(
    response: Response,
    namespace_id: UUID | None = None,
    authority: str | None = None,
    status: str | None = None,
    pending_confirm: bool | None = None,
    knowledge_type: str | None = None,
    tags: str | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_db),
):
    items = memory_service.list_memories(
        session, namespace_id, authority, status, pending_confirm,
        knowledge_type, tags, q, page, size,
    )
    total = memory_service.count_memories(
        session, namespace_id, authority, status, pending_confirm,
        knowledge_type, tags, q,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get("/tags", response_model=list[str])
def list_tags(
    namespace_id: UUID | None = None,
    min_count: int = Query(2, ge=1),
    session: Session = Depends(get_db),
):
    return memory_service.list_all_tags(session, namespace_id, min_count=min_count)


@router.post("/batch", response_model=list[MemoryRead])
def batch_get(data: MemoryBatchRequest, session: Session = Depends(get_db)):
    return memory_service.batch_get_memories(session, data.ids)


@router.get("/{memory_id}", response_model=MemoryRead)
def get_memory(memory_id: UUID, session: Session = Depends(get_db)):
    memory = memory_service.get_memory(session, memory_id)
    if not memory:
        raise HTTPException(404, "Memory not found")
    return memory


@router.post("", response_model=MemoryRead, status_code=201)
def create_memory(data: MemoryCreate, session: Session = Depends(get_db)):
    return memory_service.create_memory(session, data)


@router.put("/{memory_id}", response_model=MemoryRead)
def update_memory(memory_id: UUID, data: MemoryUpdate, session: Session = Depends(get_db)):
    memory = memory_service.update_memory(session, memory_id, data)
    if not memory:
        raise HTTPException(404, "Memory not found")
    return memory


@router.delete("/{memory_id}", status_code=204)
def delete_memory(memory_id: UUID, session: Session = Depends(get_db)):
    ok = memory_service.delete_memory(session, memory_id)
    if not ok:
        raise HTTPException(404, "Memory not found")


@router.put("/{memory_id}/authority", response_model=MemoryRead)
def change_authority(memory_id: UUID, data: AuthorityChange, session: Session = Depends(get_db)):
    memory = memory_service.change_authority(session, memory_id, data.authority, data.reason)
    if not memory:
        raise HTTPException(404, "Memory not found")
    return memory


@router.post("/search", response_model=MemorySearchResponse)
def search(data: MemorySearchRequest, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    check_namespace_read_access(data.namespace_id, session, user)
    return search_service.search_memories(session, data)


@router.post("/extract/{thread_id}")
def extract(thread_id: UUID, session: Session = Depends(get_db)):
    try:
        ids = extraction_service.run_extraction(session, thread_id)
        return {"memory_ids_created": [str(i) for i in ids]}
    except ValueError as e:
        raise HTTPException(400, str(e))
