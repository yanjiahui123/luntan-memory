"""Memory search service — sync.

The 4-stage pipeline: preprocess → recall → rerank → env_match.
Uses ES hybrid search (BM25 + knn) for recall, falls back to SQL LIKE if ES unavailable.
"""

import logging
from uuid import UUID
from datetime import datetime, timezone

from sqlmodel import Session, select

from forum_memory.models.memory import Memory
from forum_memory.models.namespace import Namespace
from forum_memory.models.enums import MemoryStatus
from forum_memory.schemas.memory import MemorySearchRequest, MemorySearchResponse, MemorySearchHit, MemoryRead
from forum_memory.core.prompts import QUERY_REWRITE_SYSTEM, QUERY_REWRITE_USER
from forum_memory.providers import get_provider
from forum_memory.config import get_settings
from forum_memory.services import es_service

logger = logging.getLogger(__name__)


def search_memories(session: Session, req: MemorySearchRequest) -> MemorySearchResponse:
    """Run the full search pipeline."""
    expanded = _preprocess_query(session, req)
    candidates = _recall(session, req.namespace_id, expanded, req.top_k * 5)
    ranked = _simple_rank(candidates, expanded, req.top_k)
    hits = _build_hits(session, ranked, req.environment)
    return MemorySearchResponse(hits=hits, query_expanded=expanded, total_recalled=len(candidates))


def find_similar(session: Session, namespace_id: UUID, content: str, top_k: int = 5) -> list[dict]:
    """Find similar memories for AUDN dedup via ES knn, fallback to text overlap."""
    # Try ES knn search
    try:
        provider = get_provider()
        content_embedding = provider.embed(content)
        es_hits = es_service.knn_search(
            namespace_id=namespace_id,
            query_embedding=content_embedding,
            limit=top_k,
        )
        if es_hits:
            memory_ids = [UUID(h["memory_id"]) for h in es_hits]
            stmt = select(Memory).where(Memory.id.in_(memory_ids))
            memories_map = {str(m.id): m for m in session.exec(stmt).all()}
            results = []
            for hit in es_hits:
                m = memories_map.get(hit["memory_id"])
                if m:
                    results.append({"id": str(m.id), "content": m.content, "authority": m.authority})
            return results
    except Exception:
        logger.exception("ES find_similar failed, falling back to text overlap")

    # Fallback: SQL + text_overlap
    stmt = (
        select(Memory)
        .where(Memory.namespace_id == namespace_id, Memory.status == MemoryStatus.ACTIVE)
        .limit(top_k * 10)
    )
    memories = list(session.exec(stmt).all())
    results = []
    for m in memories:
        if _text_overlap(content, m.content) > 0.2:
            results.append({"id": str(m.id), "content": m.content, "authority": m.authority})
    return results[:top_k]


def _preprocess_query(session: Session, req: MemorySearchRequest) -> str:
    ns = session.get(Namespace, req.namespace_id)
    if not ns or not ns.dictionary:
        query = req.query
        dictionary = {}
    else:
        query = _apply_dictionary(req.query, ns.dictionary)
        dictionary = ns.dictionary

    # LLM query rewrite for better recall
    try:
        provider = get_provider()
        rewritten = provider.complete(
            [
                {"role": "system", "content": QUERY_REWRITE_SYSTEM},
                {"role": "user", "content": QUERY_REWRITE_USER.format(
                    query=query, dictionary=dictionary,
                )},
            ],
        )
        if rewritten and rewritten.strip():
            return rewritten.strip()
    except Exception:
        pass  # fallback to dictionary-only result
    return query


def _apply_dictionary(query: str, dictionary: dict) -> str:
    result = query
    for slang, canonical in dictionary.items():
        if slang.lower() in result.lower():
            result = result.replace(slang, canonical)
    return result


def _recall(session: Session, ns_id: UUID, query: str, limit: int) -> list[Memory]:
    """Recall candidates via ES hybrid search, fallback to SQL LIKE."""
    # Try ES hybrid search
    try:
        provider = get_provider()
        query_embedding = provider.embed(query)
        es_hits = es_service.hybrid_search(
            namespace_id=ns_id,
            query_text=query,
            query_embedding=query_embedding,
            limit=limit,
        )
        if es_hits:
            memory_ids = [UUID(h["memory_id"]) for h in es_hits]
            return _fetch_memories_by_ids(session, memory_ids)
    except Exception:
        logger.exception("ES recall failed, falling back to SQL")

    # Fallback: SQL LIKE
    stmt = (
        select(Memory)
        .where(Memory.namespace_id == ns_id, Memory.status == MemoryStatus.ACTIVE)
        .limit(limit)
    )
    keywords = query.split()
    for kw in keywords[:3]:
        stmt = stmt.where(Memory.content.contains(kw))
    return list(session.exec(stmt).all())


def _fetch_memories_by_ids(session: Session, memory_ids: list[UUID]) -> list[Memory]:
    """Fetch Memory objects by IDs, preserving ES ranking order."""
    if not memory_ids:
        return []
    stmt = select(Memory).where(Memory.id.in_(memory_ids))
    memories_map = {m.id: m for m in session.exec(stmt).all()}
    return [memories_map[mid] for mid in memory_ids if mid in memories_map]


def _simple_rank(candidates: list[Memory], query: str, top_k: int) -> list[Memory]:
    """Rank candidates using provider rerank, fallback to text overlap."""
    if not candidates:
        return []
    try:
        provider = get_provider()
        docs = [m.content for m in candidates]
        scores = provider.rerank(query, docs)
        scored = list(zip(candidates, scores))
        scored.sort(key=lambda x: x[1], reverse=True)
        return [m for m, _ in scored[:top_k]]
    except Exception:
        # fallback to text overlap
        scored = [(m, _text_overlap(query, m.content)) for m in candidates]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [m for m, _ in scored[:top_k]]


def _text_overlap(a: str, b: str) -> float:
    tokens_a = set(a.lower().split())
    tokens_b = set(b.lower().split())
    if not tokens_a or not tokens_b:
        return 0.0
    inter = tokens_a & tokens_b
    return len(inter) / max(len(tokens_a), len(tokens_b))


def _build_hits(session: Session, memories: list[Memory], env: str | None) -> list[MemorySearchHit]:
    now = datetime.now(timezone.utc)
    hits = []
    for m in memories:
        # Update retrieval stats
        m.retrieve_count += 1
        m.last_retrieved_at = now
        env_match = _check_env(m.environment, env)
        warning = None if env_match else "环境不匹配，请确认适用性"
        hit = MemorySearchHit(
            memory=MemoryRead.model_validate(m),
            score=m.quality_score,
            env_match=env_match,
            env_warning=warning,
        )
        hits.append(hit)
    if memories:
        session.commit()
    return hits


def _check_env(mem_env: str | None, req_env: str | None) -> bool:
    if not req_env or not mem_env:
        return True
    return req_env.lower() in mem_env.lower()
