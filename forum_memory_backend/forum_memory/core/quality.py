"""Quality score computation for memories."""

from datetime import datetime, timezone

from forum_memory.models.enums import Authority, UserRole, ROLE_WEIGHT
from forum_memory.config import get_settings


def _safe_ratio(num: int, denom: int) -> float:
    """Safe division returning 0.0 on zero denominator."""
    return num / denom if denom > 0 else 0.0


def _useful_ratio(useful: int, not_useful: int, wrong: int) -> float:
    """Compute useful ratio from feedback counts.
    Returns 0.5 (neutral) when no feedback exists yet."""
    total = useful + not_useful + wrong
    if total == 0:
        return 0.5
    return _safe_ratio(useful, total)


def _source_weight(source_role: str | None) -> float:
    """Weight by who provided the answer."""
    if not source_role:
        return 0.5
    try:
        role = UserRole(source_role)
    except ValueError:
        return 0.5
    return ROLE_WEIGHT.get(role, 0.5)


def _freshness(created_at: datetime) -> float:
    """Decay factor based on age — 1.0 for new, decays over 365 days.

    PostgreSQL TIMESTAMP (without time zone) is returned by psycopg2 as a
    timezone-naive datetime.  We treat any naive datetime as UTC to avoid
    the 'can't subtract offset-naive and offset-aware datetimes' error.
    """
    now = datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    days = (now - created_at).days
    return max(0.1, 1.0 - days / 365.0)


def _retrieve_heat(retrieve_count: int) -> float:
    """Normalize retrieval count to 0..1 range."""
    return min(1.0, retrieve_count / 100.0)


def _penalty(wrong: int, outdated: int) -> float:
    """Penalty factor for negative feedback."""
    settings = get_settings()
    threshold = settings.wrong_feedback_threshold
    score = (wrong + outdated * 0.5) / threshold
    return min(1.0, score)


def compute_quality_score(
    useful: int,
    not_useful: int,
    wrong: int,
    outdated: int,
    source_role: str | None,
    retrieve_count: int,
    created_at: datetime,
) -> float:
    """Compute overall quality score (0..1) from five factors."""
    ur = _useful_ratio(useful, not_useful, wrong)
    sw = _source_weight(source_role)
    rh = _retrieve_heat(retrieve_count)
    fr = _freshness(created_at)
    pn = _penalty(wrong, outdated)

    raw = 0.35 * ur + 0.20 * sw + 0.15 * rh + 0.15 * fr + 0.15 * (1 - pn)
    return round(max(0.0, min(1.0, raw)), 4)
