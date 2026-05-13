"""In-memory storage backend for the Dhara extension registry.

In production, this would be backed by PostgreSQL + S3.
For the MVP, we store everything in memory for fast iteration.
"""

from __future__ import annotations

import json
import time
from datetime import datetime
from typing import Any

from .models import Manifest, PackageDetail, PackageSummary, PackageVersion


class PackageConflictError(Exception):
    """Package already exists with this name/version."""


class PackageNotFoundError(Exception):
    """Package not found."""


class VersionNotFoundError(Exception):
    """Package version not found."""


class RegistryStore:
    """In-memory registry storage."""

    def __init__(self):
        self._packages: dict[str, dict[str, Any]] = {}
        self._seed_data()

    def _seed_data(self):
        """Seed with some initial packages for demo purposes."""
        demos = [
            {
                "name": "hello-ext",
                "description": "A friendly hello world extension",
                "author": "Zosma AI",
                "license": "MIT",
                "tools": ["hello", "echo"],
                "capabilities": [],
                "versions": ["1.0.0"],
            },
            {
                "name": "web-tools",
                "description": "Fetch URLs and search the web",
                "author": "Zosma AI",
                "license": "MIT",
                "tools": ["web_fetch", "web_search"],
                "capabilities": ["network:outbound"],
                "versions": ["1.0.0"],
            },
            {
                "name": "git-tools",
                "description": "Git operations — status, diff, log, commit",
                "author": "Zosma AI",
                "license": "MIT",
                "tools": ["git_status", "git_diff", "git_log", "git_commit"],
                "capabilities": ["process:spawn"],
                "versions": ["1.0.0", "1.1.0"],
            },
            {
                "name": "code-search",
                "description": "Code search with ripgrep",
                "author": "Zosma AI",
                "license": "MIT",
                "tools": ["code_search", "file_find"],
                "capabilities": ["process:spawn"],
                "versions": ["1.0.0"],
            },
            {
                "name": "test-runner",
                "description": "Auto-detect and run tests",
                "author": "Zosma AI",
                "license": "MIT",
                "tools": ["run_tests", "list_tests"],
                "capabilities": ["process:spawn"],
                "versions": ["1.0.0"],
            },
            {
                "name": "docker-extension",
                "description": "Docker operations",
                "author": "Zosma AI",
                "license": "MIT",
                "tools": ["docker_ps", "docker_logs", "docker_exec", "docker_compose"],
                "capabilities": ["process:spawn"],
                "versions": ["1.0.0"],
            },
        ]

        for demo in demos:
            now = "2026-05-14T00:00:00Z"
            pkg = {
                "name": demo["name"],
                "description": demo["description"],
                "author": demo["author"],
                "license": demo["license"],
                "repository": "https://github.com/zosmaai/dhara",
                "created_at": now,
                "updated_at": now,
                "downloads": 0,
                "tools": demo["tools"],
                "capabilities": demo["capabilities"],
                "versions": {},
            }
            for v in demo["versions"]:
                pkg["versions"][v] = {
                    "version": v,
                    "manifest": {
                        "name": demo["name"],
                        "version": v,
                        "description": demo["description"],
                    },
                    "created_at": now,
                    "file_size": 2048,
                    "downloads": 0,
                }
            self._packages[demo["name"]] = pkg

    def search(self, query: str = "", limit: int = 50) -> list[PackageSummary]:
        """Search packages by name and description."""
        q = query.lower()
        results = []
        for pkg in self._packages.values():
            if q and q not in pkg["name"].lower() and q not in pkg["description"].lower():
                continue
            latest_version = max(pkg["versions"].keys()) if pkg["versions"] else ""
            results.append(PackageSummary(
                name=pkg["name"],
                description=pkg["description"],
                version=latest_version,
                author=pkg["author"],
                license=pkg["license"],
                downloads=pkg["downloads"],
                capabilities=pkg["capabilities"],
                tools=pkg["tools"],
                updated_at=pkg["updated_at"],
            ))
        return sorted(results, key=lambda p: p.downloads, reverse=True)[:limit]

    def get_package(self, name: str) -> PackageDetail:
        """Get full package details."""
        pkg = self._packages.get(name)
        if not pkg:
            raise PackageNotFoundError(name)

        versions = [
            PackageVersion(
                version=v_data["version"],
                manifest=Manifest(**v_data["manifest"]),
                file_size=v_data["file_size"],
                downloads=v_data["downloads"],
            )
            for v_data in pkg["versions"].values()
        ]

        return PackageDetail(
            name=pkg["name"],
            description=pkg["description"],
            author=pkg["author"],
            license=pkg["license"],
            repository=pkg.get("repository", ""),
            created_at=pkg["created_at"],
            updated_at=pkg["updated_at"],
            downloads=pkg["downloads"],
            versions=versions,
            tools=pkg["tools"],
            capabilities=pkg["capabilities"],
        )

    def publish(self, name: str, version: str, manifest: Manifest) -> PackageDetail:
        """Publish a new package or version."""
        now = datetime.utcnow().isoformat() + "Z"

        if name in self._packages:
            pkg = self._packages[name]
            if version in pkg["versions"]:
                raise PackageConflictError(f"{name}@{version} already exists")
        else:
            pkg = {
                "name": name,
                "description": manifest.description,
                "author": manifest.author,
                "license": manifest.license,
                "repository": manifest.repository,
                "created_at": now,
                "updated_at": now,
                "downloads": 0,
                "tools": manifest.provides.get("tools", []),
                "capabilities": manifest.capabilities,
                "versions": {},
            }
            self._packages[name] = pkg

        pkg["versions"][version] = {
            "version": version,
            "manifest": manifest.model_dump(),
            "created_at": now,
            "file_size": len(json.dumps(manifest.model_dump())),
            "downloads": 0,
        }
        pkg["updated_at"] = now

        return self.get_package(name)

    def record_download(self, name: str, version: str | None = None):
        """Increment download count."""
        pkg = self._packages.get(name)
        if not pkg:
            raise PackageNotFoundError(name)
        pkg["downloads"] += 1
        if version and version in pkg["versions"]:
            pkg["versions"][version]["downloads"] += 1
