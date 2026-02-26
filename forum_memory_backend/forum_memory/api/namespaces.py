"""Namespace (board) API routes."""

from uuid import UUID

from fastapi import APIRouter, HTTPException

from ..schemas.namespace import NamespaceCreate, NamespaceUpdate, NamespaceRead, DictionaryUpdate, NamespaceStats
from .deps import NamespaceSvcDep, CurrentUserDep

router = APIRouter(prefix="/api/v1/namespaces", tags=["namespaces"])


@router.post("", response_model=NamespaceRead, status_code=201)
async def create_namespace(data: NamespaceCreate, svc: NamespaceSvcDep, user_id: CurrentUserDep):
    return await svc.create(data, user_id)


@router.get("", response_model=list[NamespaceRead])
async def list_namespaces(svc: NamespaceSvcDep):
    return await svc.list_all()


@router.get("/{ns_id}", response_model=NamespaceRead)
async def get_namespace(ns_id: UUID, svc: NamespaceSvcDep):
    ns = await svc.get(ns_id)
    if ns is None:
        raise HTTPException(404, "Namespace not found")
    return ns


@router.put("/{ns_id}", response_model=NamespaceRead)
async def update_namespace(ns_id: UUID, data: NamespaceUpdate, svc: NamespaceSvcDep):
    ns = await svc.update(ns_id, data)
    if ns is None:
        raise HTTPException(404, "Namespace not found")
    return ns


@router.put("/{ns_id}/dictionary", response_model=NamespaceRead)
async def update_dictionary(ns_id: UUID, data: DictionaryUpdate, svc: NamespaceSvcDep):
    ns = await svc.update_dictionary(ns_id, data.entries)
    if ns is None:
        raise HTTPException(404, "Namespace not found")
    return ns


@router.get("/{ns_id}/stats", response_model=NamespaceStats)
async def get_stats(ns_id: UUID, svc: NamespaceSvcDep):
    return await svc.get_stats(ns_id)
