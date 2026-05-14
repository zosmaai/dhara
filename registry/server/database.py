"""SQLAlchemy models for the Dhara extension registry."""

from __future__ import annotations

import os
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class PackageORM(Base):
    __tablename__ = "packages"

    name = Column(String(256), primary_key=True)
    description = Column(Text, default="")
    author = Column(String(256), default="")
    license = Column(String(64), default="MIT")
    repository = Column(String(1024), default="")
    tools = Column(Text, default="[]")  # JSON array
    capabilities = Column(Text, default="[]")  # JSON array
    downloads = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    versions = relationship("VersionORM", back_populates="package", cascade="all, delete-orphan")


class VersionORM(Base):
    __tablename__ = "versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    package_name = Column(String(256), ForeignKey("packages.name"), nullable=False)
    version = Column(String(64), nullable=False)
    manifest_json = Column(Text, nullable=False)
    file_size = Column(Integer, default=0)
    downloads = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    package = relationship("PackageORM", back_populates="versions")


def get_database_url() -> str:
    """Get database URL from environment or default to SQLite for dev."""
    return os.environ.get(
        "DHARA_REGISTRY_DATABASE_URL",
        "sqlite+aiosqlite:///./registry.db",
    )


def create_tables(engine_url: str | None = None):
    """Create all tables synchronously (for startup)."""
    url = engine_url or get_database_url()
    # Use sync driver for table creation
    sync_url = url.replace("+aiosqlite", "").replace("+asyncpg", "").replace("+psycopg2", "")
    engine = create_engine(sync_url)
    Base.metadata.create_all(engine)
    engine.dispose()
