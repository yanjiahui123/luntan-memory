"""Namespace (board) service — business logic."""

from uuid import UUID

from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.namespace import Namespace
from ..models.memory import Memory
from ..models.thread import Thread
from ..models.enums import MemoryStatus, Authority, ThreadStatus, ResolvedType
from ..schemas.namespace import NamespaceCreate, NamespaceUpdate, NamespaceStats


class NamespaceService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, data: NamespaceCreate, owner_id: UUID) -> Namespace:
        ns = Namespace(**data.model_dump(), owner_id=owner_id)
        self.session.add(ns)
        await self.session.commit()
        await self.session.refresh(ns)
        return ns

    async def get(self, ns_id: UUID) -> Namespace | None:
        return await self.session.get(Namespace, ns_id)

    async def get_by_name(self, name: str) -> Namespace | None:
        stmt = select(Namespace).where(Namespace.name == name)
        result = await self.session.exec(stmt)
        return result.first()

    async def update(self, ns_id: UUID, data: NamespaceUpdate) -> Namespace | None:
        ns = await self.get(ns_id)
        if ns is None:
            return None
        return await self._apply_update(ns, data)

    async def update_dictionary(self, ns_id: UUID, entries: dict[str, str]) -> Namespace | None:
        ns = await self.get(ns_id)
        if ns is None:
            return None
        ns.dictionary = {**ns.dictionary, **entries}
        await self.session.commit()
        await self.session.refresh(ns)
        return ns

    async def get_stats(self, ns_id: UUID) -> NamespaceStats:
        memories = await self._count_memories(ns_id)
        threads = await self._count_threads(ns_id)
        return NamespaceStats(**memories, **threads)

    async def list_all(self, active_only: bool = True) -> list[Namespace]:
        stmt = select(Namespace)
        if active_only:
            stmt = stmt.where(Namespace.is_active == True)
        result = await self.session.exec(stmt)
        return list(result.all())

    # ── Private helpers ───────────────────────────────────────

    async def _apply_update(self, ns: Namespace, data: NamespaceUpdate) -> Namespace:
        for key, val in data.model_dump(exclude_unset=True).items():
            setattr(ns, key, val)
        await self.session.commit()
        await self.session.refresh(ns)
        return ns

    async def _count_memories(self, ns_id: UUID) -> dict:
        base = select(func.count()).where(Memory.namespace_id == ns_id)
        total = await self._scalar(base)
        active = await self._scalar(base.where(Memory.status == MemoryStatus.ACTIVE))
        locked = await self._scalar(base.where(Memory.authority == Authority.LOCKED))
        pending = await self._scalar(base.where(Memory.pending_human_confirm == True))
        return dict(total_memories=total, active_memories=active, locked_memories=locked, pending_confirm=pending)

    async def _count_threads(self, ns_id: UUID) -> dict:
        base = select(func.count()).where(Thread.namespace_id == ns_id)
        total = await self._scalar(base)
        resolved = await self._scalar(base.where(Thread.status == ThreadStatus.RESOLVED))
        ai_ct = await self._scalar(base.where(Thread.resolved_type == ResolvedType.AI_RESOLVED))
        rate = ai_ct / resolved if resolved > 0 else 0.0
        return dict(total_threads=total, resolved_threads=resolved, ai_resolve_rate=rate)

    async def _scalar(self, stmt) -> int:
        result = await self.session.exec(stmt)
        return result.first() or 0
