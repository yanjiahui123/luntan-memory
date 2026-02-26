"""Memory service — core CRUD, authority management, and lifecycle."""

from uuid import UUID
from datetime import datetime, timezone

from sqlmodel import select, col
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.memory import Memory
from ..models.operation_log import MemoryOperation
from ..models.enums import (
    Authority, MemoryStatus, OperationType, AUDNAction,
)
from ..schemas.memory import (
    MemoryCreate, MemoryUpdate, MemoryListParams, AuthorityChange, AUDNResult,
)
from ..core.quality import compute_quality_score, QualityInput


class MemoryService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ── CRUD ──────────────────────────────────────────────────

    async def create(self, data: MemoryCreate, source_role: str = "admin", resolved_type: str = "manual") -> Memory:
        memory = Memory(
            **data.model_dump(),
            source_role=source_role,
            resolved_type=resolved_type,
        )
        self.session.add(memory)
        await self._log(memory.id, OperationType.ADD, content_after=memory.content)
        await self.session.commit()
        await self.session.refresh(memory)
        return memory

    async def get(self, memory_id: UUID) -> Memory | None:
        return await self.session.get(Memory, memory_id)

    async def list(self, params: MemoryListParams) -> list[Memory]:
        stmt = self._build_list_query(params)
        result = await self.session.exec(stmt)
        return list(result.all())

    async def update(self, memory_id: UUID, data: MemoryUpdate, operator_id: UUID | None = None) -> Memory | None:
        memory = await self.get(memory_id)
        if memory is None:
            return None
        return await self._apply_update(memory, data, operator_id)

    async def delete(self, memory_id: UUID, operator_id: UUID | None = None) -> bool:
        memory = await self.get(memory_id)
        if memory is None:
            return False
        return await self._soft_delete(memory, operator_id)

    # ── Authority management ──────────────────────────────────

    async def change_authority(self, memory_id: UUID, change: AuthorityChange, operator_id: UUID) -> Memory | None:
        memory = await self.get(memory_id)
        if memory is None:
            return None
        return await self._apply_authority_change(memory, change, operator_id)

    # ── Lifecycle transitions ─────────────────────────────────

    async def mark_cold(self, memory_id: UUID) -> Memory | None:
        memory = await self.get(memory_id)
        if memory is None or memory.authority == Authority.LOCKED:
            return None
        return await self._transition_status(memory, MemoryStatus.COLD)

    async def mark_archived(self, memory_id: UUID) -> Memory | None:
        memory = await self.get(memory_id)
        if memory is None:
            return None
        return await self._transition_status(memory, MemoryStatus.ARCHIVED)

    async def restore(self, memory_id: UUID, operator_id: UUID) -> Memory | None:
        memory = await self.get(memory_id)
        if memory is None:
            return None
        return await self._transition_status(memory, MemoryStatus.ACTIVE, operator_id)

    # ── AUDN result application ───────────────────────────────

    async def apply_audn(self, result: AUDNResult, namespace_id: UUID, metadata: dict) -> Memory | None:
        """Apply an AUDN decision to the memory store."""
        if result.action == AUDNAction.ADD:
            return await self._audn_add(result, namespace_id, metadata)
        if result.action == AUDNAction.UPDATE:
            return await self._audn_update(result)
        if result.action == AUDNAction.DELETE:
            return await self._audn_delete(result)
        return None  # NONE action

    # ── Quality refresh ───────────────────────────────────────

    async def refresh_quality(self, memory_id: UUID) -> float:
        memory = await self.get(memory_id)
        if memory is None:
            return 0.0
        inp = self._build_quality_input(memory)
        memory.quality_score = compute_quality_score(inp)
        await self.session.commit()
        return memory.quality_score

    async def record_retrieval(self, memory_id: UUID) -> None:
        memory = await self.get(memory_id)
        if memory is None:
            return
        memory.retrieve_count += 1
        memory.last_retrieved_at = datetime.now(timezone.utc)
        if memory.status == MemoryStatus.COLD:
            memory.status = MemoryStatus.ACTIVE
        await self.session.commit()

    # ── Private helpers (each ≤ 5 lines) ──────────────────────

    async def _apply_update(self, memory: Memory, data: MemoryUpdate, operator_id: UUID | None) -> Memory:
        old_content = memory.content
        for key, val in data.model_dump(exclude_unset=True).items():
            setattr(memory, key, val)
        await self._log(memory.id, OperationType.UPDATE, operator_id, old_content, memory.content)
        await self.session.commit()
        await self.session.refresh(memory)
        return memory

    async def _soft_delete(self, memory: Memory, operator_id: UUID | None) -> bool:
        memory.status = MemoryStatus.DELETED
        await self._log(memory.id, OperationType.DELETE, operator_id, content_before=memory.content)
        await self.session.commit()
        return True

    async def _apply_authority_change(self, memory: Memory, change: AuthorityChange, operator_id: UUID) -> Memory:
        op = OperationType.PROMOTE if change.authority == Authority.LOCKED else OperationType.DEMOTE
        memory.authority = change.authority
        await self._log(memory.id, op, operator_id, reason=change.reason)
        await self.session.commit()
        await self.session.refresh(memory)
        return memory

    async def _transition_status(self, memory: Memory, status: MemoryStatus, operator_id: UUID | None = None) -> Memory:
        op = OperationType.ARCHIVE if status == MemoryStatus.ARCHIVED else OperationType.RESTORE
        memory.status = status
        await self._log(memory.id, op, operator_id)
        await self.session.commit()
        await self.session.refresh(memory)
        return memory

    async def _audn_add(self, result: AUDNResult, ns_id: UUID, meta: dict) -> Memory:
        memory = Memory(
            namespace_id=ns_id, content=result.content or "",
            source_role=meta.get("source_role", "ai"),
            resolved_type=meta.get("resolved_type", "ai_resolved"),
            authority=Authority(meta.get("authority", "NORMAL")),
            tags=meta.get("tags"),
            environment=meta.get("environment"),
            source_id=meta.get("source_id"),
            pending_human_confirm=meta.get("pending_human_confirm", False),
        )
        self.session.add(memory)
        await self.session.commit()
        await self.session.refresh(memory)
        return memory

    async def _audn_update(self, result: AUDNResult) -> Memory | None:
        if result.memory_id is None:
            return None
        memory = await self.get(result.memory_id)
        if memory is None or memory.authority == Authority.LOCKED:
            return None
        memory.content = result.content or memory.content
        await self._log(memory.id, OperationType.UPDATE, reason=result.reason)
        await self.session.commit()
        return memory

    async def _audn_delete(self, result: AUDNResult) -> Memory | None:
        if result.memory_id is None:
            return None
        return await self.delete(result.memory_id) if result.memory_id else None

    async def _log(
        self, memory_id: UUID, op: OperationType,
        operator_id: UUID | None = None, content_before: str | None = None,
        content_after: str | None = None, reason: str | None = None,
    ) -> None:
        log = MemoryOperation(
            memory_id=memory_id, operation=op,
            operator_id=operator_id, content_before=content_before,
            content_after=content_after, reason=reason,
        )
        self.session.add(log)

    def _build_list_query(self, params: MemoryListParams):
        stmt = select(Memory).order_by(col(Memory.updated_at).desc())
        if params.namespace_id:
            stmt = stmt.where(Memory.namespace_id == params.namespace_id)
        if params.authority:
            stmt = stmt.where(Memory.authority == params.authority)
        if params.status:
            stmt = stmt.where(Memory.status == params.status)
        if params.pending_confirm is not None:
            stmt = stmt.where(Memory.pending_human_confirm == params.pending_confirm)
        offset = (params.page - 1) * params.size
        return stmt.offset(offset).limit(params.size)

    @staticmethod
    def _build_quality_input(memory: Memory) -> QualityInput:
        return QualityInput(
            useful_count=memory.useful_count,
            not_useful_count=memory.not_useful_count,
            source_role=memory.source_role,
            retrieve_count=memory.retrieve_count,
            created_at=memory.created_at,
            wrong_count=memory.wrong_count,
            outdated_count=memory.outdated_count,
        )
