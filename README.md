# Bijli Map — بجلی میپ — Pakistan Power Outage Map

Community-reported power outages across Pakistan, on one board — plus the
official schedule next to what people actually reported, a UPS runtime
estimator, and every DISCO in one directory.

## What it does
- **Report an outage in 10 seconds**: city, area, feeder (optional), status
  out/restored, optional note. Every report is stored with its timestamp and
  shown as a **COMMUNITY REPORT (unverified)** — never as official data.
- **Live area board**: per city/area — current status from the latest report,
  report count, last report time. Areas with no reports say so plainly.
- **Scheduled vs actual tracker**: admin enters the official scheduled hours
  per area; actual hours are computed only from completed out → restored
  report pairs on that date. An outage still open is **not** counted, and
  with few reports the site says "not enough reports yet" instead of
  guessing.
- **UPS runtime estimator**: battery Ah × volts × 85% inverter efficiency ÷
  load watts = runtime (e.g. 100Ah / 12V / 200W → 5.10h = 5h 6min).
- **DISCO directory**: all 10 public DISCOs + K-Electric, regions, and the
  national complaint helpline **118**. Shedding is per feeder, not per
  neighbourhood — your feeder name is on your bill.
- **Admin panel** (`admin.html`): moderate reports (hide/show), add areas,
  enter official schedules, and issue per-city district admin codes.
- **District pages** (SEO): every city has its own server-rendered page —
  `/district/lahore`, `/district/peshawar`, and so on — with its own title,
  its live area board and its scheduled-vs-actual summary, so each city can
  be found separately on Google instead of living only inside one JS page.
  `/districts` lists every city; `/sitemap.xml` lists every city page.
- **District admins** (`district-admin.html`): the main admin issues a
  private code per city; whoever holds a city's code moderates ONLY that
  city's reports (hide/show). Codes are never seeded — the main admin
  creates them privately, and the code list never shows the codes back.

## Seeded data — and what it is NOT
- **DISCO directory**: the real public structure (11 companies + regions).
- **5 example areas + example schedules**: Gulberg (Lahore), Gulshan-e-Iqbal
  (Karachi), F-10 (Islamabad), University Road (Peshawar), Jaranwala Road
  (Faisalabad) — every one marked EXAMPLE. These are placeholders, not real
  schedules; replace them with the DISCOs' published schedules.
- **4 DEMO reports**: labelled DEMO in the UI, seeded only so the board and
  tracker mechanics can be tested. They are NOT real outage claims.
- No other outages are claimed anywhere on the site.

## Stack (same as Mandi Price Intelligence)
Node.js 24+, native `node:http` + `node:sqlite`, zero dependencies.
Port 3031 (`PORT` env), SQLite file `data/bijli.sqlite` (`DB_FILE` env),
WAL mode. Admin code: `ADMIN_CODE` env (default `bijli-admin`, demo-grade —
change it on deploy).

## Run
```sh
node server.js          # http://127.0.0.1:3031
node test.js            # 50 checks on a fresh DB (all must pass)
```

## Honest limits
- Community reports are unverified by design. For an official complaint,
  call **118**. KE customers can also use the official KE Live app — but it
  covers Karachi/K-Electric only; this map aims to cover all DISCOs.
- Actual-hours figures need real report volume: one area with two reports
  is a demonstration, not a measurement. The tracker says so.
- Report timestamps are stored in UTC, so scheduled-vs-actual date grouping
  follows UTC, not PKT — a late-night PKT report can land on the next UTC
  date. PKT-aware grouping is a v2 fix (see PLAN.md).
- Reported context, not our measurement: a NEPRA review found actual
  outages on very-high-loss feeders averaging about 12h 14m, above scheduled
  limits. That is why scheduled-vs-actual tracking matters.
- No SMS/WhatsApp alerts yet — that is a v2 step, not claimed here.
- District admin codes are shared codes per city (demo-grade, like the
  master code): set private codes, because anyone holding a city's code
  moderates that whole city. A district code never grants access to
  another city's reports (enforced server-side, tested).
- District pages are city-level (one page per city in the areas table);
  new cities get a page automatically once an area is reported there.
