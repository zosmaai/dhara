"""Package data models for the Dhara extension registry."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class ToolDefinition(BaseModel):
    """A tool provided by an extension package."""
    name: str
    description: str = ""
    parameters: dict[str, Any] = Field(default_factory=dict)
    capabilities: list[str] = Field(default_factory=list)


class Manifest(BaseModel):
    """Extension package manifest (mirrors spec/package-manifest.md)."""
    name: str
    version: str
    description: str = ""
    license: str = "MIT"
    author: str = ""
    repository: str = ""
    runtime: dict[str, Any] = Field(default_factory=lambda: {
        "type": "subprocess",
        "protocol": "json-rpc",
    })
    provides: dict[str, list[str]] = Field(default_factory=lambda: {"tools": []})
    capabilities: list[str] = Field(default_factory=list)


class PackageVersion(BaseModel):
    """A specific version of a package."""
    version: str
    manifest: Manifest
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    file_size: int = 0
    downloads: int = 0


class PackageSummary(BaseModel):
    """Summary of a package for search results."""
    name: str
    description: str = ""
    version: str = ""
    author: str = ""
    license: str = "MIT"
    downloads: int = 0
    capabilities: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    updated_at: str = ""


class PackageDetail(BaseModel):
    """Full package details."""
    name: str
    description: str = ""
    author: str = ""
    license: str = "MIT"
    repository: str = ""
    created_at: str = ""
    updated_at: str = ""
    downloads: int = 0
    versions: list[PackageVersion] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)


class PublishRequest(BaseModel):
    """Request body for publishing a package."""
    name: str
    version: str
    manifest: Manifest
    file_content: str = ""  # Base64-encoded tarball
