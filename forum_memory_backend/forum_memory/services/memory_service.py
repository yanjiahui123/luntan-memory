"""Memory CRUD and lifecycle service — sync."""

from uuid import UUID
from datetime import datetime, timezone

from sqlmodel import Session, select

from forum_memory.models.memory import Memory
from forum_memory.models.operation_log import OperationLog
from forum_memory.models.enums import Authority, MemoryStatus, OperationType, AUDNAction
from forum_memory.core.quality import compute_quality_score
from forum_memory.core.audn import AUDNResult
from forum_memory.schemas.memory import MemoryCreate, MemoryUpdate


def list_memories(
    session: Session,
    namespace_id: UUID | None = None,
    authority: str | None = None,
    status: str | None = None,
    pending_confirm: bool | None = None,
    page: int = 1,
    size: int = 20,
) -> list[Memory]:
    stmt = select(Memory).order_by(Memory.updated_at.desc())
    stmt = _apply_filters(stmt, namespace_id, authority, status, pending_confirm)
    stmt = stmt.offset((page - 1) * size).limit(size)
    return list(session.exec(stmt).all())


def get_memory(session: Session, memory_id: UUID) -> Memory | None:
    return session.get(Memory, memory_id)


def create_memory(session: Session, data: MemoryCreate) -> Memory:
    memory = Memory(**data.model_dump())
    session.add(memory)
    session.commit()
    session.refresh(memory)
    _log_operation(session, memory.id, OperationType.ADD, reason="created")
    return memory


def update_memory(session: Session, memory_id: UUID, data: MemoryUpdate) -> Memory | None:
    memory = session.get(Memory, memory_id)
    if not memory:
        return None
    before = _snapshot(memory)
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(memory, key, val)
    memory.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(memory)
    _log_operation(session, memory.id, OperationType.UPDATE, reason="manual_update", before=before)
    return memory


def delete_memory(session: Session, memory_id: UUID) -> bool:
    memory = session.get(Memory, memory_id)
    if not memory:
        return False
    memory.status = MemoryStatus.DELETED
    memory.updated_at = datetime.now(timezone.utc)
    session.commit()
    _log_operation(session, memory.id, OperationType.DELETE, reason="deleted")
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
    session.commit()
    session.refresh(memory)
    op = OperationType.PROMOTE if authority == "LOCKED" else OperationType.DEMOTE
    _log_operation(session, memory.id, op, reason=reason or f"{old} -> {authority}", before=before)
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
    session.commit()
    session.refresh(memory)
    _log_operation(session, memory.id, OperationType.UPDATE, reason=result.reason, before=before)
    return memory


def _apply_delete(session: Session, result: AUDNResult) -> Memory | None:
    if not result.target_id:
        return None
    memory = session.get(Memory, UUID(result.target_id))
    if not memory or memory.authority == Authority.LOCKED:
        return None
    memory.status = MemoryStatus.DELETED
    memory.updated_at = datetime.now(timezone.utc)
    session.commit()
    _log_operation(session, memory.id, OperationType.DELETE, reason=result.reason)
    return memory


def _apply_filters(stmt, ns_id, authority, status, pending):
    if ns_id:
        stmt = stmt.where(Memory.namespace_id == ns_id)
    if authority:
        stmt = stmt.where(Memory.authority == authority)
    if status:
        stmt = stmt.where(Memory.status == status)
    if pending:
        stmt = stmt.where(Memory.pending_human_confirm == True)
    return stmt


def _snapshot(memory: Memory) -> dict:
    return {"content": memory.content, "authority": memory.authority, "status": memory.status}


def _log_operation(session: Session, memory_id: UUID, op: OperationType, reason: str | None = None, before: dict | None = None) -> None:
    log = OperationLog(
        memory_id=memory_id,
        operation=op,
        operator_type="system",
        reason=reason,
        before_snapshot=before,
    )
    session.add(log)
    session.commit()
