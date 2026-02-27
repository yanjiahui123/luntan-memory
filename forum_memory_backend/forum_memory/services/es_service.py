"""Elasticsearch service — index management, CRUD, hybrid search."""

import logging
from uuid import UUID

from elasticsearch import Elasticsearch, NotFoundError
from elasticsearch.helpers import bulk

from forum_memory.config import get_settings

logger = logging.getLogger(__name__)

_client: Elasticsearch | None = None


# ── Client & Index ───────────────────────────────────────

def get_es_client() -> Elasticsearch | None:
    """Return ES client singleton, or None if disabled."""
    global _client
    settings = get_settings()
    if not settings.es_enabled:
        return None
    if _client is not None:
        return _client

    kwargs: dict = {"hosts": [settings.es_url], "verify_certs": settings.es_verify_certs}
    if settings.es_username:
        kwargs["basic_auth"] = (settings.es_username, settings.es_password)

    _client = Elasticsearch(**kwargs)
    return _client


def _index_name() -> str:
    return f"{get_settings().es_index_prefix}_memories"


def ensure_index() -> None:
    """Create the ES index with correct mapping if it doesn't exist."""
    es = get_es_client()
    if not es:
        return
    name = _index_name()
    if es.indices.exists(index=name):
        return

    settings_cfg = get_settings()
    body = {
        "settings": {
            "number_of_shards": 1,
            "number_of_replicas": 0,
        },
        "mappings": {
            "properties": {
                "memory_id":      {"type": "keyword"},
                "namespace_id":   {"type": "keyword"},
                "content":        {"type": "text", "analyzer": "standard"},
                "embedding":      {
                    "type": "dense_vector",
                    "dims": settings_cfg.embedding_dimension,
                    "index": True,
                    "similarity": "cosine",
                },
                "status":         {"type": "keyword"},
                "environment":    {"type": "keyword"},
                "tags":           {"type": "keyword"},
                "knowledge_type": {"type": "keyword"},
                "quality_score":  {"type": "float"},
            }
        },
    }
    es.indices.create(index=name, body=body)
    logger.info("Created ES index: %s (dims=%d)", name, settings_cfg.embedding_dimension)


# ── Document CRUD ────────────────────────────────────────

def index_memory(
    memory_id: UUID,
    namespace_id: UUID,
    content: str,
    embedding: list[float],
    status: str = "ACTIVE",
    environment: str | None = None,
    tags: list | None = None,
    knowledge_type: str | None = None,
    quality_score: float = 0.5,
) -> bool:
    """Index or update a memory document. Returns True on success."""
    es = get_es_client()
    if not es:
        return False
    try:
        doc = {
            "memory_id": str(memory_id),
            "namespace_id": str(namespace_id),
            "content": content,
            "embedding": embedding,
            "status": status,
            "environment": environment or "",
            "tags": tags or [],
            "knowledge_type": knowledge_type or "",
            "quality_score": quality_score,
        }
        es.index(index=_index_name(), id=str(memory_id), document=doc)
        return True
    except Exception:
        logger.exception("Failed to index memory %s", memory_id)
        return False


def delete_memory_doc(memory_id: UUID) -> bool:
    """Remove a memory document from ES. Returns True on success."""
    es = get_es_client()
    if not es:
        return False
    try:
        es.delete(index=_index_name(), id=str(memory_id))
        return True
    except NotFoundError:
        return True  # already gone
    except Exception:
        logger.exception("Failed to delete memory %s from ES", memory_id)
        return False


# ── Search ───────────────────────────────────────────────

def hybrid_search(
    namespace_id: UUID,
    query_text: str,
    query_embedding: list[float],
    limit: int = 50,
    status_filter: str = "ACTIVE",
) -> list[dict]:
    """BM25 + knn hybrid search with RRF fusion.

    Returns [{"memory_id": str, "score": float}, ...]
    """
    es = get_es_client()
    if not es:
        return []
    settings = get_settings()
    name = _index_name()

    filter_clauses = [
        {"term": {"namespace_id": str(namespace_id)}},
        {"term": {"status": status_filter}},
    ]

    try:
        resp = es.search(
            index=name,
            size=limit,
            query={
                "bool": {
                    "must": {"match": {"content": query_text}},
                    "filter": filter_clauses,
                }
            },
            knn={
                "field": "embedding",
                "query_vector": query_embedding,
                "k": limit,
                "num_candidates": settings.es_knn_num_candidates,
                "filter": {"bool": {"filter": filter_clauses}},
            },
            rank={"rrf": {"window_size": limit, "rank_constant": 60}},
        )
        return _parse_hits(resp)
    except Exception:
        logger.exception("ES hybrid search failed")
        return []


def knn_search(
    namespace_id: UUID,
    query_embedding: list[float],
    limit: int = 5,
    status_filter: str = "ACTIVE",
) -> list[dict]:
    """Pure knn vector search (for AUDN find_similar).

    Returns [{"memory_id": str, "score": float}, ...]
    """
    es = get_es_client()
    if not es:
        return []
    settings = get_settings()
    name = _index_name()

    filter_clauses = [
        {"term": {"namespace_id": str(namespace_id)}},
        {"term": {"status": status_filter}},
    ]

    try:
        resp = es.search(
            index=name,
            size=limit,
            knn={
                "field": "embedding",
                "query_vector": query_embedding,
                "k": limit,
                "num_candidates": settings.es_knn_num_candidates,
                "filter": {"bool": {"filter": filter_clauses}},
            },
        )
        return _parse_hits(resp)
    except Exception:
        logger.exception("ES knn search failed")
        return []


def _parse_hits(resp: dict) -> list[dict]:
    """Extract memory_id and score from ES response."""
    hits = resp.get("hits", {}).get("hits", [])
    return [{"memory_id": hit["_id"], "score": hit.get("_score", 0.0)} for hit in hits]


# ── Bulk ─────────────────────────────────────────────────

def bulk_reindex(memories: list[dict], batch_size: int = 100) -> int:
    """Bulk index memory dicts into ES. Returns success count.

    Each dict: memory_id, namespace_id, content, embedding, status,
    environment, tags, knowledge_type, quality_score.
    """
    es = get_es_client()
    if not es:
        return 0
    name = _index_name()

    actions = [
        {
            "_index": name,
            "_id": m["memory_id"],
            "_source": {
                "memory_id": m["memory_id"],
                "namespace_id": m["namespace_id"],
                "content": m["content"],
                "embedding": m["embedding"],
                "status": m["status"],
                "environment": m.get("environment") or "",
                "tags": m.get("tags") or [],
                "knowledge_type": m.get("knowledge_type") or "",
                "quality_score": m.get("quality_score", 0.5),
            },
        }
        for m in memories
    ]

    success, errors = bulk(es, actions, chunk_size=batch_size, raise_on_error=False)
    if errors:
        logger.warning("Bulk reindex had %d errors", len(errors))
    return success
