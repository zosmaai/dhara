"""Database-backed storage for the Dhara extension registry.

Supports both SQLite (development) and PostgreSQL (production) via SQLAlchemy.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from .database import Base, PackageORM, VersionORM, get_database_url
from .models import Manifest, PackageDetail, PackageSummary, PackageVersion


class PackageConflictError(Exception):
    """Package already exists with this name/version."""


class PackageNotFoundError(Exception):
    """Package not found."""


class RegistryStore:
    """Async database-backed registry storage."""

    def __init__(self, database_url: str | None = None):
        url = database_url or get_database_url()
        self.engine = create_async_engine(url, echo=False)
        self.session_factory = sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)

    async def init_db(self):
        """Create all tables."""
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        # Seed demo packages
        for demo in self._seed_data():
            try:
                await self._ensure_seeded(demo)
            except Exception:
                pass  # Already exists

    async def close(self):
        """Dispose of the engine."""
        await self.engine.dispose()

    async def _ensure_seeded(self, demo: dict[str, Any]):
        """Insert a demo package if it doesn't exist."""
        async with self.session_factory() as session:
            result = await session.execute(select(PackageORM).where(PackageORM.name == demo["name"]))
            if result.scalar_one_or_none():
                return

            now = datetime.now(timezone.utc)
            pkg = PackageORM(
                name=demo["name"],
                description=demo["description"],
                author=demo["author"],
                license=demo["license"],
                tools=json.dumps(demo["tools"]),
                capabilities=json.dumps(demo["capabilities"]),
                created_at=now,
                updated_at=now,
            )
            session.add(pkg)

            for v in demo["versions"]:
                ver = VersionORM(
                    package_name=demo["name"],
                    version=v,
                    manifest_json=json.dumps({
                        "name": demo["name"],
                        "version": v,
                        "description": demo["description"],
                    }),
                    file_size=2048,
                )
                session.add(ver)

            await session.commit()

    async def search(self, query: str = "", limit: int = 50) -> list[PackageSummary]:
        """Search packages by name and description."""
        async with self.session_factory() as session:
            stmt = select(PackageORM)
            if query:
                q = f"%{query.lower()}%"
                stmt = stmt.where(
                    (PackageORM.name.ilike(q)) | (PackageORM.description.ilike(q))
                )
            stmt = stmt.order_by(PackageORM.downloads.desc()).limit(limit)
            result = await session.execute(stmt)
            packages = result.scalars().all()

            return [
                PackageSummary(
                    name=pkg.name,
                    description=pkg.description,
                    version=await self._latest_version(session, pkg.name),
                    author=pkg.author,
                    license=pkg.license,
                    downloads=pkg.downloads,
                    capabilities=json.loads(pkg.capabilities or "[]"),
                    tools=json.loads(pkg.tools or "[]"),
                    updated_at=pkg.updated_at.isoformat() if pkg.updated_at else "",
                )
                for pkg in packages
            ]

    async def _latest_version(self, session: AsyncSession, name: str) -> str:
        """Get the latest version string for a package."""
        stmt = (
            select(VersionORM.version)
            .where(VersionORM.package_name == name)
            .order_by(VersionORM.created_at.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        row = result.scalar_one_or_none()
        return row or ""

    async def get_package(self, name: str) -> PackageDetail:
        """Get full package details."""
        async with self.session_factory() as session:
            result = await session.execute(select(PackageORM).where(PackageORM.name == name))
            pkg = result.scalar_one_or_none()
            if not pkg:
                raise PackageNotFoundError(name)

            versions_result = await session.execute(
                select(VersionORM)
                .where(VersionORM.package_name == name)
                .order_by(VersionORM.created_at.desc())
            )
            versions = versions_result.scalars().all()

            return PackageDetail(
                name=pkg.name,
                description=pkg.description,
                author=pkg.author,
                license=pkg.license,
                repository=pkg.repository or "",
                created_at=pkg.created_at.isoformat() if pkg.created_at else "",
                updated_at=pkg.updated_at.isoformat() if pkg.updated_at else "",
                downloads=pkg.downloads,
                versions=[
                    PackageVersion(
                        version=v.version,
                        manifest=Manifest(**json.loads(v.manifest_json)),
                        file_size=v.file_size,
                        downloads=v.downloads,
                    )
                    for v in versions
                ],
                tools=json.loads(pkg.tools or "[]"),
                capabilities=json.loads(pkg.capabilities or "[]"),
            )

    async def publish(self, name: str, version: str, manifest: Manifest) -> PackageDetail:
        """Publish a new package or version."""
        async with self.session_factory() as session:
            result = await session.execute(select(PackageORM).where(PackageORM.name == name))
            pkg = result.scalar_one_or_none()

            now = datetime.now(timezone.utc)

            if pkg:
                # Check if version exists
                v_result = await session.execute(
                    select(VersionORM).where(
                        (VersionORM.package_name == name) & (VersionORM.version == version)
                    )
                )
                if v_result.scalar_one_or_none():
                    raise PackageConflictError(f"{name}@{version} already exists")

                pkg.description = manifest.description or pkg.description
                pkg.author = manifest.author or pkg.author
                pkg.license = manifest.license or pkg.license
                pkg.tools = json.dumps(manifest.provides.get("tools", []))
                pkg.capabilities = json.dumps(manifest.capabilities)
                pkg.updated_at = now
            else:
                pkg = PackageORM(
                    name=name,
                    description=manifest.description,
                    author=manifest.author,
                    license=manifest.license,
                    repository=manifest.repository,
                    tools=json.dumps(manifest.provides.get("tools", [])),
                    capabilities=json.dumps(manifest.capabilities),
                    created_at=now,
                    updated_at=now,
                )
                session.add(pkg)

            ver = VersionORM(
                package_name=name,
                version=version,
                manifest_json=json.dumps(manifest.model_dump()),
                file_size=len(json.dumps(manifest.model_dump())),
            )
            session.add(ver)

            await session.commit()
            return await self.get_package(name)

    async def record_download(self, name: str, version: str | None = None):
        """Increment download count."""
        async with self.session_factory() as session:
            result = await session.execute(select(PackageORM).where(PackageORM.name == name))
            pkg = result.scalar_one_or_none()
            if not pkg:
                raise PackageNotFoundError(name)
            pkg.downloads += 1
            if version:
                v_result = await session.execute(
                    select(VersionORM).where(
                        (VersionORM.package_name == name) & (VersionORM.version == version)
                    )
                )
                ver = v_result.scalar_one_or_none()
                if ver:
                    ver.downloads += 1
            await session.commit()

    def _seed_data(self) -> list[dict[str, Any]]:
        """Return seed data for initial demo packages."""
        return [
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
