// Bijli Map — Pakistan Power Outage Map.
// Crowdsourced, area-level outage reports + scheduled-vs-actual tracker +
// UPS runtime estimator + DISCO directory. Community reports are UNVERIFIED
// and are always labelled as such — never presented as official data.
// Node.js 24+, native node:http + node:sqlite only. No external dependencies.
// Port 3031. Data: data/bijli.sqlite. Admin gate is a simple shared code
// (env ADMIN_CODE, default 'bijli-admin') — demo-grade, documented in README.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3031);
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'bijli.sqlite');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_CODE = process.env.ADMIN_CODE || 'bijli-admin';
const HELPLINE = '118'; // national electricity complaint helpline (all DISCOs)

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS discos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
  region TEXT NOT NULL DEFAULT '', helpline TEXT NOT NULL DEFAULT '118'
);
CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL, area TEXT NOT NULL, disco_id INTEGER REFERENCES discos(id),
  feeder TEXT NOT NULL DEFAULT '', is_example INTEGER NOT NULL DEFAULT 0,
  UNIQUE(city, area)
);
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area_id INTEGER NOT NULL REFERENCES areas(id),
  date TEXT NOT NULL, scheduled_hours REAL NOT NULL, note TEXT NOT NULL DEFAULT '',
  UNIQUE(area_id, date)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area_id INTEGER NOT NULL REFERENCES areas(id),
  feeder TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('out','restored')),
  note TEXT NOT NULL DEFAULT '', is_demo INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

function discoId(name, region) {
  db.prepare('INSERT OR IGNORE INTO discos(name, region, helpline) VALUES(?,?,?)').run(name, region || '', HELPLINE);
  return db.prepare('SELECT id FROM discos WHERE name=?').get(name).id;
}
function areaId(city, area, discoName, feeder, isExample) {
  const did = discoName ? discoId(discoName, '') : null;
  db.prepare(`INSERT OR IGNORE INTO areas(city, area, disco_id, feeder, is_example)
    VALUES(?,?,?,?,?)`).run(city, area, did, feeder || '', isExample ? 1 : 0);
  const row = db.prepare('SELECT id FROM areas WHERE city=? AND area=?').get(city, area);
  if (discoName && !row.disco_id) db.prepare('UPDATE areas SET disco_id=? WHERE id=?').run(did, row.id);
  if (feeder && !row.feeder) db.prepare('UPDATE areas SET feeder=? WHERE id=?').run(feeder, row.id);
  return row.id;
}

// ---- seed: DISCO directory (public structure) + clearly-marked EXAMPLE areas,
// EXAMPLE schedules and DEMO reports only. No real outages are claimed. ----
const discoCount = db.prepare('SELECT COUNT(*) c FROM discos').get().c;
if (discoCount === 0) {
  const DISCOS = [
    ['LESCO', 'Lahore, Kasur, Okara, Sheikhupura'],
    ['IESCO', 'Islamabad, Rawalpindi, Attock, Jhelum, Chakwal'],
    ['PESCO', 'Khyber Pakhtunkhwa'],
    ['HESCO', 'Hyderabad and southern Sindh'],
    ['SEPCO', 'Sukkur and northern Sindh'],
    ['MEPCO', 'Multan region'],
    ['FESCO', 'Faisalabad region'],
    ['GEPCO', 'Gujranwala region'],
    ['QESCO', 'Quetta and Balochistan'],
    ['TESCO', 'Tribal districts (ex-FATA)'],
    ['K-Electric', 'Karachi'],
  ];
  for (const [n, r] of DISCOS) discoId(n, r);
  // Example areas + example schedules (labelled EXAMPLE in the UI).
  const ex = [
    ['Lahore', 'Gulberg', 'LESCO', 'Gulberg-1', '2026-11-04', 2.0],
    ['Karachi', 'Gulshan-e-Iqbal', 'K-Electric', '', '2026-11-04', 0.0],
    ['Islamabad', 'F-10', 'IESCO', '', '2026-11-04', 1.5],
    ['Peshawar', 'University Road', 'PESCO', '', '2026-11-04', 4.0],
    ['Faisalabad', 'Jaranwala Road', 'FESCO', '', '2026-11-04', 2.0],
  ];
  for (const [city, area, disco, feeder, date, hrs] of ex) {
    const aid = areaId(city, area, disco, feeder, true);
    db.prepare(`INSERT OR IGNORE INTO schedules(area_id, date, scheduled_hours, note)
      VALUES(?,?,?, 'EXAMPLE schedule — replace with the official schedule for this area')`).run(aid, date, hrs);
  }
  // DEMO reports (labelled DEMO in the UI) so the board + tracker mechanics
  // can be tested. They are NOT real outage claims.
  const demo = [
    ['Lahore', 'Gulberg', 'out', '2026-11-04 10:00:00', 'DEMO: light went out (test report)'],
    ['Lahore', 'Gulberg', 'restored', '2026-11-04 12:30:00', 'DEMO: light back (test report)'],
    ['Karachi', 'Gulshan-e-Iqbal', 'out', '2026-11-04 09:15:00', 'DEMO: reported out (test report)'],
    ['Peshawar', 'University Road', 'restored', '2026-11-04 08:00:00', 'DEMO: reported restored (test report)'],
  ];
  const ins = db.prepare(`INSERT INTO reports(area_id, status, note, is_demo, created_at)
    VALUES(?,?,?,?,?)`);
  for (const [city, area, status, at, note] of demo) {
    const aid = areaId(city, area, null, '', true);
    ins.run(aid, status, note, 1, at);
  }
}

function discos() {
  return db.prepare('SELECT name, region, helpline FROM discos ORDER BY name').all();
}
function areas() {
  return db.prepare(`
    SELECT a.id id, a.city city, a.area area, a.feeder feeder, a.is_example is_example,
      d.name disco FROM areas a LEFT JOIN discos d ON d.id = a.disco_id ORDER BY a.city, a.area`).all()
    .map((r) => ({ ...r, is_example: r.is_example === 1 }));
}
function visibleReports(areaIdVal) {
  return db.prepare(`
    SELECT id, feeder, status, note, is_demo, created_at FROM reports
    WHERE area_id = ? AND hidden = 0 ORDER BY created_at ASC, id ASC`).all(areaIdVal);
}
function board() {
  return areas().map((a) => {
    const reps = visibleReports(a.id);
    const latest = reps[reps.length - 1] || null;
    return {
      area_id: a.id, city: a.city, area: a.area, disco: a.disco, feeder: a.feeder,
      is_example: a.is_example,
      status: latest ? latest.status : null,
      report_count: reps.length,
      last_report_at: latest ? latest.created_at : null,
      latest_is_demo: latest ? latest.is_demo === 1 : false,
      latest_note: latest ? latest.note : null,
    };
  });
}
// Actual outage hours for one area on one date: sum of completed out->restored
// windows only. An outage still open at the end is NOT counted (said plainly).
function actualHours(areaIdVal, date) {
  const reps = db.prepare(`
    SELECT status, created_at FROM reports WHERE area_id = ? AND hidden = 0
    AND date(created_at) = ? ORDER BY created_at ASC, id ASC`).all(areaIdVal, date);
  let total = 0, open = null, windows = 0;
  for (const r of reps) {
    const t = Date.parse(r.created_at.replace(' ', 'T') + 'Z');
    if (Number.isNaN(t)) continue;
    if (r.status === 'out' && open === null) open = t;
    else if (r.status === 'restored' && open !== null) {
      total += (t - open) / 3600000; open = null; windows++;
    }
  }
  return { hours: windows === 0 ? null : Math.round(total * 100) / 100, windows, open_outage: open !== null };
}
function tracker() {
  return db.prepare(`
    SELECT s.area_id area_id, s.date date, s.scheduled_hours scheduled_hours, s.note note,
      a.city city, a.area area, d.name disco FROM schedules s
    JOIN areas a ON a.id = s.area_id LEFT JOIN discos d ON d.id = a.disco_id
    ORDER BY s.date DESC, a.city, a.area`).all().map((r) => {
    const act = actualHours(r.area_id, r.date);
    return { ...r, actual_hours: act.hours, completed_windows: act.windows, open_outage: act.open_outage };
  });
}
function estimate(ah, volts, watts, eff) {
  const energyWh = ah * volts;
  const runtimeH = (energyWh * eff) / watts;
  const totalMin = Math.round(runtimeH * 60);
  return {
    battery_ah: ah, voltage: volts, load_watts: watts, efficiency: eff,
    energy_wh: Math.round(energyWh * 100) / 100,
    usable_wh: Math.round(energyWh * eff * 100) / 100,
    runtime_hours: Math.round(runtimeH * 100) / 100,
    runtime_text: Math.floor(totalMin / 60) + 'h ' + (totalMin % 60) + 'min',
    note: 'Estimate only: assumes a ' + Math.round(eff * 100) + '% efficient inverter and a constant load. Real runtime varies with battery age, temperature and actual load.',
  };
}

// ---- HTTP layer (same shape as project 1) ----
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 200000) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(null); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/api/meta' && req.method === 'GET') {
      return sendJson(res, 200, { discos: discos(), areas: areas(), helpline: HELPLINE,
        notice: 'Reports on this site are COMMUNITY REPORTS (unverified). They are not official DISCO data.' });
    }
    if (p === '/api/discos' && req.method === 'GET') return sendJson(res, 200, { discos: discos(), helpline: HELPLINE });
    if (p === '/api/board' && req.method === 'GET') return sendJson(res, 200, { areas: board() });
    if (p === '/api/tracker' && req.method === 'GET') return sendJson(res, 200, { rows: tracker() });
    if (p === '/api/report' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body || !body.city || !body.area || !['out', 'restored'].includes(body.status)) {
        return sendJson(res, 400, { error: 'city, area and status (out/restored) required' });
      }
      const city = String(body.city).trim().slice(0, 80);
      const area = String(body.area).trim().slice(0, 120);
      if (!city || !area) return sendJson(res, 400, { error: 'city and area must not be empty' });
      const aid = areaId(city, area, body.disco || null, body.feeder || '', false);
      let at = null;
      if (body.reported_at) {
        const t = Date.parse(String(body.reported_at).replace(' ', 'T'));
        if (Number.isNaN(t)) return sendJson(res, 400, { error: 'reported_at must be a valid date/time' });
        at = new Date(t).toISOString().slice(0, 19).replace('T', ' ');
      }
      const row = at
        ? db.prepare(`INSERT INTO reports(area_id, feeder, status, note, created_at) VALUES(?,?,?,?,?)`)
            .run(aid, String(body.feeder || '').slice(0, 80), body.status, String(body.note || '').slice(0, 300), at)
        : db.prepare(`INSERT INTO reports(area_id, feeder, status, note) VALUES(?,?,?,?)`)
            .run(aid, String(body.feeder || '').slice(0, 80), body.status, String(body.note || '').slice(0, 300));
      return sendJson(res, 200, { ok: true, id: Number(row.lastInsertRowid), area_id: aid });
    }
    if (p === '/api/estimate' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'body required' });
      const ah = Number(body.battery_ah), v = Number(body.voltage), w = Number(body.load_watts);
      const eff = body.efficiency === undefined ? 0.85 : Number(body.efficiency);
      if (![ah, v, w, eff].every(Number.isFinite) || ah <= 0 || v <= 0 || w <= 0 || eff <= 0 || eff > 1) {
        return sendJson(res, 400, { error: 'battery_ah, voltage, load_watts must be > 0; efficiency must be in (0, 1]' });
      }
      return sendJson(res, 200, estimate(ah, v, w, eff));
    }
    if (p === '/api/admin/reports' && req.method === 'GET') {
      if (url.searchParams.get('code') !== ADMIN_CODE) return sendJson(res, 403, { error: 'bad admin code' });
      const rows = db.prepare(`
        SELECT r.id id, a.city city, a.area area, r.feeder feeder, r.status status,
          r.note note, r.is_demo is_demo, r.hidden hidden, r.created_at created_at
        FROM reports r JOIN areas a ON a.id = r.area_id ORDER BY r.created_at DESC, r.id DESC LIMIT 200`).all();
      return sendJson(res, 200, { rows });
    }
    if (p === '/api/admin/hide' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body || body.code !== ADMIN_CODE) return sendJson(res, 403, { error: 'bad admin code' });
      if (body.id === undefined) return sendJson(res, 400, { error: 'id required' });
      db.prepare('UPDATE reports SET hidden = ? WHERE id = ?').run(body.hidden ? 1 : 0, Number(body.id));
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/admin/area' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body || body.code !== ADMIN_CODE) return sendJson(res, 403, { error: 'bad admin code' });
      if (!body.city || !body.area) return sendJson(res, 400, { error: 'city and area required' });
      const aid = areaId(String(body.city), String(body.area), body.disco || null, body.feeder || '', false);
      return sendJson(res, 200, { ok: true, area_id: aid });
    }
    if (p === '/api/admin/schedule' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body || body.code !== ADMIN_CODE) return sendJson(res, 403, { error: 'bad admin code' });
      if (body.area_id === undefined || !body.date || body.scheduled_hours === undefined) {
        return sendJson(res, 400, { error: 'area_id, date and scheduled_hours required' });
      }
      const hrs = Number(body.scheduled_hours);
      if (!Number.isFinite(hrs) || hrs < 0 || hrs > 24) return sendJson(res, 400, { error: 'scheduled_hours must be 0–24' });
      db.prepare(`INSERT INTO schedules(area_id, date, scheduled_hours, note) VALUES(?,?,?,?)
        ON CONFLICT(area_id, date) DO UPDATE SET scheduled_hours=excluded.scheduled_hours, note=excluded.note`)
        .run(Number(body.area_id), String(body.date), hrs, String(body.note || '').slice(0, 300));
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'GET') return serveStatic(req, res);
    res.writeHead(405); res.end('Method not allowed');
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Bijli Map running on http://127.0.0.1:${PORT} (DB: ${DB_FILE})`);
});
