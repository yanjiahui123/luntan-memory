"""Memory extraction pipeline — converts thread content to memories."""

import json

from ..providers.base import LLMProvider
from ..models.enums import ResolvedType
from .prompts import (
    FACT_EXTRACTION_SYSTEM, FACT_EXTRACTION_PROMPT,
    COMPRESSION_SYSTEM, COMPRESSION_PROMPT,
)
from .audn import run_audn_cycle, _extract_json
from ..schemas.memory import AUDNResult


# ── Public pipeline steps ─────────────────────────────────────

async def compress_if_needed(
    messages: list[dict],
    llm: LLMProvider,
    threshold: int = 10,
) -> str:
    """Compress thread if message count exceeds threshold."""
    content = _join_messages(messages)
    if len(messages) <= threshold:
        return content
    return await _compress(content, llm)


async def extract_facts(
    content: str,
    title: str,
    resolved_type: str,
    source_role: str,
    tags: list[str] | None = None,
    environment: str | None = None,
    llm: LLMProvider | None = None,
) -> list[str]:
    """Extract candidate facts from compressed thread content."""
    prompt = _build_extraction_prompt(content, title, resolved_type, source_role, tags, environment)
    resp = await llm.complete(prompt, system=FACT_EXTRACTION_SYSTEM)
    return _parse_facts(resp.content)


async def process_facts(
    facts: list[str],
    similar_memories_fn,
    llm: LLMProvider,
) -> list[AUDNResult]:
    """Run AUDN cycle on each candidate fact."""
    results = []
    for fact in facts:
        similar = await similar_memories_fn(fact)
        result = await run_audn_cycle(fact, similar, llm)
        results.append(result)
    return results


# ── Private helpers (each ≤ 5 lines) ─────────────────────────

def _join_messages(messages: list[dict]) -> str:
    lines = [f"[{m.get('role', 'user')}]: {m.get('content', '')}" for m in messages]
    return "\n".join(lines)


async def _compress(content: str, llm: LLMProvider) -> str:
    prompt = COMPRESSION_PROMPT.format(content=content)
    resp = await llm.complete(prompt, system=COMPRESSION_SYSTEM)
    return resp.content


def _build_extraction_prompt(
    content: str, title: str, resolved_type: str,
    source_role: str, tags: list[str] | None, environment: str | None,
) -> str:
    return FACT_EXTRACTION_PROMPT.format(
        title=title,
        resolved_type=resolved_type,
        source_role=source_role,
        tags=", ".join(tags) if tags else "none",
        environment=environment or "not specified",
        content=content,
    )


def _parse_facts(raw: str) -> list[str]:
    """Parse JSON array of facts from LLM response."""
    try:
        data = json.loads(_extract_json(raw))
        return [str(f) for f in data if isinstance(f, str)]
    except (json.JSONDecodeError, ValueError):
        return []
