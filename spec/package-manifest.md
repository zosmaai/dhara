# Package Manifest & Registry

> A purpose-built registry for agent extensions — not npm keyword scraping.

## Why Not npm

Pi uses npm as its package registry. Extensions are npm packages tagged with `pi-package`. This means:

- **Discovery is keyword search** — `npm search pi-package` returns everything
- **No capability metadata** — npm doesn't know about filesystem:read vs process:spawn
- **No security provenance** — no signing, no attestation
- **JavaScript ecosystem only** — npm can't serve Python wheels or Rust crates
- **No quality gates** — no reviews, no compatibility testing
- **No namespace governance** — typosquatting and name squatting are rampant

## Package Manifest

Every package contains a `manifest.yaml` (or `manifest.json`):

```yaml
# manifest.yaml
# Required fields
name: code-search                    # Package name (unique in registry)
version: 1.2.0                       # Semantic version
description: "Semantic code search powered by embeddings"
author:
  name: "Developer Name"
  email: "dev@example.com"
  url: "https://example.com"
license: MIT
homepage: "https://github.com/user/code-search"
repository: "https://github.com/user/code-search"

# What this package provides
provides:
  extensions:
    - runtime:
        type: subprocess
        command: python3 main.py
        protocol: json-rpc
      tools:
        - name: code_search
          description: "Semantic code search"
          capabilities: [filesystem:read, network:outbound]
        - name: index_build
          description: "Build search index"
          capabilities: [filesystem:read, filesystem:write]
      hooks:
        - event: session:start
          blocking: false
      commands:
        - name: search
          description: "Interactive code search"

  # Optional: skills (prompt + context)
  skills:
    - name: code-review-with-search
      description: "Code review using semantic search"
      prompt: |
        Before reviewing code changes, use code_search to find
        similar patterns in the codebase. Check for consistency
        with existing implementations.

  # Optional: prompt templates
  prompts:
    - name: find-duplicates
      description: "Find duplicate code patterns"
      template: |
        Use code_search to find code similar to: {{selection}}

  # Optional: themes
  themes: []

# Capabilities this package needs (union of all extensions)
capabilities:
  - filesystem:read
  - filesystem:write
  - network:outbound

# Network access details (for user review)
network:
  outbound:
    - domain: api.openai.com
      purpose: "Embedding API for semantic search"
    - domain: huggingface.co
      purpose: "Download embedding models"

# User-configurable settings (JSON Schema)
config:
  type: object
  properties:
    embedding_provider:
      type: string
      enum: [local, openai]
      default: local
      description: "Embedding provider"
    index_path:
      type: string
      default: .search-index
      description: "Path to store search index"
    max_results:
      type: integer
      default: 10
      minimum: 1
      maximum: 50
      description: "Maximum search results"

# Compatibility
compatibility:
  coreVersion: ">=0.1.0"
  platforms: [linux, macos, windows]
  runtimes:
    - name: python
      version: ">=3.9"

# Gallery metadata (for registry display)
gallery:
  tags: [search, code-intelligence, embeddings]
  category: developer-tools
  video: "https://example.com/demo.mp4"
  image: "https://example.com/screenshot.png"
  readme: "./README.md"
```

## Package Structure

```
code-search/
├── manifest.yaml           # Required
├── README.md               # Gallery display
├── main.py                 # Extension entry point
├── requirements.txt        # Python dependencies (if applicable)
├── icon.png                # Optional gallery icon
└── tests/
    └── test_search.py      # Package test cases
```

## Registry Architecture

### API Endpoints

```
# Package CRUD
GET    /api/v1/packages                    # Search/list packages
GET    /api/v1/packages/{name}             # Package details
GET    /api/v1/packages/{name}/{version}   # Specific version
POST   /api/v1/packages                    # Publish new package
DELETE /api/v1/packages/{name}/{version}   # Unpublish

# Install
GET    /api/v1/packages/{name}/{version}/download   # Download tarball
GET    /api/v1/packages/{name}/latest/download      # Latest tarball

# Metadata
GET    /api/v1/packages/{name}/versions             # All versions
GET    /api/v1/packages/{name}/manifest             # Manifest only
GET    /api/v1/packages/{name}/capabilities          # Capability summary

# Security
GET    /api/v1/packages/{name}/{version}/attestation # Sigstore attestation
GET    /api/v1/packages/{name}/{version}/audit        # Security audit

# Social
GET    /api/v1/packages/{name}/reviews               # User reviews
POST   /api/v1/packages/{name}/reviews               # Submit review
GET    /api/v1/packages/{name}/stats                  # Download stats

# Categories
GET    /api/v1/categories                             # List categories
GET    /api/v1/categories/{slug}/packages             # Packages in category
```

### Search

```
GET /api/v1/packages?q=search&category=developer-tools&capabilities=filesystem:read
```

Returns packages ranked by:
1. Text relevance (name, description, tags)
2. Compatibility with user's platform/runtimes
3. Download count
4. Review score
5. Recency of updates

### Package Signing

All packages are signed with **sigstore** (cosign + fulcio + rekor):

```bash
# Publishing signs automatically
project publish --sign

# Verifying on install
project install @dev/code-search --verify
```

The attestation includes:
- Package hash (SHA-256)
- Publisher identity (GitHub OIDC or email)
- Build provenance (was it built from source? by whom?)
- Capability declarations (signed, can't be tampered with)

### Quality Gates

Before a package appears in search results, it must pass:

| Gate | Requirement | Automated |
|---|---|---|
| **Schema validation** | Valid manifest.yaml | ✓ |
| **Capability scan** | Declared capabilities match actual imports | ✓ |
| **Build test** | Package installs and initializes without error | ✓ |
| **Basic tests** | Provided test cases pass | ✓ |
| **Security scan** | No known vulnerabilities in dependencies | ✓ |
| **Review** | Community review (optional, for "verified" badge) | ✗ |

Packages that fail gates are still installable (with `--skip-gates`) but won't appear in default search.

### Verified Packages

Authors can submit packages for manual review. Verified packages get:
- ✓ Verified badge in gallery
- Higher search ranking
- Featured placement

Review criteria:
- Readable source code
- Capabilities match declared behavior
- No obfuscated code
- Dependencies are reasonable
- Tests exist and pass

## CLI Usage

```bash
# Search
project search "code search"
project search --category developer-tools
project search --capabilities filesystem:read

# Install
project install @dev/code-search
project install @dev/code-search@1.2.0          # Pinned version
project install @dev/code-search --verify       # Verify signature

# Update
project update                                  # Update all
project update @dev/code-search                 # Update one

# Remove
project remove @dev/code-search

# List
project list                                    # Installed packages
project list --available                        # All available in registry

# Publish
project publish                                 # Publish current directory
project publish --sign                          # Sign with sigstore

# Review
project review @dev/code-search --approve       # Approve capabilities
project review @dev/code-search --show          # Show current permissions

# Audit
project audit                                   # Check all packages for issues
project audit @dev/code-search                  # Check one package
```

## Package Namespace

```
@official/       # Core team maintained (file tools, providers, etc.)
@verified/       # Community reviewed and approved
@{author}/       # Author namespace (first come, first served)
```

Namespace governance:
- Namespaces are free, tied to a GitHub account or organization
- `@official` reserved for the core team
- `@verified` requires review process
- Squatting policy: inactive for 12 months → released

## Comparison with Pi's Package System

| | Pi | Ours |
|---|---|---|
| Registry | npm keyword search | Purpose-built registry |
| Discovery | npmjs.com + Discord | Registry + search + categories |
| Signing | None | Sigstore (cosign + fulcio + rekor) |
| Capabilities | None | Declared in manifest, enforced by sandbox |
| Quality gates | None | Schema validation + build tests + security scan |
| Reviews | None | Community reviews + verified badge |
| Multi-language | JavaScript only | Any language (subprocess/WASM) |
| Namespace | npm rules (free-for-all) | Governed namespaces |
| Config | Edit JSON manually | Schema-validated, UI-generatable |
| Compatibility checks | None | Platform/runtime requirements declared |
