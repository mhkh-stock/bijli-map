# Bijli Map — بجلی میپ — Pakistan Load-Shedding Schedules

District-wise official load-shedding schedules for Pakistan, published by
the government admin for each grid station — plus on/off messages from
people in your own grid only. **Login-gated, role-based, district-scoped:
every person sees only their own district.**

## The flow
1. **Public user signs up** with Gmail + password (+ optional phone) and
   CNIC. The CNIC's **3-digit district prefix must match the district
   they select** (e.g. Peshawar = `173`, Lahore = `352`, Nowshera = `172`).
   Mismatch = rejected. A district whose prefix is not yet verified cannot
   be claimed at all (fail closed — see "CNIC check" below).
2. **After login the user is locked to their own district.** They pick
   province → district (their CNIC district only) → grid station ("grade").
   A grid is shown **only after the admin publishes a schedule for it**.
3. **They see ONLY their district+grid's official schedule** and **ONLY
   their grid's public on/off messages**, and they can post "power on /
   power off" in their own grid only. They can never see another district's
   schedule or messages, and never another person's account.
4. **Government admin** (account created by the master admin only — never
   self-registration, never seeded) belongs to one district + one grid and
   can **publish, edit and delete the official schedule for THAT grid
   only** — never another district's. Public users cannot edit or delete
   anything.
5. **Master admin** (master code, `ADMIN_CODE` env) creates grid stations
   and admin accounts, and sees the audit log of who published, edited or
   deleted what, and when.

## What it does
- **Login + signup** (`/`): Gmail + password accounts, CNIC district
  check, sessions via signed httpOnly cookies (24h expiry).
- **User dashboard** (`app.html`): your district, your grids with a
  published schedule, the official weekly schedule per grid (weekday +
  off-windows), on/off messages from your grid only, post your own. The dashboard shows a **"right now" status line** — whether the light is
  scheduled off right now and the next off-window today — computed from the official schedule plus the newest grid message. All times are
  Pakistan time (PKT). You can **delete your own messages** from the dashboard; nobody else's. A **change-password** form lives here too.
- **Forgot your password?** There is no email reset in this version (no mail service): the master admin resets it from the master console
  (all of your sessions end, and you log in with the new temporary password, then change it).
- **Admin portal** (`admin.html`): admin login, publish/edit/delete the
  official schedule for your own grid (one row per weekday, off-windows
  like `08:00-10:00, 14:00-16:00`), see and delete messages in your grid.
  Master console: create grids, create/remove admin accounts, audit log.
- **DISCO directory**: all 10 public DISCOs + K-Electric, regions, and
  the national complaint helpline **118**. Shedding is per grid station /
  feeder, not per neighbourhood — your feeder name is on your bill.
- **About / contact** (homepage): Bijli Map is run by **M. Hashir** — **mhkh3200@gmail.com** — for admin-account requests from government
  offices, forgotten passwords, corrections, and feedback. Karachi is not one district: `/district/karachi` lists the 7 Karachi districts
  instead of a dead-end 404. Districts whose CNIC code is not verified yet are marked "CNIC check pending" in the signup form and on their
  district page, so nobody fills a form that cannot succeed.
- **Health + deploy:** `GET /health` returns `{ok:true}` (no DB, no auth) for the platform health check, and the server binds `0.0.0.0`
  on `$PORT` so the container is reachable from outside. `GET /favicon.ico` serves an inline ⚡ SVG; `/robots.txt` points at the sitemap.
- **District pages** (SEO): all **168 districts of Pakistan** have their
  own server-rendered page — `/district/peshawar`, `/district/nowshera`,
  and so on — listing the district's grid stations (names only) and a
  login prompt. **Logged-out visitors see district names only, never
  schedules.** `/districts` lists all 168 grouped by province;
  `/sitemap.xml` lists every district page. The list is copied verbatim
  from Mandi Price Intelligence (`lib/districts.js`). Where the DISCO is
  unambiguous from the DISCO directory the page names it (e.g. Peshawar →
  PESCO, Lahore → LESCO, Karachi divisions → K-Electric); where it is not
  clear, only helpline **118** is shown and no DISCO is guessed.

## Security (all enforced server-side, tested)
- **Passwords** hashed with `node:crypto` scrypt (salted, never plaintext,
  never reversible). **Sessions** are signed httpOnly cookies with expiry;
  tampered or expired cookies are rejected.
- **Every API route enforces role + district/grid scope server-side.**
  A logged-in user requesting another district's schedule or messages
  gets 403; an admin publishing/editing/deleting another grid's schedule
  gets 403; posting to another grid gets 403.
- **Login rate limiting:** max 5 failed attempts, then the account locks
  for 15 minutes (plus a per-IP block). **Generic login errors** — a
  wrong password and an unknown Gmail return the identical message, so
  nobody can enumerate accounts.
- **Master code hygiene:** the master code is never sent in a URL query string (it would land in browser history and server logs).
  POST bodies carry it in `code`; GET endpoints read the `X-Master-Code` header. The admin page never shows the default code.
- **Signup rate limit:** max 20 new accounts per hour from one connection (successful signups only).
- **CNIC privacy:** the full CNIC is **never stored** — only a one-way
  HMAC hash (for one-account-per-CNIC) and the 3-digit district prefix.
- **Audit log:** every schedule publish/edit/delete, message delete by an
  admin, grid create/remove and admin create/remove is logged with actor,
  grid, district and time (master console).

## CNIC check — what it is and what it is NOT
- **What it is:** a format/prefix check. The first 3 digits of a CNIC
  encode the district (digit 1 = province, digit 2 = division, digit 3 =
  district). The check accepts any CNIC whose first 3 digits equal the
  selected district's verified prefix. The full verified table lives in
  `lib/cnic.js` (76 of 168 districts verified; sources in
  `~/workspace/new-projects/cnic-district-codes.md`).
- **What it is NOT: NADRA verification.** Nothing here proves a CNIC is
  genuine, belongs to the person typing it, or is currently valid. Only
  NADRA can verify a CNIC. Real NADRA verification needs a government
  partnership.
- **Why first 3 digits, not 5:** the 5-digit prefix also encodes tehsil
  and registration office, so every district has many valid 5-digit
  prefixes sharing the same first 3 digits (Peshawar 17301, 17302…;
  Lahore 35200, 35201, 35202…). A strict first-5 check would lock out
  most legitimate users.
- **Fail closed:** districts with no verified prefix (94 of 168 —
  including all of Gilgit-Baltistan and AJK, most ex-FATA districts, and
  new split districts) cannot be claimed by CNIC check until their prefix
  is verified. Never guess a prefix.
- **Registration ≠ residence:** a CNIC records where it was registered,
  not where the person lives now — a real resident of a district can
  legitimately hold another district's prefix. The hard block at signup
  is the user's order for v2.0; the recommended future fallback is manual
  review / domicile-document upload instead of locking genuine residents
  out. Before going live, validate the check against known-good users per
  district and disable it for any district that rejects real users.
- **Gmail/phone login:** this version uses Gmail-address + password
  accounts (Gmail as identifier) with the CNIC check, structured so
  Google sign-in can plug in later. True Google one-tap sign-in needs a
  Google Cloud OAuth client (user's hands, free) and true SMS OTP needs a
  paid SMS provider — neither exists here, so no OAuth or SMS flow is
  faked.

## Seeded data — and what it is NOT
- **DISCO directory**: the real public structure (11 companies + regions).
- **168 districts**: the full district list (Punjab 41, KPK 36, Sindh 30,
  Balochistan 36, ICT 1, Gilgit-Baltistan 14, AJK 10), copied verbatim
  from Mandi Price Intelligence — no schedules or messages are seeded for
  them, so empty districts stay honestly empty until the admin publishes.
- **5 EXAMPLE grids + EXAMPLE schedules**: Gulberg (Lahore),
  Gulshan-e-Iqbal (Karachi East), F-10 (Islamabad), University Road
  (Peshawar), Jaranwala Road (Faisalabad) — every one marked EXAMPLE, one
  Monday schedule each. These are placeholders, not real schedules;
  replace them with the DISCOs' published schedules.
- **No demo messages**: on/off messages are posted by real logged-in
  users only, never invented. No admin accounts are seeded — the master
  creates them.
- No other schedules are claimed anywhere on the site.

## Removed in v2.0 (user's order — "don't need other useless things")
- The open public outage board, open report submission without login,
  the UPS runtime estimator, and the scheduled-vs-actual tracker are all
  gone. The old v1 tables (`areas`, `schedules`, `reports`,
  `district_admins`) are left untouched in existing databases (legacy,
  unused by v2.0) — nothing is deleted.

## Stack (same as Mandi Price Intelligence)
Node.js 24+, native `node:http` + `node:sqlite`, zero dependencies.
Port 3031 (`PORT` env), SQLite file `data/bijli.sqlite` (`DB_FILE` env),
WAL mode. Master code: `ADMIN_CODE` env (default `bijli-admin`, demo-grade
— change it on deploy). Session secret: `SESSION_SECRET` env (set it on
deploy so sessions survive restarts; without it a random secret is
generated at startup and sessions end on restart).

## Run
```sh
node server.js          # http://127.0.0.1:3031
node test.js            # 80 checks on a fresh DB (all must pass)
```

## Honest limits
- Schedules are only as official as the admin who publishes them. For an
  official complaint, call **118**. KE customers can also use the official
  KE Live app — but it covers Karachi/K-Electric only; this map aims to
  cover all DISCOs.
- The CNIC check is a prefix match, not identity verification (see
  above). A mismatch blocks signup even for a genuine resident whose CNIC
  was registered in another district — the manual-review fallback is a
  future step, not built yet.
- No Google sign-in or SMS codes yet (see above); no SMS/WhatsApp alerts.
- District pages are district-level (all 168 districts); a district with
  no published schedule shows its grids (names only) and a login prompt,
  and a DISCO is named only where the DISCO directory makes it
  unambiguous — otherwise only helpline 118.

## QA pass — human-perspective, sell-ready (2026-11-05)
Every journey walked as a real user on a live local server (fresh DB +
copy of the live DB): Peshawar signup → login → grid → schedule → post
"power off" → logout → login again; Nowshera user; unverified-district
(Gilgit) user; master → grid + admin → publish → edit → delete →
cross-grid 403; logged-out visitor; security spot-checks. **103/103
checks pass** (suite run green 3 times) plus a 3-minute fresh-DB soak
(server stays up, serves `/`, `/health`, `/api/meta`, district pages).
Gaps found and fixed in this pass:
- **P0 — deploy health (from the SnapDeploy dashboard):** the v1.2
  deploy failed with "container started but isn't responding on its
  port". The server now binds `0.0.0.0` explicitly (was relying on the
  Node default) and answers `GET /health` with no DB/auth. Verified the
  listen address in the suite via `/proc/net/tcp`.
- **P0 — master code leaked in the UI:** the admin page's master-code
  input placeholder said "default: bijli-admin". Removed.
- **P0 — master code in URLs:** master GET endpoints took `?code=` in
  the query string (browser history, server logs). Now `X-Master-Code`
  header only; query-string codes are rejected (403).
- **P0 — two fake districts:** "Bari Swat" and "Paharpur" are not
  districts (Bari Swat is part of Swat; Paharpur is a tehsil of Dera
  Ismail Khan). Removed from `lib/districts.js`: the list is now **168
  districts** (Punjab 41, KPK 36, Sindh 30, Balochistan 36, ICT 1, GB 14,
  AJK 10). Mandi's list still carries them and needs the same cleanup.
- **P1 — no way back from a forgotten password:** added change-password
  (logged-in users/admins) and master password reset (ends all sessions).
  Still no email reset (no mail service) — the homepage says so and
  points at the master admin.
- **P1 — fake "Log out" link:** the dashboard's "Log out" only linked
  home without logging out. It now really logs out. The admin portal
  had no logout at all — added.
- **P1 — own messages could not be deleted from the UI:** the API
  existed but the dashboard showed no button. Messages now carry an
  `own` flag (author identity never exposed) and own messages get a
  Delete button.
- **P1 — no "right now" answer:** the dashboard now shows whether the
  light is scheduled off right now and the next off-window today, plus
  the newest grid message.
- **P1 — times were UTC, 5 hours off for Pakistan:** all displayed
  times are now converted to Asia/Karachi (PKT).
- **P1 — EXAMPLE schedules looked real:** example grids now carry an
  unmissable "EXAMPLE grid — this schedule is a sample" banner on the
  dashboard.
- **P1 — unverified districts were a dead end after a full form:**
  `/api/districts` now returns `cnic_verified`; the signup dropdown
  disables unverified districts ("CNIC check pending") and district
  pages say signups are not open yet for them.
- **P1 — Karachi was a 404:** `/district/karachi` now lists the 7
  Karachi districts.
- **P1 — no owner/contact:** the homepage now has an About section
  (run by M. Hashir, mhkh3200@gmail.com) for admin-account requests,
  forgotten passwords, and corrections.
- **P2:** favicon (inline ⚡ SVG, served at `/favicon.ico`) and
  `/robots.txt` with the sitemap; signup rate limit (20/hour per
  connection); admin message reporter is now anonymous ("User N",
  was the first 2 letters of the Gmail); button touch targets 44px;
  expired sessions pruned on login; master console now lists
  registered users.
Still not ready (honest): only 76/168 districts have verified CNIC
codes (94 fail closed, incl. all of GB/AJK); the CNIC check is a prefix
match, not NADRA verification, and can reject genuine residents whose
CNIC was registered elsewhere (manual-review fallback not built);
no Google sign-in or SMS codes (needs external setup); no "log out
everywhere"; no per-account "forgot password" email; example schedules
are still samples, not real DISCO schedules — a government admin must
publish the real ones. Deploy note: set `ADMIN_CODE` (never the public
default) and `SESSION_SECRET` on the container, or sessions end on
every restart/redeploy.
