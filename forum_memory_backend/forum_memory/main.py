"""Forum Memory Agent — FastAPI application (synchronous)."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from forum_memory.config import get_settings
from forum_memory.database import init_db
from forum_memory.api import register_routers

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables and ES index."""
    try:
        init_db()
        logger.info("Database tables initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize database: %s", e)
    # Initialize ES indices (non-fatal if ES unavailable)
    try:
        from forum_memory.services.es_service import ensure_index, ensure_index_by_name
        # Ensure default fallback index
        ensure_index()
        # Ensure per-namespace indices
        from sqlmodel import Session, select
        from forum_memory.database import engine as db_engine
        from forum_memory.models.namespace import Namespace
        with Session(db_engine) as session:
            namespaces = session.exec(
                select(Namespace).where(Namespace.is_active == True)
            ).all()
            for ns in namespaces:
                if ns.es_index_name:
                    try:
                        ensure_index_by_name(ns.es_index_name)
                    except Exception:
                        logger.warning("Failed to ensure ES index %s", ns.es_index_name)
        logger.info("Elasticsearch indices ensured")
    except Exception as e:
        logger.warning("Elasticsearch index creation failed (non-fatal): %s", e)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        lifespan=lifespan,
    )
    _add_cors(app)
    register_routers(app)
    _add_health_check(app)
    return app


def _add_cors(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def _add_health_check(app: FastAPI) -> None:
    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/v1/health/db")
    def health_db():
        """检查数据库连接"""
        from forum_memory.database import engine
        from sqlalchemy import text
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return {"status": "ok", "database": "connected"}
        except Exception as e:
            return {"status": "error", "database": str(e)}


app = create_app()