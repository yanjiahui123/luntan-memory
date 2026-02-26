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
    """Startup: create tables."""
    try:
        init_db()
        logger.info("Database tables initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize database: %s", e)
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