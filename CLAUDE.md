# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Fluence Lead Scanner** — a mobile-first PWA for scanning business cards and managing leads at trade shows/events. The entire stack runs on Cloudflare with no traditional server.

- **Frontend:** https://fluence-lead-scanner.pages.dev
- **API Worker:** https://fluence-lead-scanner-api.maitilupas.workers.dev
- **D1 Database name:** `fluence-leads` (ID: `949471af-1670-4aa7-b65a-5b1f24078ccf`)

## Deploy commands

GitHub Actions auto-deploys both the worker and frontend on every push to `main`. To deploy manually:

```bash
# Authenticate (one-time)
wrangler login

# Deploy the API worker
cd worker && wrangler deploy

# Deploy the frontend
cd frontend && wrangler pages deploy . --project-name=fluence-lead-scanner
```

To apply schema changes to the D1 database:

```bash
cd worker
wrangler d1 execute fluence-leads --file=schema.sql
```

To run a raw SQL command against D1:

```bash
wrangler d1 execute fluence-leads --command="SELECT * FROM users;"
```

## Required secrets

| Where | Secret | Purpose |
|-------|--------|---------|
| GitHub Actions | `CLOUDFLARE_API_TOKEN` | Workers:Edit + D1:Edit + Pages:Edit |
| GitHub Actions | `JWT_SECRET` | Forwarded to Wrangler during deploy |
| Cloudflare Worker | `JWT_SECRET` | Signs/verifies auth tokens |

`JWT_SECRET` is stored as a Cloudflare Worker secret (not in `wrangler.toml`) — set it via `wrangler secret put JWT_SECRET`.

## Architecture

### Worker (`worker/src/`)

The backend is a single Cloudflare Worker with three source files:

- **`index.js`** — URL router + all HTTP handlers. Routes are matched with plain string comparison for fixed paths and `.match()` regex for dynamic ones (e.g. `/api/leads/:id`). Public routes: `/api/health`, `/api/auth/login`, `/api/auth/register`. All other routes require a `Bearer` JWT.
- **`db.js`** — D1 CRUD functions (`createLead`, `getLead`, `updateLead`, `deleteLead`, `getStats`). Every read enforces ownership: reps see only their own rows; admins see all. The `products` field is stored as a JSON string (`TEXT` column) and must be serialized before writes and parsed after reads.
- **`auth.js`** — Zero-dependency auth using the Web Crypto API (available natively in Workers). Passwords use PBKDF2 (100k iterations, SHA-256) with a random salt, stored as `pbkdf2:100000:<salt>:<hash>`. JWTs are HS256, signed with HMAC-SHA-256, expire in 7 days.

No npm dependencies — there is no `node_modules`, no build step.

### Frontend (`frontend/index.html`)

The entire UI is a single `991`-line HTML file. It is a vanilla JS SPA with:
- `API_BASE` constant pointing to the worker URL (line ~435)
- `token` and `user` stored in `localStorage` (`fl_token`, `fl_user_data`)
- `leads` array as in-memory state, fetched on login and refreshed on saves
- OCR via Tesseract.js (CDN), Excel export via SheetJS (CDN)
- Voice notes recorded with the browser's `MediaRecorder` API

CSS custom properties (`:root` / `[data-theme=light]`) control dark/light themes. The `--fl` (`#C8F135`) and `--bg` (`#003C71`) CSS variables are the brand colors.

### Database schema (`worker/schema.sql`)

Three tables: `users`, `shows`, `leads`. Key constraints:
- `temperature` column: CHECK constraint allows only `''`, `'hot'`, `'warm'`, `'cold'` (lowercase — the API and frontend must use lowercase values)
- `role` column: CHECK constraint allows only `'rep'` or `'admin'`
- `products` is stored as a JSON string (`TEXT`), defaulting to `'[]'`
- All timestamps use SQLite `datetime('now')` (TEXT, not INTEGER)

### Access control

| Role | Leads visible | Users endpoint (POST) | Shows endpoint (POST) |
|------|--------------|----------------------|----------------------|
| `rep` | Own leads only | ❌ | ❌ |
| `admin` | All leads | ✅ | ✅ |

This is enforced in both `db.js` (at query level) and `index.js` (at handler level).

## Key conventions

- **Temperature values are always lowercase:** `hot`, `warm`, `cold`. The DB has a CHECK constraint — passing uppercase will cause an insert/update error.
- **`products` field** is an array in JS but stored as a JSON string in D1. `db.js` handles serialization; always pass an array from the frontend/tests.
- **No build tooling.** The worker uses ES module syntax (`import`/`export`) but runs natively in the Workers runtime — no bundler needed.
- **CORS is wide-open** (`Access-Control-Allow-Origin: *`) — intentional for a demo/event app.
- **The `wrangler.toml` at the repo root** is legacy; the active config is `worker/wrangler.toml`.
