"""RAG knowledge base service — calls external RAG API."""

import logging

import requests

from forum_memory.config import get_settings

logger = logging.getLogger(__name__)


def query_rag(kb_sn_list: list[str], question: str, uid: str = "forum_memory") -> str:
    """
    Query external RAG API with knowledge base serial numbers.

    Returns concatenated RAG results as text, or empty string on failure.
    """
    settings = get_settings()
    if not settings.rag_base_url or not kb_sn_list:
        return ""

    try:
        resp = requests.post(
            settings.rag_base_url,
            headers={"Content-Type": "application/json"},
            json={
                "kb_sn_list": kb_sn_list,
                "question": question,
                "uid": uid,
            },
            timeout=settings.rag_timeout,
        )
        resp.raise_for_status()
        data = resp.json()

        # Extract text from response — adapt based on actual API response format
        if isinstance(data, str):
            return data
        if isinstance(data, dict):
            # Try common response field names
            for key in ("answer", "result", "text", "content", "data"):
                if key in data and isinstance(data[key], str):
                    return data[key]
            # If data contains a list of results, concatenate them
            for key in ("results", "documents", "chunks", "data"):
                if key in data and isinstance(data[key], list):
                    parts = []
                    for item in data[key]:
                        if isinstance(item, str):
                            parts.append(item)
                        elif isinstance(item, dict):
                            parts.append(item.get("content", item.get("text", str(item))))
                    return "\n\n".join(parts)
        return str(data)
    except Exception:
        logger.exception("RAG query failed (non-fatal)")
        return ""
