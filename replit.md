# Workspace

## Overview

Confluence-to-Talkdesk Knowledge Management sync tool. Syncs Confluence wiki content to Talkdesk Knowledge Management API every 5 minutes. Includes a settings UI for configuring folder-to-knowledge-segment mappings.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server with sync logic
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── confluence.ts  # Confluence REST API client
│   │       │   ├── talkdesk.ts    # Talkdesk KM API client (JWT auth)
│   │       │   ├── syncJob.ts     # Background sync job (5-min interval)
│   │       │   └── logger.ts      # Pino logger
│   │       └── routes/
│   │           ├── settings.ts        # GET/PUT /api/settings
│   │           ├── folderMappings.ts   # CRUD /api/folder-mappings
│   │           ├── sync.ts            # /api/sync/status, /trigger, /logs
│   │           ├── confluence.ts      # /api/confluence/folders
│   │           └── health.ts          # /api/healthz
│   └── confluence-sync/    # React + Vite frontend (settings UI)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
│       └── src/schema/
│           ├── settings.ts        # Talkdesk account config
│           ├── folderMappings.ts  # Confluence folder → KM segment mappings
│           ├── syncState.ts       # Document change tracking (hashes)
│           └── syncLogs.ts        # Sync run history
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Key Features

- **Confluence Integration**: Uses REST API v1 with Basic Auth (email + API token) to fetch space content
- **Talkdesk Integration**: Uses JWT-based auth (ES256 signed assertions) to authenticate with Talkdesk OAuth, then manages external sources and documents via the Knowledge Management API
- **Change Detection**: Stores content hashes and last-modified timestamps per document; only re-syncs when content actually changes
- **Image Stripping**: Removes all `<img>` tags from HTML before sending to Talkdesk
- **Background Sync**: Runs every 5 minutes via setInterval, with manual trigger option

## Environment Secrets

- `CONFLUENCE_BASE_URL` — Confluence instance URL
- `CONFLUENCE_EMAIL` — Confluence account email
- `CONFLUENCE_API_TOKEN` — Confluence API token
- `TALKDESK_CLIENT_ID` — Talkdesk OAuth client ID
- `TALKDESK_PRIVATE_KEY` — Talkdesk ES256 private key (PEM body)
- `TALKDESK_KEY_ID` — Talkdesk key identifier
- `SESSION_SECRET` — Session secret
- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned)

## Database Tables

- `settings` — Single-row config: Talkdesk account name, region, Confluence space key
- `folder_mappings` — Maps Confluence folder IDs to knowledge segment names, tracks external source IDs
- `sync_state` — Per-document tracking: content hash, last modified, Talkdesk document ID
- `sync_logs` — Sync run history with counts (processed/skipped/errored)

## Talkdesk Auth Flow

1. Create JWT assertion signed with ES256 private key
2. POST to region-specific token URL with `client_credentials` grant
3. Cache access token until near expiry
4. Use token for KM API calls (external sources, document upsert/delete)

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client hooks and Zod schemas

## Integration Note

Confluence integration uses manual API credentials (not Replit connector). Credentials stored as environment secrets.
