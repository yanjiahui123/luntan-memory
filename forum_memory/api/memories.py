"""Memory API routes — CRUD, search, authority, history."""

from uuid import UUID

from fastapi import APIRouter, HTTPException

from ..schemas.memory import (
    MemoryCreate, MemoryUpdate, MemoryRead, MemoryListParams,
    MemorySearchRequest, MemorySearchResponse, AuthorityChange,
)
from ..models.enums import Authority, MemoryStatus
from .deps import MemorySvcDep, SearchSvcDep, ExtractionSvcDep, CurrentUserDep

router = APIRouter(prefix="/api/v1/memories", tags=["memories"])


# ── Search ────────────────────────────────────────────────────

@router.post("/search", response_model=MemorySearchResponse)
async def search_memories(req: MemorySearchRequest, svc: SearchSvcDep):
    return await svc.search(req)


# ── CRUD ──────────────────────────────────────────────────────

@router.post("", response_model=MemoryRead, status_code=201)
async def create_memory(data: MemoryCreate, svc: MemorySvcDep):
    return await svc.create(data)


@router.get("", response_model=list[MemoryRead])
async def list_memories(
    svc: MemorySvcDep,
    namespace_id: UUID | None = None,
    authority: Authority | None = None,
    status: MemoryStatus | None = None,
    pending_confirm: bool | None = None,
    page: int = 1,
    size: int = 20,
):
    params = MemoryListParams(
        namespace_id=namespace_id, authority=authority,
        status=status, pending_confirm=pending_confirm,
        page=page, size=size,
    )
    return await svc.list(params)


@router.get("/{memory_id}", response_model=MemoryRead)
async def get_memory(memory_id: UUID, svc: MemorySvcDep):
    memory = await svc.get(memory_id)
    if memory is None:
        raise HTTPException(404, "Memory not found")
    return memory


@router.put("/{memory_id}", response_model=MemoryRead)
async def update_memory(memory_id: UUID, data: MemoryUpdate, svc: MemorySvcDep, user_id: CurrentUserDep):
    memory = await svc.update(memory_id, data, user_id)
    if memory is None:
        raise HTTPException(404, "Memory not found")
    return memory


@router.delete("/{memory_id}", status_code=204)
async def delete_memory(memory_id: UUID, svc: MemorySvcDep, user_id: CurrentUserDep):
    ok = await svc.delete(memory_id, user_id)
    if not ok:
        raise HTTPException(404, "Memory not found")


# ── Authority ─────────────────────────────────────────────────

@router.put("/{memory_id}/authority", response_model=MemoryRead)
async def change_authority(memory_id: UUID, data: AuthorityChange, svc: MemorySvcDep, user_id: CurrentUserDep):
    memory = await svc.change_authority(memory_id, data, user_id)
    if memory is None:
        raise HTTPException(404, "Memory not found")
    return memory


# ── Extraction trigger ────────────────────────────────────────

@router.post("/extract/{thread_id}")
async def trigger_extraction(thread_id: UUID, svc: ExtractionSvcDep):
    ids = await svc.run(thread_id)
    return {"extracted_memory_ids": [str(i) for i in ids]}
