"""Namespace (board) service — sync."""

from uuid import UUID

from sqlmodel import Session, select, func

from forum_memory.models.namespace import Namespace
from forum_memory.models.thread import Thread
from forum_memory.models.memory import Memory
from forum_memory.models.enums import ThreadStatus, Authority, ResolvedType
from forum_memory.schemas.namespace import NamespaceCreate, NamespaceUpdate, NamespaceStats


def list_namespaces(session: Session) -> list[Namespace]:
    """Return all active namespaces."""
    stmt = select(Namespace).where(Namespace.is_active == True)
    return list(session.exec(stmt).all())


def get_namespace(session: Session, ns_id: UUID) -> Namespace | None:
    return session.get(Namespace, ns_id)


def create_namespace(session: Session, data: NamespaceCreate, owner_id: UUID) -> Namespace:
    ns = Namespace(
        name=data.name,
        display_name=data.display_name,
        description=data.description,
        access_mode=data.access_mode,
        owner_id=owner_id,
    )
    session.add(ns)
    session.commit()
    session.refresh(ns)
    return ns


def update_namespace(session: Session, ns_id: UUID, data: NamespaceUpdate) -> Namespace | None:
    ns = session.get(Namespace, ns_id)
    if not ns:
        return None
    update_dict = data.model_dump(exclude_unset=True)
    for key, val in update_dict.items():
        setattr(ns, key, val)
    session.commit()
    session.refresh(ns)
    return ns


def update_dictionary(session: Session, ns_id: UUID, entries: dict) -> Namespace | None:
    ns = session.get(Namespace, ns_id)
    if not ns:
        return None
    merged = {**ns.dictionary, **entries}
    ns.dictionary = merged
    session.commit()
    session.refresh(ns)
    return ns


def get_stats(session: Session, ns_id: UUID) -> NamespaceStats:
    """Compute board-level stats."""
    total = _count_threads(session, ns_id, None)
    open_t = _count_threads(session, ns_id, ThreadStatus.OPEN)
    resolved = _count_threads(session, ns_id, ThreadStatus.RESOLVED)
    total_mem = _count_memories(session, ns_id, None)
    locked = _count_memories(session, ns_id, Authority.LOCKED)
    ai_rate = _ai_resolve_rate(session, ns_id)
    return NamespaceStats(
        total_threads=total,
        open_threads=open_t,
        resolved_threads=resolved,
        total_memories=total_mem,
        locked_memories=locked,
        ai_resolve_rate=ai_rate,
    )


def _count_threads(session: Session, ns_id: UUID, status: ThreadStatus | None) -> int:
    stmt = select(func.count()).select_from(Thread).where(Thread.namespace_id == ns_id)
    if status:
        stmt = stmt.where(Thread.status == status)
    return session.exec(stmt).one()


def _count_memories(session: Session, ns_id: UUID, authority: Authority | None) -> int:
    stmt = select(func.count()).select_from(Memory).where(Memory.namespace_id == ns_id)
    if authority:
        stmt = stmt.where(Memory.authority == authority)
    return session.exec(stmt).one()


def _ai_resolve_rate(session: Session, ns_id: UUID) -> float:
    resolved = _count_threads(session, ns_id, ThreadStatus.RESOLVED)
    if resolved == 0:
        return 0.0
    stmt = (
        select(func.count()).select_from(Thread)
        .where(Thread.namespace_id == ns_id, Thread.resolved_type == ResolvedType.AI_RESOLVED)
    )
    ai_count = session.exec(stmt).one()
    return round(ai_count / resolved, 4)
