"""Thread API routes — sync."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from forum_memory.api.deps import get_db, get_current_user_id
from forum_memory.schemas.thread import ThreadCreate, ThreadRead, ThreadResolve, CommentCreate, CommentRead
from forum_memory.services import thread_service

router = APIRouter(prefix="/threads", tags=["threads"])


@router.get("", response_model=list[ThreadRead])
def list_threads(
    namespace_id: UUID | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_db),
):
    return thread_service.list_threads(session, namespace_id, status, page, size)


@router.get("/{thread_id}", response_model=ThreadRead)
def get_thread(thread_id: UUID, session: Session = Depends(get_db)):
    thread = thread_service.get_thread(session, thread_id)
    if not thread:
        raise HTTPException(404, "Thread not found")
    return thread


@router.post("", response_model=ThreadRead, status_code=201)
def create_thread(data: ThreadCreate, session: Session = Depends(get_db), user_id: UUID = Depends(get_current_user_id)):
    return thread_service.create_thread(session, data, user_id)


@router.post("/{thread_id}/resolve", response_model=ThreadRead)
def resolve_thread(thread_id: UUID, data: ThreadResolve, session: Session = Depends(get_db)):
    try:
        return thread_service.resolve_thread(session, thread_id, data.best_answer_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{thread_id}/timeout-close", response_model=ThreadRead)
def timeout_close(thread_id: UUID, session: Session = Depends(get_db)):
    try:
        return thread_service.timeout_close_thread(session, thread_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/{thread_id}/comments", response_model=list[CommentRead])
def list_comments(thread_id: UUID, session: Session = Depends(get_db)):
    return thread_service.list_comments(session, thread_id)


@router.post("/{thread_id}/comments", response_model=CommentRead, status_code=201)
def add_comment(thread_id: UUID, data: CommentCreate, session: Session = Depends(get_db), user_id: UUID = Depends(get_current_user_id)):
    return thread_service.add_comment(session, data, user_id)


@router.post("/{thread_id}/ai-answer", response_model=CommentRead, status_code=201)
def ai_answer(thread_id: UUID, session: Session = Depends(get_db)):
    try:
        return thread_service.generate_ai_answer(session, thread_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"AI answer generation failed: {e}")


@router.post("/{thread_id}/comments/{comment_id}/upvote", response_model=CommentRead)
def upvote_comment(thread_id: UUID, comment_id: UUID, session: Session = Depends(get_db)):
    try:
        return thread_service.upvote_comment(session, comment_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
