"""Quality scoring engine for memories."""

from datetime import datetime, timezone
from dataclasses import dataclass

from ..models.enums import Authority, UserRole, ROLE_WEIGHT


@dataclass
class QualityInput:
    useful_count: int = 0
    not_useful_count: int = 0
    source_role: str = "commenter"
    retrieve_count: int = 0
    max_retrieve_count: int = 100
    created_at: datetime | None = None
    wrong_count: int = 0
    outdated_count: int = 0


def compute_quality_score(inp: QualityInput) -> float:
    """Compute quality_score from 0.0 to 1.0."""
    useful_ratio = _safe_ratio(inp.useful_count, inp.useful_count + inp.not_useful_count)
    source_weight = _source_weight(inp.source_role)
    heat = _retrieve_heat(inp.retrieve_count, inp.max_retrieve_count)
    freshness = _time_freshness(inp.created_at)
    penalty = _negative_penalty(inp.wrong_count, inp.outdated_count)

    return _weighted_sum(useful_ratio, source_weight, heat, freshness, penalty)


def should_demote(wrong_count: int, threshold: int = 3) -> bool:
    return wrong_count >= threshold


def should_recommend_promote(useful_count: int, total: int, min_fb: int, ratio: float) -> bool:
    if total < min_fb:
        return False
    return _safe_ratio(useful_count, total) > ratio


# ── Private helpers (each ≤ 5 lines) ─────────────────────────

def _safe_ratio(numerator: int, denominator: int) -> float:
    return numerator / denominator if denominator > 0 else 0.5


def _source_weight(role: str) -> float:
    try:
        return ROLE_WEIGHT[UserRole(role)]
    except (ValueError, KeyError):
        return 0.5


def _retrieve_heat(count: int, max_count: int) -> float:
    return min(count / max_count, 1.0) if max_count > 0 else 0.0


def _time_freshness(created_at: datetime | None) -> float:
    if created_at is None:
        return 0.5
    days_old = (datetime.now(timezone.utc) - created_at.replace(tzinfo=timezone.utc)).days
    return max(0.0, 1.0 - days_old / 365.0)


def _negative_penalty(wrong: int, outdated: int) -> float:
    return min((wrong * 0.2 + outdated * 0.1), 1.0)


def _weighted_sum(useful: float, source: float, heat: float, fresh: float, penalty: float) -> float:
    score = useful * 0.35 + source * 0.20 + heat * 0.15 + fresh * 0.15 - penalty * 0.15
    return max(0.0, min(1.0, score))
