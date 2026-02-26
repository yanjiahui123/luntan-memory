"""AUDN cycle — Add/Update/Delete/None decision engine."""

import json
from uuid import UUID

from ..models.enums import AUDNAction, Authority
from ..schemas.memory import AUDNResult
from ..providers.base import LLMProvider
from .prompts import AUDN_SYSTEM, AUDN_PROMPT


async def run_audn_cycle(
    new_fact: str,
    similar_memories: list[dict],
    llm: LLMProvider,
) -> AUDNResult:
    """Decide how to handle a new candidate fact against existing memories."""
    if not similar_memories:
        return _add_result(new_fact)

    raw = await _call_llm(new_fact, similar_memories, llm)
    result = _parse_audn_response(raw)
    return _apply_authority_guard(result, similar_memories)


# ── Internal steps (each ≤ 5 lines) ──────────────────────────

def _add_result(content: str) -> AUDNResult:
    return AUDNResult(action=AUDNAction.ADD, content=content, reason="No similar memory found")


async def _call_llm(fact: str, memories: list[dict], llm: LLMProvider) -> str:
    memories_text = _format_memories(memories)
    prompt = AUDN_PROMPT.format(new_fact=fact, existing_memories=memories_text)
    resp = await llm.complete(prompt, system=AUDN_SYSTEM)
    return resp.content


def _format_memories(memories: list[dict]) -> str:
    lines = []
    for m in memories:
        lines.append(f"[{m['id']}] (authority={m['authority']}): {m['content']}")
    return "\n".join(lines)


def _parse_audn_response(raw: str) -> AUDNResult:
    """Parse LLM JSON response into AUDNResult."""
    try:
        data = json.loads(_extract_json(raw))
    except (json.JSONDecodeError, ValueError):
        return AUDNResult(action=AUDNAction.NONE, reason="Failed to parse LLM response")
    return _build_result_from_dict(data)


def _extract_json(text: str) -> str:
    """Extract JSON from possible markdown code fences."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0]
    return text.strip()


def _build_result_from_dict(data: dict) -> AUDNResult:
    return AUDNResult(
        action=AUDNAction(data.get("action", "NONE")),
        memory_id=_safe_uuid(data.get("target_memory_id")),
        content=data.get("updated_content"),
        reason=data.get("reason", ""),
        conflict_alert=data.get("conflict_alert", False),
    )


def _safe_uuid(val) -> UUID | None:
    if val is None:
        return None
    try:
        return UUID(str(val))
    except ValueError:
        return None


def _apply_authority_guard(result: AUDNResult, memories: list[dict]) -> AUDNResult:
    """Enforce LOCKED protection: never auto-modify LOCKED memories."""
    if result.action in (AUDNAction.ADD, AUDNAction.NONE):
        return result
    target = _find_target(result.memory_id, memories)
    if target and target.get("authority") == Authority.LOCKED:
        return _escalate_to_conflict(result)
    return result


def _find_target(memory_id: UUID | None, memories: list[dict]) -> dict | None:
    if memory_id is None:
        return None
    return next((m for m in memories if str(m["id"]) == str(memory_id)), None)


def _escalate_to_conflict(result: AUDNResult) -> AUDNResult:
    return AUDNResult(
        action=AUDNAction.ADD,
        content=result.content,
        reason=f"Conflict with LOCKED memory; original action was {result.action}",
        conflict_alert=True,
    )
