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
