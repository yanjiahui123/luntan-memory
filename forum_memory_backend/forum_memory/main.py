"""Forum Memory Agent — FastAPI application (synchronous)."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from forum_memory.config import get_settings
from forum_memory.database import init_db
from forum_memory.api import register_routers


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables."""
    init_db()
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


app = create_app()
