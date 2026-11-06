# Bijli Map — PLAN.md

## Research notes (verified 2026-11-04, parent's prior research)
- **KE Live** (K-Electric's official app): live load-shed tracking and
  complaints — but only for Karachi / K-Electric customers.
- **PAK PANEL-style pages**: directories of DISCO schedules and complaint
  links, not live crowdsourced maps.
- **poweroutage.live**: covers Balochistan schedules only.
- **The gap**: no nationwide, crowdsourced, area-level live outage map
  covering all DISCOs, and no scheduled-vs-actual tracker.
- **Real context used (labelled as reported, not measured by us)**:
  - Pakistan: 10 public DISCOs + K-Electric (LESCO, IESCO, PESCO, HESCO,
    SEPCO, MEPCO, FESCO, GEPCO, QESCO, TESCO + KE).
  - National complaint helpline: 118.
  - Shedding is per feeder, not per neighbourhood — two nearby streets can
    have different schedules; the feeder name is on the bill.
  - NEPRA review (reported): very-high-loss feeders averaged about 12h 14m
    of outages vs scheduled limits.

## v1 — built and tested (2026-11-04)
Report form, live area board, scheduled-vs-actual tracker (completed
out → restored windows only), UPS estimator (85% default efficiency),
DISCO directory, admin moderation + areas + schedules. 26/26 tests pass.
Seed: DISCO directory + 5 EXAMPLE areas/schedules + 4 DEMO reports only.

## v1.1 — District pages + district admins (2026-11-04)
- Server-rendered `/district/:city` pages (own title/meta/H1, live board,
  scheduled-vs-actual summary, 118 disclaimer) + `/districts` index +
  `/sitemap.xml`, so each city is separately findable on Google.
- `district_admins` table: master-only create/remove/list (list never
  returns codes); district-scoped board + hide endpoints enforce
  city-matching server-side (wrong code or cross-city action = 403).
- New `district-admin.html` (code in sessionStorage only) + District
  admins section in master `admin.html`. Tests extended 26 → 50, all
  passing on a fresh DB. Not pushed/deployed by this build step.

## v1.2 — All 170 districts (2026-11-05)
- District list copied verbatim from Mandi Price Intelligence
  (`seed-data.json` → `lib/districts.js`): Punjab 41, KPK 38, Sindh 30,
  Balochistan 36, ICT 1, Gilgit-Baltistan 14, AJK 10 = 170 districts,
  seeded idempotently into a new `districts` table (existing databases gain
  them on next start; no re-seed of areas/reports).
- `/districts` lists all 170 grouped by province (with per-district area /
  report counts); `/district/:slug` works for every district;
  `/sitemap.xml` lists all 170 district URLs (+ `/` + `/districts`, and any
  reported non-district city such as Karachi). New `GET /api/districts`
  returns the full list with per-province counts and the DISCO mapping.
- Empty-state rule: a district with no reports shows "No outage reports
  yet for this district — be the first to report from the home page" and
  no invented outages or schedules.
- DISCO-mapping rule: a DISCO is named only where the DISCO directory
  makes it unambiguous (Balochistan → QESCO, KPK → PESCO except the 8
  ex-FATA districts → TESCO, Lahore/Kasur/Okara/Sheikhupura → LESCO,
  Rawalpindi/Attock/Jhelum/Chakwal/Islamabad → IESCO, Karachi divisions →
  K-Electric, Hyderabad → HESCO, Sukkur → SEPCO); everywhere else only
  helpline 118 is shown, no guess. Gilgit-Baltistan and AJK have no DISCO
  in the directory. Non-district reported cities (Karachi) show the single
  DISCO of their areas if they all agree.
- District pages now link "Other districts in <province>" instead of all
  cities. The 5 example areas, 4 demo reports and the district-admin
  system (per-city codes, 403 on wrong code / cross-city) are unchanged.
  Tests extended 50 → 60, all passing on a fresh DB (run twice). Not
  pushed/deployed by this build step.

## v2 ideas — NOT started, do not claim
- SMS/WhatsApp outage alerts (needs a real provider + user opt-in).
- PKT-aware date grouping for the tracker (currently UTC).
- Official schedule import: scrape/enter real published DISCO schedules
  per feeder, replacing the EXAMPLE placeholders.
- Report verification: multiple independent reports for the same area/time
  raise confidence; single reports stay "unverified".
- Area map view (needs a map layer; board-first until then).
- Feeder directory: feeder names per area, from bills, crowdsourced.
- Weekly area reliability report: scheduled vs actual per area per week,
  once report volume is real.

Redeploy trigger 2026-11-05 ~20:05 PKT — SnapDeploy auto-deploy after limit reset.

## v2.0 — REBUILD: role-based, district-scoped, login-gated (2026-11-05)
User's explicit order: rebuild around the district-wise flow, strip the
extras. "There should be a district wise schedule about load shedding
from the concern grade system of electricity… keep the security well…
make it more secure and reliable, don't need other useless things,
follow this process and re build."
- **Flow:** public signs up with Gmail + password (+ optional phone) and
  CNIC; the CNIC's 3-digit district prefix must match the selected
  district (mismatch = rejected). After login the user is locked to their
  own district: province → district (CNIC district only) → grid station,
  shown only once the admin publishes a schedule for it. They see ONLY
  their grid's official schedule and ONLY their grid's on/off messages,
  and post on/off in their own grid only. Admins (master-created only,
  one district + one grid) publish/edit/delete the schedule for THEIR
  grid only. Master (ADMIN_CODE) creates grids + admin accounts, reads
  the audit log.
- **Security:** scrypt password hashes; signed httpOnly session cookies
  with expiry; role + district/grid scope enforced server-side on every
  route (cross-district = 403); login rate limit (5 fails → 15 min lock,
  per-account + per-IP); generic login errors (no enumeration); full CNIC
  never stored (HMAC hash + 3-digit prefix only); audit_log for every
  publish/edit/delete and master action.
- **CNIC — 3 digits, not 5 (research-corrected):** the 5-digit prefix
  also encodes tehsil + registration office, so each district has many
  valid 5-digit prefixes sharing the same first 3 digits; a strict
  first-5 check would lock out most legitimate users. Verified table in
  `lib/cnic.js` (76/168 districts: KPK 22, Punjab 23, Sindh 18,
  Balochistan 12 incl. conflict-resolved Gwadar 521 / Kalat 512, ICT 1;
  GB + AJK 0). Sources + method in
  `~/workspace/new-projects/cnic-district-codes.md`. Districts without a
  verified prefix fail closed (signup unavailable). Khyber stays
  unverified (21101 vs 21201 conflict, unresolved).
- **CNIC honesty notes (documented in README):** prefix check only, NOT
  NADRA verification; a CNIC records registration place, not residence,
  so a genuine resident can hold another district's prefix — the hard
  block is the user's order for v2.0, and the recommended future fallback
  is manual review / domicile-document upload. Validate against
  known-good users per district before going live; disable the check for
  any district that rejects real users.
- **Gmail/phone login:** Gmail + password accounts (Gmail as identifier);
  true Google sign-in needs a Google Cloud OAuth client and true SMS OTP
  needs a paid SMS provider — neither exists here, so no OAuth/SMS flow
  is faked. Upgrade path documented in README.
- **Removed:** open public outage board, open report submission without
  login, UPS estimator, scheduled-vs-actual tracker. Old v1 tables
  (`areas`, `schedules`, `reports`, `district_admins`) left untouched in
  existing databases (legacy, unused). **Kept:** DISCO directory +
  helpline 118, /districts list (names only), 168-district pages (login
  prompt, never schedules, for logged-out visitors), 5 EXAMPLE grids.
- **Data model (new tables):** users (gmail, password_hash, phone,
  cnic_hash, cnic_district_code, role user/admin, district, grid_id,
  failed_attempts, locked_until), sessions, grids (district, name,
  is_example), grid_schedules (grid_id, weekday 0–6, windows JSON,
  note, published_by), grid_messages (grid_id, user_id, status on/off,
  note), audit_log. Existing databases gain the new tables on startup;
  smoke-tested against a copy of the live DB (old tables untouched).
- **Tests:** 80/80 passing, full suite run green 3 times on a fresh DB,
  plus a live-server smoke test on a copy of the live DB (signup, scoped
  reads, cross-district 403, logged-out login prompt). New checks prove:
  wrong CNIC prefix rejected; correct prefix accepted; unverified
  district fails closed; public cannot read/post another district (403);
  admin cannot publish/edit/delete another grid (403); admin CAN do all
  three on own grid; passwords hashed + full CNIC never stored; logged-out
  gets no schedule data; session expiry + tampering rejected; 5-fail
  lockout + unlock; role escalation at signup impossible; grids listed
  only after a schedule is published. Not pushed/deployed by this build
  step.

## QA pass — human-perspective, sell-ready (2026-11-05)
Walked every journey as a real user on a live local server (fresh DB +
copy of the live DB): Peshawar + Nowshera signups, unverified-district
(Gilgit) dead end, full admin journey (master → grid + admin → publish
→ edit → delete → cross-grid 403), logged-out visitor, security
spot-checks, 360px mobile review (tables scroll, forms wrap, buttons
44px). **103/103 checks pass** (suite run green 3 times) + a 3-minute
fresh-DB soak test (server stays up, serves `/`, `/health`, `/api/meta`,
district pages throughout). Fixes (see README "QA pass" for detail):
0.0.0.0 bind + `/health` (v1.2 deploy failed "isn't responding on its
port"); master-code placeholder leak removed; master GET auth moved to
`X-Master-Code` header; fake districts "Bari Swat" + "Paharpur" removed
(168 districts, KPK 36 — Mandi's list still needs the same cleanup);
change-password + master password reset; real logout (dashboard link
was fake, admin had none); own-message Delete in the dashboard (`own`
flag); "right now" status line; PKT time display; EXAMPLE banner;
`cnic_verified` in `/api/districts` + disabled dropdown options +
district-page pending notice; `/district/karachi` helper page; About /
contact section (M. Hashir, mhkh3200@gmail.com); favicon + robots.txt;
signup rate limit (20/hour/IP); anonymous admin reporter; registered
users table in the master console; expired-session pruning. Not
pushed/deployed by this build step. Deploy limit: 3/5 used tonight
(dashboard, 2026-11-05 ~21:11) — 2 deploys remain.

## Deploy trigger 2026-11-05 ~21:35 PKT — v2.0 full HEAD
The 7 v2.0 batches pushed ~21:25-21:27 were built as the FIRST batch's HEAD
(districts.js 168 + old server.js): live /health 404s and district pages show
old v1.2 text. This trigger starts a fresh deploy of the full v2.0 HEAD.

## 2026-11-05 ~23:20 PKT — master code made private (fail-closed)
- The hardcoded fallback default master code is gone from the repo: server.js
  now reads `ADMIN_CODE` from the environment only and exits(1) with a FATAL
  message if it is unset. No default exists anywhere in the code, tests, UI
  or README. Anyone copying the project from GitHub gets no working code.
- Tests use a test-only code via `TEST_ADMIN_CODE` env (default
  `test-admin-code`, never a real value). SESSION_SECRET logic unchanged
  (already random per startup when unset; CNIC_SECRET derives from it).
- Verified: fail-closed run exits 1 with FATAL when unset, starts normally
  when set; suite 103 checks ALL TESTS PASSED 2x. The real private code is
  set only as an env var on the host (SnapDeploy) by Hashir — never in the repo.

## Deploy record
- 2026-11-06 ~10:00 PKT: v2.1 fail-closed code + LinkedIn thumbnail pushed to main; private ADMIN_CODE / SESSION_SECRET / CNIC_SECRET set as env vars on the SnapDeploy container (never in the repo).

## 2026-11-06 — nav redesign live (Register + Log in buttons, designed kebab menu, role portals, Back to home)
