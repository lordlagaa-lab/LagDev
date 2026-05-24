# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Fluence Lead Scanner** — a mobile-first PWA for scanning business cards and managing leads at trade shows/events. The entire stack runs on Cloudflare with no traditional server.

- **Frontend:** https://fluence-lead-scanner.pages.dev
- **API Worker:** https://fluence-lead-scanner-api.maitilupas.workers.dev
- **D1 Database name:** `fluence-leads` (ID: `949471af-1670-4aa7-b65a-5b1f24078ccf`)

## Local development

The worker runs locally via Wrangler. The frontend is static HTML and needs no server.

```bash
# Run the worker locally with a local D1 replica (no Cloudflare account needed)
cd worker && wrangler dev --local

# Or connect to the live remote D1 database
cd worker && wrangler dev --remote
```

For the frontend, open `frontend/index.html` directly in a browser. When developing against a local worker, update `API_BASE` on line ~435 of `index.html` to `http://localhost:8787`. **This change must be reverted before deploying** — there is no env variable injection for the static frontend; the URL is hardcoded and a production deploy requires pointing it back to the live worker URL.

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

To apply schema changes to the D1 database (full re-apply — safe with `CREATE TABLE IF NOT EXISTS`):

```bash
cd worker
wrangler d1 execute fluence-leads --file=schema.sql
```

To apply an **additive migration** to the live database (e.g. adding a new column):

```bash
# Add voice_data column (run once on the live DB — already in schema.sql for new installs)
wrangler d1 execute fluence-leads --command="ALTER TABLE leads ADD COLUMN voice_data TEXT NOT NULL DEFAULT '';"
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

`JWT_SECRET` is stored as a Cloudflare Worker secret — set it via `wrangler secret put JWT_SECRET`.

⚠️ **`worker/wrangler.toml` currently has a `[vars]` entry with `JWT_SECRET` hardcoded in plaintext.** This is also committed in git history. The `wrangler secret put` value takes precedence in production, but the plaintext value is used during `wrangler dev` unless overridden. Do not treat the `[vars]` value as authoritative or rotate it without also updating the Cloudflare secret.

## Architecture

### Worker (`worker/src/`)

The backend is a single Cloudflare Worker with three source files:

- **`index.js`** — URL router + all HTTP handlers. Fixed paths use string equality; dynamic paths (e.g. `/api/leads/:id`) use `.match(/^\/api\/leads\/\d+$/)`. Public routes: `/api/health`, `/api/auth/login`, `/api/auth/register`. All other routes require a `Bearer` JWT. Note: `/api/leads/stats` is declared *after* the `\d+` regex and works today only because `"stats"` contains no digits — any future alphanumeric ID scheme would break this ordering.
- **`db.js`** — D1 CRUD functions (`createLead`, `getLead`, `updateLead`, `deleteLead`, `getStats`). Every read enforces ownership: reps see only their own rows; admins see all. The `products` field is stored as a JSON string (`TEXT` column) and must be serialized before writes and parsed after reads.
- **`auth.js`** — Zero-dependency auth using the Web Crypto API (available natively in Workers). Passwords use PBKDF2 (100k iterations, SHA-256) with a random salt, stored as `pbkdf2:100000:<salt>:<hash>`. JWTs are HS256, signed with HMAC-SHA-256, expire in 7 days.

No npm dependencies — there is no `node_modules`, no build step.

### Frontend (`frontend/index.html`)

The entire UI is a single ~991-line HTML file. It is a vanilla JS SPA with:
- `API_BASE` constant pointing to the worker URL (line ~435) — hardcoded, no build-time substitution
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
- `assigned_to` is a freetext `TEXT` field — it is **not** a foreign key to `users`. It accepts any string and is not validated against the users table.

**Leads have both `show_id` (FK → `shows`) and `show_name` (TEXT).** This is intentional denormalization: the frontend stores the active show name in `localStorage` and writes it directly into every new lead. `show_id` may be `NULL` even when `show_name` is populated. When working with the shows feature, write to both fields to keep them consistent.

⚠️ **The seed `INSERT` statements in `schema.sql` use placeholder bcrypt hashes (`$2b$10$placeholder`).** The auth system uses PBKDF2, not bcrypt, so these hashes will never verify. Seeded users cannot log in. After a fresh schema apply, create real users via `POST /api/auth/register` (self-register) or `POST /api/users` (admin creates user).

### Access control

| Role | Leads visible | Users endpoint (POST) | Shows endpoint (POST) |
|------|--------------|----------------------|----------------------|
| `rep` | Own leads only | ❌ | ❌ |
| `admin` | All leads | ✅ | ✅ |

This is enforced in both `db.js` (at query level) and `index.js` (at handler level).

## Repo artifacts

- **`ORIGINAL.html`** — the original monolithic frontend before the current version was written. Kept for reference; not deployed anywhere. Safe to delete if it causes confusion.
- **`MEMORY_AI.md`** — a session dump from a previous AI coding session, kept as historical context. It reflects a past state (e.g. mentions an old local path `/root/fluence-lead-scanner/`). Do not treat it as current truth.
- **`nginx-fluence.conf`** — a catch-all 444 (connection drop) nginx config used on an earlier server setup. Not needed for the Cloudflare-only stack; kept for reference.
- **`wrangler.toml` (repo root)** — legacy config that predates the `worker/` subdirectory layout. The active Worker config is `worker/wrangler.toml`. The root file is safe to delete.

## Key conventions

- **Temperature values are always lowercase:** `hot`, `warm`, `cold`. The DB has a CHECK constraint — passing uppercase will cause an insert/update error.
- **`products` field** is an array in JS but stored as a JSON string in D1. `db.js` handles serialization; always pass an array from the frontend/tests.
- **No build tooling.** The worker uses ES module syntax (`import`/`export`) but runs natively in the Workers runtime — no bundler needed.
- **CORS is wide-open** (`Access-Control-Allow-Origin: *`) — intentional for a demo/event app.
