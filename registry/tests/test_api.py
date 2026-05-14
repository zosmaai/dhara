"""Tests for the Dhara extension registry API server."""

import pytest
from httpx import AsyncClient, ASGITransport
from .main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.anyio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.anyio
async def test_search_empty(client):
    resp = await client.get("/api/v1/packages?q=zzzznotfound")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.anyio
async def test_search_seeded(client):
    resp = await client.get("/api/v1/packages?q=git")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert any(p["name"] == "git-tools" for p in data)


@pytest.mark.anyio
async def test_get_package(client):
    resp = await client.get("/api/v1/packages/git-tools")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "git-tools"
    assert "git_status" in data["tools"]


@pytest.mark.anyio
async def test_get_package_not_found(client):
    resp = await client.get("/api/v1/packages/nonexistent")
    assert resp.status_code == 404


@pytest.mark.anyio
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


@pytest.mark.anyio
async def test_publish_duplicate_version(client):
    payload = {
        "name": "test-pkg",
        "version": "1.0.0",
        "manifest": {
            "name": "test-pkg",
            "version": "1.0.0",
            "description": "Duplicate",
        },
    }
    resp = await client.post("/api/v1/packages", json=payload)
    assert resp.status_code == 409


@pytest.mark.anyio
async def test_download(client):
    resp = await client.get("/api/v1/packages/git-tools/download")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "git-tools"
