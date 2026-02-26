"""Extraction helper logic — compress and parse LLM outputs."""

import json
import logging

from forum_memory.core.prompts import (
    FACT_EXTRACTION_SYSTEM, FACT_EXTRACTION_USER,
    COMPRESS_SYSTEM, COMPRESS_USER,
)

logger = logging.getLogger(__name__)


def build_compress_messages(title: str, discussion: str) -> list[dict]:
    """Build messages for the compression LLM call."""
    return [
        {"role": "system", "content": COMPRESS_SYSTEM},
        {"role": "user", "content": COMPRESS_USER.format(title=title, discussion=discussion)},
    ]


def build_extract_messages(title: str, question: str, discussion: str) -> list[dict]:
    """Build messages for the fact extraction LLM call."""
    return [
        {"role": "system", "content": FACT_EXTRACTION_SYSTEM},
        {"role": "user", "content": FACT_EXTRACTION_USER.format(title=title, question=question, discussion=discussion)},
    ]


def parse_extracted_facts(raw: str) -> list[dict]:
    """Parse LLM output into a list of fact dicts."""
    text = raw.strip()
    if text.startswith("```"):
        text = _strip_code_fences(text)
    try:
        facts = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Failed to parse extraction output: %s", text[:200])
        return []
    if not isinstance(facts, list):
        return []
    return [f for f in facts if _is_valid_fact(f)]


def _strip_code_fences(text: str) -> str:
    """Remove markdown code fences."""
    lines = text.split("\n")
    if lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines)


def _is_valid_fact(fact: dict) -> bool:
    """Check that a fact dict has required fields."""
    return isinstance(fact, dict) and bool(fact.get("content"))
