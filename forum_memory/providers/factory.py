"""Factory for creating LLM providers."""

from functools import lru_cache

from .base import LLMProvider
from ..config import get_settings

_REGISTRY: dict[str, type[LLMProvider]] = {}


def register_provider(name: str, cls: type[LLMProvider]) -> None:
    _REGISTRY[name] = cls


def _register_defaults():
    from .openai_provider import OpenAIProvider
    register_provider("openai", OpenAIProvider)


@lru_cache
def get_llm_provider() -> LLMProvider:
    """Return a singleton LLM provider based on config."""
    if not _REGISTRY:
        _register_defaults()
    provider_name = get_settings().llm_provider
    cls = _REGISTRY.get(provider_name)
    if cls is None:
        raise ValueError(f"Unknown LLM provider: {provider_name}")
    return cls()
