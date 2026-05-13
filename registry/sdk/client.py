"""Python client for the Dhara Extension Registry API."""

from __future__ import annotations

import json
from typing import Any
from urllib.request import Request, urlopen


class RegistryClient:
    """Client for the Dhara Extension Registry API."""

    def __init__(self, base_url: str = "https://registry.dhara.zosma.ai"):
        self.base_url = base_url.rstrip("/")
        self.api_key: str | None = None

    def set_api_key(self, key: str):
        """Set the API key for authenticated requests."""
        self.api_key = key

    def _request(self, method: str, path: str, data: Any = None) -> Any:
        url = f"{self.base_url}/api/v1{path}"
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        body = json.dumps(data).encode() if data else None
        req = Request(url, data=body, headers=headers, method=method)

        try:
            with urlopen(req) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            raise RuntimeError(f"Registry request failed: {e}")

    def search(self, query: str = "", limit: int = 50) -> list[dict]:
        """Search for packages."""
        return self._request("GET", f"/packages?q={query}&limit={limit}")

    def get_package(self, name: str) -> dict:
        """Get package details."""
        return self._request("GET", f"/packages/{name}")

    def publish(self, name: str, version: str, manifest: dict) -> dict:
        """Publish a package or new version."""
        payload = {"name": name, "version": version, "manifest": manifest}
        return self._request("POST", "/packages", payload)
