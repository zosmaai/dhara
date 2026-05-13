# Dhara Documentation

This directory contains the Dhara documentation in Fumadocs-compatible MDX format.

## Preview Locally

```bash
# Install Fumadocs CLI
npx @fumadocs/cli

# Create a new Fumadocs app
npx create-fumadocs-app

# Or in an existing Next.js project:
npm install fumadocs-core fumadocs-ui
```

## Structure

```
docs/
├── _meta.json           # Navigation tree (Fumadocs format)
├── getting-started/
│   └── index.mdx        # Getting started guide
├── guides/
│   └── write-first-extension.mdx  # Extension tutorial
├── reference/           # Reference docs (links to spec/)
└── README.md            # This file
```

## Building the Site

To deploy to docs.dhara.zosma.ai:

1. Create a Fumadocs Next.js site
2. Point the content source to this `docs/` directory
3. Build and deploy to Vercel/Cloudflare Pages

## Content

- The `spec/` directory at the repo root contains the canonical
  architecture and protocol specifications (markdown + JSON Schema)
- This `docs/` directory contains user-facing documentation (MDX)
