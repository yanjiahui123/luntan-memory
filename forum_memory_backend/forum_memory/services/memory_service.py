"""Memory CRUD and lifecycle service — sync."""

import logging
import time
from uuid import UUID
from datetime import datetime, timezone

from sqlmodel import Session, select

from forum_memory.models.memory import Memory
from forum_memory.models.namespace import Namespace
from forum_memory.models.operation_log import OperationLog
from forum_memory.models.enums import Authority, MemoryStatus, OperationType, AUDNAction
from forum_memory.core.quality import compute_quality_score
from forum_memory.core.audn import AUDNResult
from forum_memory.schemas.memory import MemoryCreate, MemoryUpdate
from forum_memory.services import es_service

logger = logging.getLogger(__name__)


def _resolve_es_index(session: Session, namespace_id: UUID) -> str | None:
    """Look up the namespace's ES index name. Returns None if not set."""
    ns = session.get(Namespace, namespace_id)
    return ns.es_index_name if ns else None


def _index_to_es(memory: Memory, index_name: str | None = None, max_retries: int = 3) -> bool:
    """Generate embedding and index to ES. Retries on transient failure.

    Returns True on success, False after all retries exhausted.
    """
    for attempt in range(1, max_retries + 1):
        try:
            from forum_memory.providers import get_provider
            provider = get_provider()
            embedding = provider.embed(memory.content)
            success = es_service.index_memory(
                memory_id=memory.id,
                namespace_id=memory.namespace_id,
                content=memory.content,
                embedding=embedding,
                status=memory.status,
                environment=memory.environment,
                tags=memory.tags,
                knowledge_type=memory.knowledge_type,
                quality_score=memory.quality_score,
                index_name=index_name,
            )
            if success:
                return True
            raise RuntimeError("es_service.index_memory returned False")
        except Exception:
            if attempt < max_retries:
                delay = 2 ** (attempt - 1)  # 1s, 2s
                logger.warning(
                    "ES index attempt %d/%d failed for memory %s, retrying in %ds",
                    attempt, max_retries, memory.id, delay,
                )
                time.sleep(delay)
            else:
                logger.error(
                    "ES index FAILED after %d attempts for memory %s — "
                    "DB record exists but NOT searchable. "
                    "Run reindex script to fix.",
                    max_retries, memory.id,
                )
    return False


def list_memories(
    session: Session,
    namespace_id: UUID | None = None,
    authority: str | None = None,
    status: str | None = None,
    pending_confirm: bool | None = None,
    knowledge_type: str | None = None,
    tags: str | None = None,
    q: str | None = None,
    page: int = 1,
    size: int = 20,
    source_id: UUID | None = None,
) -> list[Memory]:
    stmt = (
        select(Memory)
        .join(Namespace, Memory.namespace_id == Namespace.id)
        .where(Namespace.is_active == True)
        .where(Memory.status != MemoryStatus.DELETED)
        .order_by(Memory.updated_at.desc())
    )
    stmt = _apply_filters(stmt, namespace_id, authority, status, pending_confirm, knowledge_type, tags, q, source_id=source_id)
    stmt = stmt.offset((page - 1) * size).limit(size)
    return list(session.exec(stmt).all())


def get_memory(session: Session, memory_id: UUID) -> Memory | None:
    return session.get(Memory, memory_id)


def create_memory(session: Session, data: MemoryCreate) -> Memory:
    create_data = data.model_dump(exclude={"authority", "pending_human_confirm"})
    memory = Memory(**create_data)
    # Apply optional authority/pending from schema
    if data.authority:
        memory.authority = Authority(data.authority)
    if data.pending_human_confirm:
        memory.pending_human_confirm = data.pending_human_confirm
    session.add(memory)
    session.flush()  # Get ID without committing
    # Compute initial quality score based on source_role and freshness
    memory.quality_score = compute_quality_score(
        useful=0, not_useful=0, wrong=0, outdated=0,
        source_role=memory.source_role,
        retrieve_count=0,
        created_at=memory.created_at,
    )
    _log_operation(session, memory.id, OperationType.ADD, reason="created")
    session.commit()
    session.refresh(memory)
    # ES indexing: outside transaction — failure tracked via indexed_at
    index_name = _resolve_es_index(session, memory.namespace_id)
    if _index_to_es(memory, index_name=index_name):
        memory.indexed_at = datetime.now(timezone.utc)
        session.commit()
    return memory


def update_memory(session: Session, memory_id: UUID, data: MemoryUpdate) -> Memory | None:
    memory = session.get(Memory, memory_id)
    if not memory:
        return None
    before = _snapshot(memory)
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(memory, key, val)
    memory.updated_at = datetime.now(timezone.utc)
    memory.indexed_at = None  # Mark ES as stale
    _log_operation(session, memory.id, OperationType.UPDATE, reason="manual_update", before=before)
    session.commit()
    session.refresh(memory)
    # Re-index to ES
    index_name = _resolve_es_index(session, memory.namespace_id)
    if _index_to_es(memory, index_name=index_name):
        memory.indexed_at = datetime.now(timezone.utc)
        session.commit()
    return memory


def delete_memory(session: Session, memory_id: UUID) -> bool:
    memory = session.get(Memory, memory_id)
    if not memory:
        return False
    index_name = _resolve_es_index(session, memory.namespace_id)
    memory.status = MemoryStatus.DELETED
    memory.updated_at = datetime.now(timezone.utc)
    memory.indexed_at = None
    _log_operation(session, memory.id, OperationType.DELETE, reason="deleted")
    session.commit()
    es_service.delete_memory_doc(memory_id, index_name=index_name)
    return True


def change_authority(session: Session, memory_id: UUID, authority: str, reason: str | None = None) -> Memory | None:
    memory = session.get(Memory, memory_id)
    if not memory:
        return None
    before = _snapshot(memory)
    old = memory.authority
    memory.authority = Authority(authority)
    memory.pending_human_confirm = False
    memory.updated_at = datetime.now(timezone.utc)
    op = OperationType.PROMOTE if authority == "LOCKED" else OperationType.DEMOTE
    _log_operation(session, memory.id, op, reason=reason or f"{old} -> {authority}", before=before)
    session.commit()
    session.refresh(memory)
    return memory


def apply_audn(session: Session, new_fact: MemoryCreate, result: AUDNResult) -> Memory | None:
    """Apply an AUDN decision to the memory store."""
    if result.action == AUDNAction.ADD:
        return create_memory(session, new_fact)
    if result.action == AUDNAction.UPDATE:
        return _apply_update(session, result)
    if result.action == AUDNAction.DELETE:
        return _apply_delete(session, result)
    return None  # NONE


def refresh_quality(session: Session, memory_id: UUID) -> float:
    memory = session.get(Memory, memory_id)
    if not memory:
        return 0.0
    score = compute_quality_score(
        useful=memory.useful_count,
        not_useful=memory.not_useful_count,
        wrong=memory.wrong_count,
        outdated=memory.outdated_count,
        source_role=memory.source_role,
        retrieve_count=memory.retrieve_count,
        created_at=memory.created_at,
    )
    memory.quality_score = score
    memory.updated_at = datetime.now(timezone.utc)
    session.commit()
    return score


def _apply_update(session: Session, result: AUDNResult) -> Memory | None:
    if not result.target_id or not result.merged_content:
        return None
    memory = session.get(Memory, UUID(result.target_id))
    if not memory:
        return None
    if memory.authority == Authority.LOCKED:
        return None  # LOCKED protection
    before = _snapshot(memory)
    memory.content = result.merged_content
    memory.updated_at = datetime.now(timezone.utc)
    memory.indexed_at = None  # Mark ES as stale
    _log_operation(session, memory.id, OperationType.UPDATE, reason=result.reason, before=before)
    session.commit()
    session.refresh(memory)
    # Re-index to ES
    index_name = _resolve_es_index(session, memory.namespace_id)
    if _index_to_es(memory, index_name=index_name):
        memory.indexed_at = datetime.now(timezone.utc)
        session.commit()
    return memory


def _apply_delete(session: Session, result: AUDNResult) -> Memory | None:
    if not result.target_id:
        return None
    memory = session.get(Memory, UUID(result.target_id))
    if not memory or memory.authority == Authority.LOCKED:
        return None
    index_name = _resolve_es_index(session, memory.namespace_id)
    memory.status = MemoryStatus.DELETED
    memory.updated_at = datetime.now(timezone.utc)
    memory.indexed_at = None
    _log_operation(session, memory.id, OperationType.DELETE, reason=result.reason)
    session.commit()
    es_service.delete_memory_doc(UUID(result.target_id), index_name=index_name)
    return memory


def transition_cold_memories(session: Session, cold_days: int = 180) -> int:
    """Transition ACTIVE memories inactive for cold_days to COLD status."""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=cold_days)
    stmt = (
        select(Memory)
        .where(Memory.status == MemoryStatus.ACTIVE)
        .where(
            # Use last_retrieved_at if available, otherwise fall back to updated_at
            (Memory.last_retrieved_at < cutoff) | (
                (Memory.last_retrieved_at == None) & (Memory.updated_at < cutoff)  # noqa: E711
            )
        )
    )
    memories = list(session.exec(stmt).all())
    count = 0
    for m in memories:
        before = _snapshot(m)
        index_name = _resolve_es_index(session, m.namespace_id)
        m.status = MemoryStatus.COLD
        m.updated_at = datetime.now(timezone.utc)
        m.indexed_at = None
        _log_operation(session, m.id, OperationType.ARCHIVE, reason=f"inactive {cold_days}+ days → COLD", before=before)
        session.commit()
        es_service.delete_memory_doc(m.id, index_name=index_name)  # COLD memories don't participate in search
        count += 1
    logger.info("Transitioned %d memories to COLD", count)
    return count


def transition_archived_memories(session: Session, archive_days: int = 365) -> int:
    """Transition COLD memories inactive for archive_days to ARCHIVED status."""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=archive_days)
    stmt = (
        select(Memory)
        .where(Memory.status == MemoryStatus.COLD)
        .where(Memory.updated_at < cutoff)
    )
    memories = list(session.exec(stmt).all())
    count = 0
    for m in memories:
        before = _snapshot(m)
        m.status = MemoryStatus.ARCHIVED
        m.updated_at = datetime.now(timezone.utc)
        _log_operation(session, m.id, OperationType.ARCHIVE, reason=f"inactive {archive_days}+ days → ARCHIVED", before=before)
        session.commit()
        count += 1
    logger.info("Transitioned %d memories to ARCHIVED", count)
    return count


def bulk_refresh_quality(session: Session) -> int:
    """Refresh quality score for all ACTIVE memories. Returns count updated."""
    stmt = select(Memory).where(Memory.status == MemoryStatus.ACTIVE)
    memories = list(session.exec(stmt).all())
    count = 0
    for m in memories:
        old_score = m.quality_score
        new_score = compute_quality_score(
            useful=m.useful_count,
            not_useful=m.not_useful_count,
            wrong=m.wrong_count,
            outdated=m.outdated_count,
            source_role=m.source_role,
            retrieve_count=m.retrieve_count,
            created_at=m.created_at,
        )
        if abs(new_score - old_score) > 0.001:
            m.quality_score = new_score
            m.indexed_at = None  # Mark ES as stale
            session.commit()
            index_name = _resolve_es_index(session, m.namespace_id)
            if _index_to_es(m, index_name=index_name):
                m.indexed_at = datetime.now(timezone.utc)
                session.commit()
            count += 1
    logger.info("Refreshed quality for %d memories", count)
    return count


def list_all_tags(
    session: Session,
    namespace_id: UUID | None = None,
    min_count: int = 2,
) -> list[str]:
    """Return tags sorted by frequency (descending), filtered by min_count.

    Tags that appear only once are excluded by default (min_count=2) to avoid
    polluting the filter UI with one-off AI-generated tags.
    Pass min_count=1 to get all tags.
    """
    stmt = select(Memory.tags).where(Memory.status != MemoryStatus.DELETED)
    if namespace_id:
        stmt = stmt.where(Memory.namespace_id == namespace_id)
    rows = session.exec(stmt).all()

    counts: dict[str, int] = {}
    for tags in rows:
        if tags:
            for t in tags:
                if t:
                    counts[t] = counts.get(t, 0) + 1

    # Filter by min_count, then sort by frequency desc, then alpha for ties
    return [
        tag for tag, _ in sorted(counts.items(), key=lambda x: (-x[1], x[0]))
        if counts[tag] >= min_count
    ]


def batch_get_memories(session: Session, ids: list[UUID]) -> list[Memory]:
    """Fetch multiple memories by IDs."""
    if not ids:
        return []
    stmt = select(Memory).where(Memory.id.in_(ids))
    return list(session.exec(stmt).all())


def count_memories(
    session: Session,
    namespace_id: UUID | None = None,
    authority: str | None = None,
    status: str | None = None,
    pending_confirm: bool | None = None,
    knowledge_type: str | None = None,
    tags: str | None = None,
    q: str | None = None,
    source_id: UUID | None = None,
) -> int:
    """Count memories matching the given filters (for pagination)."""
    from sqlmodel import func
    stmt = (
        select(func.count())
        .select_from(Memory)
        .join(Namespace, Memory.namespace_id == Namespace.id)
        .where(Namespace.is_active == True)
        .where(Memory.status != MemoryStatus.DELETED)
    )
    stmt = _apply_filters(stmt, namespace_id, authority, status, pending_confirm, knowledge_type, tags, q, source_id=source_id)
    return session.exec(stmt).one()


def _apply_filters(stmt, ns_id, authority, status, pending, knowledge_type=None, tags=None, q=None, source_id=None):
    if ns_id:
        stmt = stmt.where(Memory.namespace_id == ns_id)
    if authority:
        stmt = stmt.where(Memory.authority == authority)
    if status:
        stmt = stmt.where(Memory.status == status)
    if pending:
        stmt = stmt.where(Memory.pending_human_confirm == True)
    if knowledge_type:
        stmt = stmt.where(Memory.knowledge_type == knowledge_type)
    if tags:
        # Filter memories that contain the specified tag
        from sqlalchemy import cast, String
        for tag in tags.split(","):
            tag = tag.strip()
            if tag:
                stmt = stmt.where(Memory.tags.cast(String).contains(tag))
    if q:
        stmt = stmt.where(Memory.content.ilike(f"%{q}%"))
    if source_id:
        stmt = stmt.where(Memory.source_id == source_id)
    return stmt


def _snapshot(memory: Memory) -> dict:
    return {"content": memory.content, "authority": memory.authority, "status": memory.status}


def reindex_unsynced_memories(session: Session, batch_size: int = 50) -> int:
    """Find ACTIVE memories with indexed_at IS NULL and re-index to ES.

    This is a repair function for DB-ES consistency gaps — called by a periodic
    Dagster job to fix memories that failed ES indexing on creation/update.
    Returns the number of successfully re-indexed memories.
    """
    stmt = (
        select(Memory)
        .where(Memory.status == MemoryStatus.ACTIVE)
        .where(Memory.indexed_at == None)  # noqa: E711
        .limit(batch_size)
    )
    memories = list(session.exec(stmt).all())
    if not memories:
        return 0

    count = 0
    for m in memories:
        index_name = _resolve_es_index(session, m.namespace_id)
        if _index_to_es(m, index_name=index_name):
            m.indexed_at = datetime.now(timezone.utc)
            session.commit()
            count += 1
        else:
            logger.warning("Repair reindex still failed for memory %s", m.id)
    logger.info("Repair reindex: %d/%d memories synced to ES", count, len(memories))
    return count


def _log_operation(session: Session, memory_id: UUID, op: OperationType, reason: str | None = None, before: dict | None = None) -> None:
    """Add an operation log entry to the session (does NOT commit — caller controls transaction)."""
    log = OperationLog(
        memory_id=memory_id,
        operation=op,
        operator_type="system",
        reason=reason,
        before_snapshot=before,
    )
    session.add(log)
