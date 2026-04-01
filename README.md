# AI Help Center Sync

Syncs Confluence wiki content to Talkdesk Knowledge Management automatically every 5 minutes. Includes a settings UI for configuring folder-to-knowledge-segment mappings.

## How It Works

1. **Configure** Talkdesk credentials and Confluence space in the Settings page
2. **Map** Confluence folders to Talkdesk knowledge segments
3. **Sync** runs automatically every 5 minutes (or trigger manually)

For each mapped folder, the sync engine:

- Fetches direct children (pages and smart links) from Confluence v2 API
- Detects changes via SHA-256 content hashing and version timestamps
- Upserts changed documents to Talkdesk KM via the Custom API Connector
- Removes orphaned documents when Confluence pages are deleted
- Skips archived/trashed content

## Stack

| Layer      | Technology                                |
| ---------- | ----------------------------------------- |
| Monorepo   | pnpm workspaces                           |
| API Server | Express 5 + TypeScript                    |
| Database   | PostgreSQL + Drizzle ORM                  |
| Frontend   | React + Vite + Tailwind CSS + shadcn/ui   |
| Validation | Zod (v4) + drizzle-zod                    |
| API Codegen| Orval (from OpenAPI spec)                 |
| Build      | esbuild (CJS bundle)                      |
| Logging    | Pino                                      |

## Project Structure

```text
artifacts/
  api-server/src/
    lib/
      confluence.ts    # Confluence REST API v2 client
      talkdesk.ts      # Talkdesk KM API client (JWT auth)
      syncJob.ts       # Background sync engine (5-min interval)
      logger.ts        # Pino logger
    routes/
      settings.ts      # GET/PUT /api/settings
      folderMappings.ts # CRUD /api/folder-mappings
      sync.ts          # /api/sync/status, /trigger, /logs, /sources
      confluence.ts    # /api/confluence/folders
      health.ts        # /api/healthz
  confluence-sync/     # React + Vite frontend (settings UI)
lib/
  api-spec/            # OpenAPI spec + Orval config
  api-client-react/    # Generated React Query hooks
  api-zod/             # Generated Zod schemas
  db/src/schema/       # Drizzle ORM schema
```

## Environment Variables

| Variable               | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string                                   |
| `CONFLUENCE_BASE_URL`  | Confluence instance URL (e.g. `https://yoursite.atlassian.net`)  |
| `CONFLUENCE_EMAIL`     | Confluence account email                                       |
| `CONFLUENCE_API_TOKEN` | Confluence API token                                           |
| `TALKDESK_CLIENT_ID`   | Talkdesk OAuth client ID                                       |
| `TALKDESK_PRIVATE_KEY` | Talkdesk ES256 private key (PEM body, no headers)              |
| `TALKDESK_KEY_ID`      | Talkdesk key identifier                                        |
| `SESSION_SECRET`       | Session secret                                                 |
| `PORT`                 | Server port                                                    |

## Talkdesk Setup

1. In Talkdesk Builder, go to **OAuth Clients** > **New OAuth Client**
2. Select **Client credentials** and **Refresh token**
3. Add scopes: `km-external-sources:read` and `km-external-sources:write`
4. Download the OAuth JSON file for `TALKDESK_CLIENT_ID`, `TALKDESK_PRIVATE_KEY`, and `TALKDESK_KEY_ID`

## Confluence Setup

1. Generate an API token at <https://id.atlassian.com/manage-profile/security/api-tokens>
2. Set `CONFLUENCE_BASE_URL` to your Atlassian Cloud URL
3. Set `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN`

## API Endpoints

### Settings

- `GET /api/settings` - Get current configuration
- `PUT /api/settings` - Update Talkdesk account, region, and Confluence space key

### Folder Mappings

- `GET /api/folder-mappings` - List all mappings
- `POST /api/folder-mappings` - Create a folder-to-segment mapping
- `DELETE /api/folder-mappings/:id` - Delete mapping (also removes external source from Talkdesk)

### Sync

- `GET /api/sync/status` - Sync engine status and last run info
- `POST /api/sync/trigger` - Manually trigger a sync
- `GET /api/sync/logs` - Last 20 sync execution logs
- `GET /api/sync/sources` - List mapped sources with document counts
- `GET /api/sync/sources/:mappingId/documents` - Documents for a specific mapping
- `GET /api/sync/documents/:documentId/preview` - Cached HTML preview

### Confluence

- `GET /api/confluence/folders` - List folders in configured space

## Scripts

```bash
pnpm run build        # Typecheck + build all packages
pnpm run typecheck    # TypeScript project references check
pnpm --filter @workspace/api-spec run codegen  # Regenerate API client
```

## Sync Engine Details

### Change Detection

1. **Lightweight check**: `GET /pages/{id}` (v2, no body) returns version metadata
2. **Timestamp comparison**: If `version.createdAt` matches stored value, skip
3. **Full fetch**: `GET /pages/{id}?body-format=storage` (v2) for content
4. **Hash comparison**: SHA-256 of stripped HTML, skip if unchanged
5. **Upsert**: Send to Talkdesk KM API only when content actually changed

### Resilience

- Retry with exponential backoff on 429 (rate limit) and 5xx errors
- Confluence 429 responses respect `Retry-After` header
- Per-document error handling: one failure doesn't stop the sync
- Parallel batch processing (5 concurrent) for speed
- Sync log pruning (keeps last 200 entries)

### Talkdesk Integration

- JWT Bearer authentication (ES256 signed assertions)
- Region-aware API routing (US, EU, CA, AU)
- External sources created with `knowledge_type: CUSTOM`
- Documents include source URL linking back to Confluence page
- Orphaned documents deleted when pages are removed from Confluence
