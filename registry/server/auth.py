"""GitHub OAuth authentication for the Dhara extension registry."""

from __future__ import annotations

import hashlib
import os
import secrets
from typing import Any

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# Environment-based configuration
GITHUB_CLIENT_ID = os.environ.get("DHARA_GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("DHARA_GITHUB_CLIENT_SECRET", "")
JWT_SECRET = os.environ.get("DHARA_JWT_SECRET", secrets.token_hex(32))
REGISTRY_BASE_URL = os.environ.get("DHARA_REGISTRY_BASE_URL", "http://localhost:8000")

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory API key store (would be DB-backed in production)
_api_keys: dict[str, dict[str, Any]] = {}
# In-memory user store
_users: dict[str, dict[str, Any]] = {}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class APIKeyResponse(BaseModel):
    api_key: str
    name: str


class UserInfo(BaseModel):
    login: str
    name: str = ""
    avatar_url: str = ""


def get_oauth() -> OAuth | None:
    """Create OAuth client if configured."""
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        return None
    oauth = OAuth()
    oauth.register(
        name="github",
        client_id=GITHUB_CLIENT_ID,
        client_secret=GITHUB_CLIENT_SECRET,
        authorize_url="https://github.com/login/oauth/authorize",
        authorize_params=None,
        access_token_url="https://github.com/login/oauth/access_token",
        access_token_params=None,
        client_kwargs={"scope": "read:user"},
    )
    return oauth


def generate_api_key() -> str:
    """Generate a secure API key."""
    return f"dhr_{secrets.token_hex(32)}"


def hash_token(token: str) -> str:
    """Hash a token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


async def get_current_user(request: Request) -> dict[str, Any] | None:
    """Extract user from Authorization header (Bearer token or API key)."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header[7:]  # Remove "Bearer "

    # Check if it's an API key
    hashed = hash_token(token)
    if hashed in _api_keys:
        return _api_keys[hashed].get("user")

    # Check if it's a JWT session token (simplified: direct lookup)
    if hashed in _users:
        return _users[hashed]

    return None


async def require_user(user: dict[str, Any] | None = Depends(get_current_user)):
    """Require an authenticated user."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


# ── Routes ──────────────────────────────────────────────────────────────────────


@router.get("/login")
async def login_github(request: Request):
    """Start GitHub OAuth flow."""
    oauth = get_oauth()
    if not oauth:
        return JSONResponse(
            status_code=501,
            content={"error": "GitHub OAuth not configured. Set DHARA_GITHUB_CLIENT_ID and DHARA_GITHUB_CLIENT_SECRET."},
        )

    redirect_uri = f"{REGISTRY_BASE_URL}/auth/callback"
    return await oauth.github.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def auth_callback(request: Request):
    """GitHub OAuth callback — exchange code for token."""
    oauth = get_oauth()
    if not oauth:
        raise HTTPException(status_code=501, detail="OAuth not configured")

    token = await oauth.github.authorize_access_token(request)
    user_info = await oauth.github.get("user", token=token)
    gh_user = user_info.json()

    user_data = {
        "login": gh_user.get("login", "unknown"),
        "name": gh_user.get("name", "") or gh_user.get("login", ""),
        "avatar_url": gh_user.get("avatar_url", ""),
    }

    # Store user session
    session_token = secrets.token_hex(32)
    _users[hash_token(session_token)] = user_data

    return {
        "access_token": session_token,
        "token_type": "bearer",
        "user": user_data,
    }


@router.post("/api-keys")
async def create_api_key(user: dict[str, Any] = Depends(require_user)):
    """Create a new API key for the authenticated user."""
    api_key = generate_api_key()
    _api_keys[hash_token(api_key)] = {
        "key_prefix": api_key[:12],
        "user": user,
    }
    return APIKeyResponse(api_key=api_key, name=user.get("login", "user"))


@router.get("/me", response_model=UserInfo)
async def get_me(user: dict[str, Any] = Depends(require_user)):
    """Get current user info."""
    return UserInfo(**user)
