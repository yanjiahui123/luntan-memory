"""OpenAI LLM provider (synchronous)."""

from openai import OpenAI

from forum_memory.providers.base import LLMProvider
from forum_memory.config import get_settings


class OpenAIProvider(LLMProvider):
    """OpenAI-based LLM provider using sync client."""

    def __init__(self):
        settings = get_settings()
        self.client = OpenAI(api_key=settings.llm_api_key)
        self.main_model = settings.llm_main_model
        self.small_model = settings.llm_small_model
        self.embed_model = settings.llm_embedding_model

    def complete(self, messages: list[dict], model: str | None = None) -> str:
        resp = self.client.chat.completions.create(
            model=model or self.main_model,
            messages=messages,
            temperature=0.2,
        )
        return resp.choices[0].message.content or ""

    def embed(self, text: str) -> list[float]:
        resp = self.client.embeddings.create(
            model=self.embed_model,
            input=[text],
        )
        return resp.data[0].embedding

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        resp = self.client.embeddings.create(
            model=self.embed_model,
            input=texts,
        )
        return [d.embedding for d in resp.data]
