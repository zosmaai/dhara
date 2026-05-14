# Dhara Extension Registry

The extension registry for Dhara packages — search, install, and publish extensions.

## Structure

```
registry/
├── server/          # API server (Python + FastAPI)
│   ├── main.py      # FastAPI app
│   ├── models.py    # Data models
│   ├── storage.py   # Package storage (S3/local)
│   └── requirements.txt
├── sdk/             # Registry SDK (Python)
│   ├── client.py    # API client
│   └── validate.py  # Package validation
└── docker-compose.yml
```

## Quick Start

```bash
cd registry
docker compose up
# Server at http://localhost:8000
# API docs at http://localhost:8000/docs
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /api/v1/packages | Search/list packages |
| GET | /api/v1/packages/{name} | Package details |
| GET | /api/v1/packages/{name}/download | Download package tarball |
| POST | /api/v1/packages | Publish new package |
| POST | /api/v1/packages/{name}/versions | Publish new version |
| GET | /api/v1/packages/{name}/versions/{version} | Version details |

## Package Format

Packages are uploaded as `.tar.gz` archives containing:
- `manifest.json` — Package metadata and tool definitions
- `main.py` (or `main.js`) — Extension entry point
- `README.md` — Documentation
- `icon.png` — Optional gallery icon

## Authentication

Publishing requires an API key:
```bash
dhara registry publish --api-key <key>
```

API keys are managed at `https://registry.dhara.zosma.ai/account/tokens`.
