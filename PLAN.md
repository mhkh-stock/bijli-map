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
