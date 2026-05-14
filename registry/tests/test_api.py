"""Tests for the Dhara extension registry API server.

Uses SQLite in-memory database for fast test execution.
Run from registry/ directory:
    python -m pytest tests/ -v
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from server.main import app


@pytest_asyncio.fixture
async def client():
    """Create a test client with in-memory SQLite."""
    from server.storage import RegistryStore
    import server.main as main_mod

    store = RegistryStore("sqlite+aiosqlite://")
    await store.init_db()
    main_mod.store = store

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_search_empty(client):
    resp = await client.get("/api/v1/packages?q=zzzznotfound")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_search_seeded(client):
    resp = await client.get("/api/v1/packages?q=git")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert any(p["name"] == "git-tools" for p in data)


@pytest.mark.asyncio
async def test_get_package(client):
    resp = await client.get("/api/v1/packages/git-tools")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "git-tools"
    assert "git_status" in data["tools"]


@pytest.mark.asyncio
async def test_get_package_not_found(client):
    resp = await client.get("/api/v1/packages/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_publish_new(client):
    payload = {
        "name": "test-pkg",
        "version": "1.0.0",
        "manifest": {
            "name": "test-pkg",
            "version": "1.0.0",
            "description": "A test package",
            "author": "Test Author",
            "provides": {"tools": ["test_tool"]},
            "capabilities": ["filesystem:read"],
        },
    }
    resp = await client.post("/api/v1/packages", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "test-pkg"
    assert "test_tool" in data["tools"]


@pytest.mark.asyncio
async def test_publish_duplicate_version(client):
    payload = {
        "name": "dup-pkg",
        "version": "1.0.0",
        "manifest": {
            "name": "dup-pkg",
            "version": "1.0.0",
            "description": "First publish",
        },
    }
    # First publish succeeds
    resp = await client.post("/api/v1/packages", json=payload)
    assert resp.status_code == 201

    # Second publish of same version fails
    resp = await client.post("/api/v1/packages", json=payload)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_download(client):
    resp = await client.get("/api/v1/packages/git-tools/download")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "git-tools"
