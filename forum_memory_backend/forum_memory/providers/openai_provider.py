"""OpenAI-compatible LLM provider."""

from .base import LLMProvider, LLMResponse
from ..config import get_settings


class OpenAIProvider(LLMProvider):
    """OpenAI API provider (also works with Azure / compatible APIs)."""

    def __init__(self):
        from openai import AsyncOpenAI
        settings = get_settings()
        self._client = AsyncOpenAI(api_key=settings.llm_api_key)
        self._main_model = settings.llm_main_model
        self._embed_model = settings.llm_embedding_model

    async def complete(self, prompt: str, system: str = "", model: str | None = None) -> LLMResponse:
        messages = self._build_messages(prompt, system)
        resp = await self._client.chat.completions.create(
            model=model or self._main_model,
            messages=messages,
        )
        return self._parse_response(resp)

    async def embed(self, text: str) -> list[float]:
        resp = await self._client.embeddings.create(model=self._embed_model, input=text)
        return resp.data[0].embedding

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        resp = await self._client.embeddings.create(model=self._embed_model, input=texts)
        return [d.embedding for d in resp.data]

    # ── Private helpers ───────────────────────────────────────

    @staticmethod
    def _build_messages(prompt: str, system: str) -> list[dict]:
        msgs: list[dict] = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.append({"role": "user", "content": prompt})
        return msgs

    @staticmethod
    def _parse_response(resp) -> LLMResponse:
        choice = resp.choices[0]
        return LLMResponse(
            content=choice.message.content or "",
            model=resp.model,
            usage_tokens=resp.usage.total_tokens if resp.usage else 0,
        )
