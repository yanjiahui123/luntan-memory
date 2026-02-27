"""Application configuration using Pydantic Settings."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Global application settings."""

    app_name: str = "Forum Memory Agent"
    debug: bool = False

    # Database — sync driver (psycopg2)
    database_url: str = "postgresql://postgres:postgres@localhost:5432/forum_memory"
    database_echo: bool = False

    # Elasticsearch
    es_url: str = "http://localhost:9200"
    es_index_prefix: str = "forum_memory"
    es_enabled: bool = True
    es_username: str = ""
    es_password: str = ""
    es_verify_certs: bool = True
    es_knn_num_candidates: int = 100

    # LLM
    llm_provider: str = "openai"
    llm_api_key: str = ""
    llm_main_model: str = "gpt-4o"
    llm_small_model: str = "gpt-4o-mini"
    llm_embedding_model: str = "text-embedding-3-small"
    embedding_dimension: int = 1536

    # Custom provider (when llm_provider == "custom")
    custom_llm_url: str = ""
    custom_embed_url: str = ""
    custom_rerank_url: str = ""
    custom_api_key: str = ""
    custom_llm_model: str = ""
    custom_embed_model: str = ""
    custom_rerank_model: str = ""

    # Forum defaults
    thread_timeout_days: int = 7
    max_compress_messages: int = 10
    similarity_threshold: float = 0.75
    reranker_top_k: int = 5
    recall_top_k: int = 50

    # Quality thresholds
    wrong_feedback_threshold: int = 3
    promote_useful_ratio: float = 0.8
    promote_min_feedback: int = 10
    cold_inactive_days: int = 180
    archive_inactive_days: int = 365

    model_config = {"env_file": ".env", "env_prefix": "FM_"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
