"""Thread state machine — defines valid transitions and side effects."""

from ..models.enums import ThreadStatus, ResolvedType, Authority

# ── Valid transitions ─────────────────────────────────────────

_VALID_TRANSITIONS: dict[ThreadStatus, set[ThreadStatus]] = {
    ThreadStatus.OPEN: {ThreadStatus.RESOLVED, ThreadStatus.TIMEOUT_CLOSED},
    ThreadStatus.RESOLVED: set(),
    ThreadStatus.TIMEOUT_CLOSED: set(),
}


def can_transition(current: ThreadStatus, target: ThreadStatus) -> bool:
    return target in _VALID_TRANSITIONS.get(current, set())


def validate_transition(current: ThreadStatus, target: ThreadStatus) -> None:
    if not can_transition(current, target):
        raise ValueError(f"Invalid transition: {current} → {target}")


# ── Authority mapping ─────────────────────────────────────────

_AUTHORITY_MAP: dict[ResolvedType, Authority] = {
    ResolvedType.AI_RESOLVED: Authority.NORMAL,
    ResolvedType.HUMAN_RESOLVED: Authority.LOCKED,
    ResolvedType.TIMEOUT: Authority.NORMAL,
}


def resolve_authority(resolved_type: ResolvedType) -> Authority:
    return _AUTHORITY_MAP[resolved_type]


def needs_human_confirm(resolved_type: ResolvedType) -> bool:
    return resolved_type == ResolvedType.TIMEOUT


def determine_resolved_type(is_ai_answer: bool, is_admin: bool) -> ResolvedType:
    if is_ai_answer:
        return ResolvedType.AI_RESOLVED
    return ResolvedType.HUMAN_RESOLVED
