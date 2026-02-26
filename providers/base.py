"""LLM provider abstraction layer."""

from abc import ABC, abstractmethod
from pydantic import BaseModel


class LLMResponse(BaseModel):
    content: str
    model: str
    usage_tokens: int = 0


class LLMProvider(ABC):
    """Abstract base for all LLM providers."""

    @abstractmethod
    async def complete(self, prompt: str, system: str = "", model: str | None = None) -> LLMResponse:
        ...

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        ...

    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        ...
