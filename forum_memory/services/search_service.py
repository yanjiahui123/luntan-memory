"""Search service — memory retrieval with query preprocessing and reranking."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.memory import Memory
from ..models.namespace import Namespace
from ..models.enums import MemoryStatus
from ..schemas.memory import MemorySearchRequest, MemorySearchResponse, MemorySearchHit, MemoryRead
from ..providers.base import LLMProvider
from ..core.prompts import QUERY_REWRITE_SYSTEM, QUERY_REWRITE_PROMPT


class SearchService:
    """Orchestrates the 4-stage search pipeline: preprocess → recall → rerank → postprocess."""

    def __init__(self, session: AsyncSession, llm: LLMProvider, es_client=None):
        self.session = session
        self.llm = llm
        self.es = es_client  # Elasticsearch client (injected)

    async def search(self, req: MemorySearchRequest) -> MemorySearchResponse:
        expanded_query = await self._preprocess(req)
        candidates = await self._recall(expanded_query, req)
        ranked = await self._rerank(expanded_query, candidates)
        hits = self._postprocess(ranked, req.env_hint)
        return MemorySearchResponse(hits=hits, query_expanded=expanded_query, total_recalled=len(candidates))

    async def find_similar(self, text: str, namespace_id: UUID, threshold: float = 0.75, top_k: int = 5) -> list[dict]:
        """Find similar memories for AUDN cycle (vector search only)."""
        embedding = await self.llm.embed(text)
        return await self._vector_search(embedding, namespace_id, threshold, top_k)

    # ── Stage 1: Query preprocessing ─────────────────────────

    async def _preprocess(self, req: MemorySearchRequest) -> str:
        dictionary = await self._load_dictionary(req.namespace_id)
        mapped = _apply_dictionary(req.query, dictionary)
        return await self._rewrite_query(mapped, dictionary)

    async def _load_dictionary(self, ns_id: UUID) -> dict:
        ns = await self.session.get(Namespace, ns_id)
        return ns.dictionary if ns else {}

    async def _rewrite_query(self, query: str, dictionary: dict) -> str:
        prompt = QUERY_REWRITE_PROMPT.format(query=query, dictionary=dictionary)
        resp = await self.llm.complete(prompt, system=QUERY_REWRITE_SYSTEM)
        return resp.content.strip()

    # ── Stage 2: ES hybrid recall ─────────────────────────────

    async def _recall(self, query: str, req: MemorySearchRequest) -> list[dict]:
        """ES hybrid search: dense vector + BM25 with authority weighting."""
        if self.es is None:
            return await self._fallback_pg_search(query, req)
        embedding = await self.llm.embed(query)
        return await self._hybrid_es_search(embedding, query, req)

    async def _hybrid_es_search(self, embedding: list[float], query: str, req: MemorySearchRequest) -> list[dict]:
        """Placeholder — real implementation calls ES function_score query."""
        # TODO: Implement ES hybrid search with function_score
        # Combines: dense_vector cosine + BM25 + authority boost + quality_score
        return []

    async def _vector_search(self, embedding: list[float], ns_id: UUID, threshold: float, top_k: int) -> list[dict]:
        """Placeholder — real implementation calls ES knn search."""
        # TODO: Implement ES knn search for AUDN similarity check
        return []

    async def _fallback_pg_search(self, query: str, req: MemorySearchRequest) -> list[dict]:
        """Simple PG text search fallback when ES is unavailable."""
        from sqlmodel import select, col
        stmt = (
            select(Memory)
            .where(Memory.namespace_id == req.namespace_id)
            .where(Memory.status == MemoryStatus.ACTIVE)
            .where(col(Memory.content).contains(query))
            .limit(req.top_k)
        )
        result = await self.session.exec(stmt)
        return [_memory_to_dict(m) for m in result.all()]

    # ── Stage 3: Rerank ───────────────────────────────────────

    async def _rerank(self, query: str, candidates: list[dict]) -> list[dict]:
        """Placeholder for BGE-Reranker-v2-m3 reranking."""
        # TODO: Call reranker model, re-sort candidates by relevance
        return candidates[:5]

    # ── Stage 4: Postprocess ──────────────────────────────────

    def _postprocess(self, candidates: list[dict], env_hint: str | None) -> list[MemorySearchHit]:
        return [_build_hit(c, env_hint) for c in candidates]


# ── Pure functions (≤ 5 lines each) ──────────────────────────

def _apply_dictionary(query: str, dictionary: dict) -> str:
    for slang, canonical in dictionary.items():
        query = query.replace(slang, f"{slang} {canonical}")
    return query


def _memory_to_dict(memory: Memory) -> dict:
    return {
        "id": str(memory.id), "content": memory.content,
        "authority": memory.authority, "quality_score": memory.quality_score,
        "environment": memory.environment, "tags": memory.tags,
    }


def _build_hit(candidate: dict, env_hint: str | None) -> MemorySearchHit:
    env_match, warning = _check_env_match(candidate.get("environment"), env_hint)
    return MemorySearchHit(
        memory=MemoryRead(**_pad_memory_read(candidate)),
        score=candidate.get("_score", 0.0),
        env_match=env_match,
        env_warning=warning,
    )


def _check_env_match(mem_env: str | None, hint: str | None) -> tuple[bool, str | None]:
    if hint is None or mem_env is None:
        return True, None
    if hint.lower() not in (mem_env or "").lower():
        return False, f"⚠️ This knowledge is from environment: {mem_env}"
    return True, None


def _pad_memory_read(data: dict) -> dict:
    """Ensure all required MemoryRead fields have defaults."""
    defaults = dict(
        id=data.get("id"), namespace_id=data.get("namespace_id", ""),
        content=data.get("content", ""), authority=data.get("authority", "NORMAL"),
        status=data.get("status", "ACTIVE"), quality_score=data.get("quality_score", 0.5),
        useful_count=0, not_useful_count=0, wrong_count=0, retrieve_count=0,
        source_type="forum", source_id=None, source_role=data.get("source_role", ""),
        knowledge_type=None, resolved_type=data.get("resolved_type", ""),
        tags=data.get("tags"), environment=data.get("environment"),
        pending_human_confirm=False, extra={},
        created_at=data.get("created_at", "2025-01-01T00:00:00Z"),
        updated_at=data.get("updated_at", "2025-01-01T00:00:00Z"),
    )
    return {**defaults, **data}
