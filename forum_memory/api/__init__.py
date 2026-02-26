"""API routers registration."""

from fastapi import APIRouter

from .namespaces import router as namespaces_router
from .threads import router as threads_router
from .memories import router as memories_router
from .feedback import router as feedback_router


def register_routers(app):
    """Register all API routers on the FastAPI app."""
    app.include_router(namespaces_router)
    app.include_router(threads_router)
    app.include_router(memories_router)
    app.include_router(feedback_router)
