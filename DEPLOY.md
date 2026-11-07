# Bijli Map — Deploy Guide

District-wise official load-shedding schedules for Pakistan (168 districts).
Node.js 24+, native `node:http` + `node:sqlite` only — **zero dependencies**,
no build step, no `npm install`.

## Start

```sh
node server.js          # listens on 0.0.0.0:$PORT (default 3031)
node test.js            # full suite on a fresh DB (must be green before deploy)
```

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ADMIN_CODE` | **Yes — fail-closed** | *(none)* | Master admin code. The app **refuses to start** without it (`FATAL: ADMIN_CODE env var is required`). Set a long random value. Never commit it to the repo, never put it in a URL — POST bodies carry it in `code`, GET endpoints read the `X-Master-Code` header. |
| `PORT` | No | `3031` | Port the server listens on. The server binds `0.0.0.0` explicitly so the container is reachable from outside. |
| `DB_FILE` | No | `data/bijli.sqlite` (see below) | Full path to the SQLite database file. Set this on deploy to a **persistent writable path** — see "Writable directory". |
| `SESSION_SECRET` | Recommended | Random per start | HMAC secret that signs session cookies. Set it on deploy so sessions survive restarts/redeploys; without it a random secret is generated at startup and **all sessions end on restart** (safe default). |
| `CNIC_SECRET` | No | Same as `SESSION_SECRET` | HMAC secret for the one-way CNIC hash (one account per CNIC). Defaults to the session secret; set separately only if you want the CNIC hashes keyed independently. |
| `SESSION_TTL_SECONDS` | No | `86400` (24h) | How long a login session lasts. |
| `LOGIN_LOCK_SECONDS` | No | `900` (15 min) | How long an account stays locked after 5 failed logins (plus a per-IP block). |

No other env vars are read. `NODE_ENV` is not used.

## Writable directory

The app needs **one writable location**: the directory holding the SQLite
database (`data/` by default). Everything else (code, `public/`) is read-only
at runtime.

- **Normal PC / VPS:** the app directory is writable, so the database lives
  at `data/bijli.sqlite` next to the code. Nothing to configure.
- **Read-only app dir (e.g. SnapDeploy's `/app`):** if the app directory
  cannot be written, the database automatically falls back to
  `/tmp/bijli-map/data/bijli.sqlite` and logs
  `Bijli Map data directory (read-only app dir fallback): /tmp/bijli-map`
  at startup. Same pattern as FoodScope (`/tmp/foodscope`).
- **⚠️ `/tmp` is wiped on container restart** — the fallback keeps the app
  running, but the database (users, schedules, audit log) does **not**
  survive a restart there. On any host with persistent storage, set
  `DB_FILE` to a persistent writable path instead, e.g.
  `DB_FILE=/data/bijli.sqlite`.
- The database uses WAL mode (`bijli.sqlite-wal` / `-shm` sit next to it),
  so the directory must stay writable for the whole run, not just at
  startup.

## Exact deploy settings (SnapDeploy)

- **Runtime:** Node 24+ (uses `node:sqlite`, available from Node 22.5+;
  tested on Node 24).
- **Start command:** `node server.js`
- **Port:** `$PORT` (default `3031`). The platform health check must hit
  `GET /health` — it returns `{ok:true}` with no DB and no auth, and the
  server binds `0.0.0.0`, so the container answers on its port fast.
  (A 2026-11-05 deploy failed with "container started but isn't responding
  on its port" before this was fixed — do not regress the bind address or
  the `/health` endpoint.)
- **Environment:** set `ADMIN_CODE` (required) and `SESSION_SECRET`
  (recommended). Set `DB_FILE` to a persistent path if the platform offers
  one; otherwise the `/tmp/bijli-map` fallback applies (see above).
- **No build step, no dependencies, no migrations:** the schema is created
  idempotently at startup (`CREATE TABLE IF NOT EXISTS` + idempotent seeds
  for the DISCO directory, 168 districts, and 5 EXAMPLE grids). An existing
  database is left untouched apart from the v2.0 tables it needs.
- **HTTPS only in production:** the session cookie is set with the
  `Secure` flag, so browsers send it only over HTTPS (and over plain HTTP
  to `localhost`/`127.0.0.1`, which browsers treat as a secure context —
  local development login still works). Serve the live site behind HTTPS;
  plain-HTTP production hosting will break logins for real browsers.

## After deploy — smoke check

```sh
curl https://<your-host>/health                       # {"ok":true}
curl https://<your-host>/api/meta                     # 11 discos, helpline 118, 168 districts
curl https://<your-host>/district/peshawar            # 200, login prompt, no schedule data
```

Then, from the master console (`/admin.html`, master code in the
`X-Master-Code` header / `code` body field — never in a URL): create a
grid, create an admin account for it, and have the admin publish one
schedule. Public users can then sign up for that district (CNIC 3-digit
prefix must match — see README "CNIC check").

## Rate limits (in-memory, per IP)

- Login: 5 failed attempts lock the account for `LOGIN_LOCK_SECONDS`
  (plus a per-IP block).
- Signup: 20 successful signups per hour per IP.
- Master password reset (`POST /api/master/user/reset-password`): 20
  attempts per hour per IP (wrong master codes count — this is the
  brute-force target).
- Admin schedule writes (`POST /api/admin/schedule`,
  `POST /api/admin/schedule/delete`): 60 per hour per IP.
- All limits reset on server restart (in-memory only). Behind a proxy the
  real client IP arrives in `X-Forwarded-For`; a direct caller can spoof
  that header, so these are abuse friction, not a hard guarantee.
