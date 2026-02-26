"""Forum Memory Agent — FastAPI application."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import get_settings
from .database import init_db
from .api import register_routers


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    await init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        lifespan=lifespan,
    )
    register_routers(app)
    _add_health_check(app)
    return app


def _add_health_check(app: FastAPI) -> None:
    @app.get("/health")
    async def health():
        return {"status": "ok"}


app = create_app()
