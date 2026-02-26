"""Thread (post) and Comment API routes."""

from uuid import UUID

from fastapi import APIRouter, HTTPException

from ..schemas.thread import ThreadCreate, ThreadRead, ThreadResolve, ThreadListParams, CommentCreate, CommentRead
from .deps import ThreadSvcDep, CurrentUserDep

router = APIRouter(prefix="/api/v1/threads", tags=["threads"])


@router.post("", response_model=ThreadRead, status_code=201)
async def create_thread(data: ThreadCreate, svc: ThreadSvcDep, user_id: CurrentUserDep):
    return await svc.create(data, user_id)


@router.get("", response_model=list[ThreadRead])
async def list_threads(svc: ThreadSvcDep, namespace_id: UUID | None = None, page: int = 1, size: int = 20):
    params = ThreadListParams(namespace_id=namespace_id, page=page, size=size)
    return await svc.list(params)


@router.get("/{thread_id}", response_model=ThreadRead)
async def get_thread(thread_id: UUID, svc: ThreadSvcDep):
    thread = await svc.get(thread_id)
    if thread is None:
        raise HTTPException(404, "Thread not found")
    return thread


@router.post("/{thread_id}/resolve", response_model=ThreadRead)
async def resolve_thread(thread_id: UUID, data: ThreadResolve, svc: ThreadSvcDep):
    try:
        return await svc.resolve(thread_id, data.best_answer_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{thread_id}/timeout-close", response_model=ThreadRead)
async def timeout_close_thread(thread_id: UUID, svc: ThreadSvcDep):
    try:
        return await svc.timeout_close(thread_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ── Comments ──────────────────────────────────────────────────

@router.post("/{thread_id}/comments", response_model=CommentRead, status_code=201)
async def add_comment(thread_id: UUID, data: CommentCreate, svc: ThreadSvcDep, user_id: CurrentUserDep):
    return await svc.add_comment(thread_id, data.content, user_id)


@router.get("/{thread_id}/comments", response_model=list[CommentRead])
async def list_comments(thread_id: UUID, svc: ThreadSvcDep):
    return await svc.get_comments(thread_id)
