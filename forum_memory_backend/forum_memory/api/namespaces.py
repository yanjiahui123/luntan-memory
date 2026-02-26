"""Namespace (board) API routes — sync."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from forum_memory.api.deps import get_db, get_current_user_id, require_admin
from forum_memory.models.user import User
from forum_memory.schemas.namespace import NamespaceCreate, NamespaceUpdate, NamespaceRead, NamespaceStats, DictionaryUpdate
from forum_memory.services import namespace_service

router = APIRouter(prefix="/namespaces", tags=["namespaces"])


@router.get("", response_model=list[NamespaceRead])
def list_namespaces(session: Session = Depends(get_db)):
    """所有人可查看板块列表。"""
    return namespace_service.list_namespaces(session)


@router.get("/{ns_id}", response_model=NamespaceRead)
def get_namespace(ns_id: UUID, session: Session = Depends(get_db)):
    """所有人可查看板块详情。"""
    ns = namespace_service.get_namespace(session, ns_id)
    if not ns:
        raise HTTPException(404, "Namespace not found")
    return ns


@router.post("", response_model=NamespaceRead, status_code=201)
def create_namespace(
    data: NamespaceCreate,
    session: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """仅超级管理员可创建板块。"""
    return namespace_service.create_namespace(session, data, admin.id)


@router.put("/{ns_id}", response_model=NamespaceRead)
def update_namespace(
    ns_id: UUID,
    data: NamespaceUpdate,
    session: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """仅超级管理员可修改板块。"""
    ns = namespace_service.update_namespace(session, ns_id, data)
    if not ns:
        raise HTTPException(404, "Namespace not found")
    return ns


@router.get("/{ns_id}/stats", response_model=NamespaceStats)
def get_stats(ns_id: UUID, session: Session = Depends(get_db)):
    return namespace_service.get_stats(session, ns_id)


@router.put("/{ns_id}/dictionary", response_model=NamespaceRead)
def update_dictionary(
    ns_id: UUID,
    data: DictionaryUpdate,
    session: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """仅超级管理员可修改黑话字典。"""
    ns = namespace_service.update_dictionary(session, ns_id, data.entries)
    if not ns:
        raise HTTPException(404, "Namespace not found")
    return ns