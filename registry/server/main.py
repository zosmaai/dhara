"""Dhara Extension Registry API Server.

A FastAPI-based registry for publishing and discovering
Dhara extensions.

Usage:
    uvicorn registry.server.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .models import Manifest, PackageDetail, PackageSummary, PublishRequest
from .storage import PackageConflictError, PackageNotFoundError, RegistryStore

app = FastAPI(
    title="Dhara Extension Registry",
    description="Package registry for Dhara extensions",
    version="0.1.0",
    contact={"name": "Zosma AI", "url": "https://zosma.ai"},
)

# Allow CORS for web UI and CLI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store
store = RegistryStore()


# ── Health ──────────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


# ── Search / List ───────────────────────────────────────────────────────────────


@app.get("/api/v1/packages", response_model=list[PackageSummary])
async def search_packages(
    q: str = Query("", description="Search query"),
    limit: int = Query(50, ge=1, le=100),
):
    """Search for packages by name or description."""
    return store.search(query=q, limit=limit)


# ── Package details ─────────────────────────────────────────────────────────────


@app.get("/api/v1/packages/{name}", response_model=PackageDetail)
async def get_package(name: str):
    """Get full details for a specific package."""
    try:
        return store.get_package(name)
    except PackageNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Download ─────────────────────────────────────────────────────────────────────


@app.get("/api/v1/packages/{name}/download")
async def download_package(name: str, version: str | None = None):
    """Download a package as a tarball."""
    try:
        pkg = store.get_package(name)
        if version and version not in {v.version for v in pkg.versions}:
            raise HTTPException(status_code=404, detail=f"Version {version} not found")
        store.record_download(name, version)
        return {
            "name": name,
            "version": version or (pkg.versions[0].version if pkg.versions else "unknown"),
            "url": f"/api/v1/packages/{name}/versions/{version or 'latest'}/download",
        }
    except PackageNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Publish ──────────────────────────────────────────────────────────────────────


@app.post("/api/v1/packages", response_model=PackageDetail, status_code=201)
async def publish_package(request: PublishRequest):
    """Publish a new package or version."""
    try:
        return store.publish(request.name, request.version, request.manifest)
    except PackageConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
