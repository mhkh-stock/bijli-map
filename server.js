// Bijli Map v2.0 — role-based, district-scoped, login-gated.
// Public users log in with Gmail + password + CNIC; the CNIC's 3-digit
// district prefix must match the district they select (first 3 digits
// only — each district has many valid 5-digit prefixes sharing them;
// format/prefix check ONLY — NOT NADRA verification; see README). After login a user is locked
// to their own district: they see ONLY their district's grids that have a
// published schedule, ONLY their grid's official schedule and ONLY their
// grid's public on/off messages, and they can post on/off messages in
// their own grid only.
// Government admins (accounts created ONLY by the master admin, never
// self-registration, never seeded) belong to one district + grid and can
// publish, edit and delete the official load-shedding schedule for THAT
// grid only. Public users cannot edit or delete anything.
// REMOVED in v2.0: the open public outage board, the UPS estimator, the
// scheduled-vs-actual tracker, open report submission without login.
// KEPT: the DISCO directory + helpline 118, and the /districts list
// (district names only — no schedule data for logged-out visitors).
// Node.js 24+, native node:http + node:sqlite only. No external deps.
// Port 3031. Data: data/bijli.sqlite. Master gate: env ADMIN_CODE.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { PROVINCE_ORDER, DISTRICTS, discoForDistrict } = require('./lib/districts');
const { cnicPrefixForDistrict } = require('./lib/cnic');
const { writableBase, resolveDbFile } = require('./lib/dbPath');

const PORT = Number(process.env.PORT || 3031);
// Deploy-only writable-location fallback (FoodScope pattern): on a local
// run __dirname is writable, so the database stays in data/bijli.sqlite
// exactly as before. Only when the app dir cannot be written (e.g.
// SnapDeploy's /app) does it move to /tmp/bijli-map/data/bijli.sqlite.
// DB_FILE env always wins when set — use it on deploy for persistent
// storage, because /tmp is wiped on container restart.
const DATA_ROOT = writableBase(__dirname);
const DB_FILE = resolveDbFile(__dirname, process.env.DB_FILE);
if (DATA_ROOT !== __dirname) console.log('Bijli Map data directory (read-only app dir fallback):', DATA_ROOT);
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_CODE = process.env.ADMIN_CODE;
if (!ADMIN_CODE) { console.error('FATAL: ADMIN_CODE env var is required — set a private code, there is no default.'); process.exit(1); }
const HELPLINE = '118'; // national electricity complaint helpline (all DISCOs)
// Session secret: set SESSION_SECRET on deploy so sessions survive
// restarts. Without it a random secret is generated at startup and all
// sessions end when the server restarts (safe default, documented).
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const CNIC_SECRET = process.env.CNIC_SECRET || SESSION_SECRET;
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 86400); // 24h
const LOGIN_LOCK_SECONDS = Number(process.env.LOGIN_LOCK_SECONDS || 900); // 15 min
const MAX_FAILED_LOGINS = 5;

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS discos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
  region TEXT NOT NULL DEFAULT '', helpline TEXT NOT NULL DEFAULT '118'
);
CREATE TABLE IF NOT EXISTS districts (
  name TEXT PRIMARY KEY, province TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gmail TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  cnic_hash TEXT NOT NULL,
  cnic_district_code TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK(role IN ('user','admin')) DEFAULT 'user',
  district TEXT NOT NULL DEFAULT '',
  grid_id INTEGER,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS grids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district TEXT NOT NULL, name TEXT NOT NULL, is_example INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(district, name)
);
CREATE TABLE IF NOT EXISTS grid_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grid_id INTEGER NOT NULL REFERENCES grids(id),
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  windows TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  published_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(grid_id, weekday)
);
CREATE TABLE IF NOT EXISTS grid_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grid_id INTEGER NOT NULL REFERENCES grids(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('on','off')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER, actor_gmail TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL, grid_id INTEGER, district TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---- seed: DISCO directory + all 168 districts (idempotent) ----
{
  const ins = db.prepare('INSERT OR IGNORE INTO districts(name, province) VALUES(?,?)');
  for (const d of DISTRICTS) ins.run(d.name, d.province);
}
function discoId(name, region) {
  db.prepare('INSERT OR IGNORE INTO discos(name, region, helpline) VALUES(?,?,?)').run(name, region || '', HELPLINE);
  return db.prepare('SELECT id FROM discos WHERE name=?').get(name).id;
}
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
}
// ---- seed: the 5 v1 example areas as EXAMPLE grids, each with one
// EXAMPLE weekly schedule (Monday). These are placeholders, not real
// schedules — replace them with the DISCOs' published schedules. No demo
// messages are seeded: on/off messages are posted by real logged-in users
// only, never invented. ----
const gridCount = db.prepare('SELECT COUNT(*) c FROM grids').get().c;
if (gridCount === 0) {
  const exGrids = [
    ['Lahore', 'Gulberg'],
    ['Karachi East', 'Gulshan-e-Iqbal'],
    ['Islamabad', 'F-10'],
    ['Peshawar', 'University Road'],
    ['Faisalabad', 'Jaranwala Road'],
  ];
  const insGrid = db.prepare('INSERT INTO grids(district, name, is_example) VALUES(?,?,1)');
  const insSch = db.prepare(`INSERT INTO grid_schedules(grid_id, weekday, windows, note)
    VALUES(?,?,?, 'EXAMPLE schedule — replace with the official schedule for this grid')`);
  for (const [district, name] of exGrids) {
    const r = insGrid.run(district, name);
    insSch.run(Number(r.lastInsertRowid), 1, JSON.stringify([{ start: '08:00', end: '10:00' }, { start: '14:00', end: '16:00' }]));
  }
}

// ---- crypto helpers ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}
function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'hex');
    const hash = Buffer.from(parts[2], 'hex');
    const test = crypto.scryptSync(password, salt, 64);
    return hash.length === test.length && crypto.timingSafeEqual(hash, test);
  } catch { return false; }
}
function hmacHex(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}
function cnicHash(normalizedCnic) {
  // Deterministic HMAC (not reversible without the server secret) so one
  // CNIC can hold only one account. The full CNIC is NEVER stored.
  return hmacHex(normalizedCnic, CNIC_SECRET);
}
function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}
function signToken(token) {
  return token + '.' + hmacHex(token, SESSION_SECRET);
}
function verifySignedToken(signed) {
  if (!signed || typeof signed !== 'string') return null;
  const dot = signed.lastIndexOf('.');
  if (dot <= 0) return null;
  const token = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expect = hmacHex(token, SESSION_SECRET);
  if (sig.length !== expect.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  } catch { return null; }
  return token;
}

// ---- lookups ----
function discos() {
  return db.prepare('SELECT name, region, helpline FROM discos ORDER BY name').all();
}
function districts() {
  return db.prepare('SELECT name, province FROM districts ORDER BY name').all();
}
function districtRow(name) {
  return db.prepare('SELECT name, province FROM districts WHERE LOWER(name) = LOWER(?)').get(String(name)) || null;
}
function gridsIn(district) {
  return db.prepare('SELECT id, district, name, is_example FROM grids WHERE LOWER(district) = LOWER(?) ORDER BY name').all(district)
    .map((g) => ({ ...g, is_example: g.is_example === 1 }));
}
function gridById(id) {
  return db.prepare('SELECT id, district, name, is_example FROM grids WHERE id = ?').get(Number(id)) || null;
}
function gridHasSchedule(gridId) {
  return db.prepare('SELECT COUNT(*) c FROM grid_schedules WHERE grid_id = ?').get(gridId).c > 0;
}
function scheduleForGrid(gridId) {
  return db.prepare('SELECT id, grid_id, weekday, windows, note, published_by, updated_at FROM grid_schedules WHERE grid_id = ? ORDER BY weekday').all(gridId)
    .map((r) => ({ ...r, windows: JSON.parse(r.windows) }));
}
function messagesForGrid(gridId, limit) {
  return db.prepare(`SELECT id, grid_id, user_id, status, note, created_at FROM grid_messages
    WHERE grid_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`).all(gridId, limit || 50);
}
function audit(action, actor, gridId, district, detail) {
  db.prepare(`INSERT INTO audit_log(actor_id, actor_gmail, action, grid_id, district, detail)
    VALUES(?,?,?,?,?,?)`).run(actor ? actor.id : null, actor ? actor.gmail : 'master',
    action, gridId || null, district || '', detail || '');
}

// ---- auth ----
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}
function sessionUser(req) {
  const signed = parseCookies(req).bijli_session;
  const token = verifySignedToken(signed);
  if (!token) return null;
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(hmacHex(token, SESSION_SECRET));
  if (!row) return null;
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hmacHex(token, SESSION_SECRET));
    return null;
  }
  const user = db.prepare('SELECT id, gmail, phone, role, district, grid_id, created_at FROM users WHERE id = ?').get(row.user_id);
  return user || null;
}
function setSessionCookie(res, user) {
  const token = newSessionToken();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  // Drop long-dead sessions so the table does not grow forever.
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Math.floor(Date.now() / 1000));
  db.prepare('INSERT INTO sessions(user_id, token_hash, expires_at) VALUES(?,?,?)')
    .run(user.id, hmacHex(token, SESSION_SECRET), expiresAt);
  return 'bijli_session=' + signToken(token) + '; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=' + SESSION_TTL_SECONDS;
}
function clearSessionCookie(req, res) {
  const signed = parseCookies(req).bijli_session;
  const token = verifySignedToken(signed);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hmacHex(token, SESSION_SECRET));
  return 'bijli_session=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0';
}
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, gmail: u.gmail, role: u.role, district: u.district, grid_id: u.grid_id || null };
}

// ---- validation ----
function validGmail(g) {
  return typeof g === 'string' && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(g.trim());
}
function normalizeCnic(raw) {
  return String(raw || '').replace(/[^0-9]/g, '');
}
function validWindows(windows) {
  if (!Array.isArray(windows) || windows.length === 0 || windows.length > 6) return false;
  const seen = [];
  for (const w of windows) {
    if (!w || typeof w.start !== 'string' || typeof w.end !== 'string') return false;
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(w.start) || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(w.end)) return false;
    if (w.start >= w.end) return false;
    seen.push([w.start, w.end]);
  }
  seen.sort();
  for (let i = 1; i < seen.length; i++) if (seen[i][0] < seen[i - 1][1]) return false;
  return true;
}
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---- login rate limiting (in-memory per IP) ----
const ipFails = new Map(); // ip -> { count, firstAt, blockedUntil }
function ipBlocked(ip) {
  const rec = ipFails.get(ip);
  if (!rec) return false;
  const now = Date.now();
  if (rec.blockedUntil && now < rec.blockedUntil) return true;
  if (now - rec.firstAt > 10 * 60 * 1000) ipFails.delete(ip);
  return false;
}
function ipFail(ip) {
  const now = Date.now();
  const rec = ipFails.get(ip) || { count: 0, firstAt: now, blockedUntil: 0 };
  if (now - rec.firstAt > 10 * 60 * 1000) { rec.count = 0; rec.firstAt = now; rec.blockedUntil = 0; }
  rec.count++;
  if (rec.count >= MAX_FAILED_LOGINS) rec.blockedUntil = now + LOGIN_LOCK_SECONDS * 1000;
  ipFails.set(ip, rec);
}
function ipReset(ip) { ipFails.delete(ip); }
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';
}

// ---- signup rate limiting (in-memory per IP): max 20 successful
// signups per hour from one IP, so the public form cannot be spammed
// into creating junk accounts. Only successes count, so honest users who
// mistype a field are not punished. (Behind the platform proxy the real
// client IP arrives in X-Forwarded-For; a direct caller can spoof that
// header, so this is abuse friction, not a hard guarantee.)
const SIGNUP_LIMIT = 20;
const signupCounts = new Map(); // ip -> { count, firstAt }
function signupAllowed(ip) {
  const now = Date.now();
  const rec = signupCounts.get(ip) || { count: 0, firstAt: now };
  if (now - rec.firstAt > 60 * 60 * 1000) { rec.count = 0; rec.firstAt = now; }
  return rec.count < SIGNUP_LIMIT;
}
function signupCounted(ip) {
  const now = Date.now();
  const rec = signupCounts.get(ip) || { count: 0, firstAt: now };
  if (now - rec.firstAt > 60 * 60 * 1000) { rec.count = 0; rec.firstAt = now; }
  rec.count++;
  signupCounts.set(ip, rec);
}

// ---- generic per-IP rate limiting (in-memory): max N requests per
// window for one key. Used by the master password reset (a wrong master
// code is the brute-force target) and the admin schedule writes (publish
// + delete). Limits are generous for real use — a master or an admin
// never legitimately fires dozens of these in an hour — and only the
// rate-limited endpoints count, so the rest of the app is unaffected.
// (Behind the platform proxy the real client IP arrives in
// X-Forwarded-For; a direct caller can spoof that header, so this is
// abuse friction, not a hard guarantee — same caveat as the signup
// limiter above.)
const RATE_LIMITS = new Map(); // key -> { count, firstAt }
function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  const rec = RATE_LIMITS.get(key) || { count: 0, firstAt: now };
  if (now - rec.firstAt > windowMs) { rec.count = 0; rec.firstAt = now; }
  if (rec.count >= limit) return true;
  rec.count++;
  RATE_LIMITS.set(key, rec);
  return false;
}
const MASTER_RESET_LIMIT = 20; // attempts per hour per IP
const ADMIN_SCHEDULE_LIMIT = 60; // writes per hour per IP
const RATE_WINDOW_MS = 60 * 60 * 1000;

// ---- HTTP helpers ----
function sendJson(res, code, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), ...(extraHeaders || {}) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let done = false;
    // Oversize bodies used to hang: the old code called req.destroy(),
    // which kills the socket — so no 400 could ever be sent back and
    // the client saw ECONNRESET. Instead, stop accumulating (memory
    // stays capped), resolve null so the caller answers 400, and let
    // the remaining upload drain harmlessly through this listener.
    req.on('data', (c) => {
      if (done) return;
      data += c;
      if (data.length > 200000) { done = true; resolve(null); }
    });
    req.on('end', () => { if (done) return; done = true; try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(null); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function citySlug(city) {
  return String(city).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function findDistrictBySlug(slug) {
  return districts().find((d) => citySlug(d.name) === slug) || null;
}
function pageShell(title, desc, body, extraNav) {
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<title>' + escHtml(title) + '</title>\n'
    + '<meta name="description" content="' + escHtml(desc) + '">\n'
    + '<link rel="icon" href="/favicon.ico">\n'
    + '<link rel="stylesheet" href="/styles.css">\n</head>\n<body>\n'
    // Same header as the static pages (see public/nav.js for the shared
    // behaviour): sticky, visible primary actions + kebab (⋮) overflow menu.
    + '<header class="topbar" data-page="district">\n'
    + '  <div class="logo">⚡ Bijli Map <span class="urdu">بجلی میپ</span></div>\n'
    + '  <div class="topbar-actions">\n'
    + '    <div class="primary-actions">\n'
    + '      <a class="btn-primary" href="/register.html" data-auth="out">Register</a>\n'
    + '      <a class="btn-ghost" href="/login.html" data-auth="out">Log in</a>\n'
    + '      <a class="btn-primary" href="/app.html" data-auth="in" hidden>My district</a>\n'
    + '      <button type="button" class="btn-ghost" data-logout data-auth="in" hidden>Log out</button>\n'
    + '    </div>\n'
    + '    <button class="kebab" id="menuBtn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="overflowMenu" aria-label="Menu">⋮</button>\n'
    + '    <div class="overflow-menu" id="overflowMenu" role="menu" hidden>\n'
    + '      <div class="menu-group">\n'
    + '        <div class="menu-heading">Browse</div>\n'
    + '        <a role="menuitem" href="/districts">🗺️ All districts</a>\n'
    + '        <a role="menuitem" href="/#discos">⚡ DISCO directory</a>\n'
    + '        <a role="menuitem" href="/#about">ℹ️ About</a>\n'
    + '      </div>\n'
    + '      <div class="menu-group" data-auth="out">\n'
    + '        <div class="menu-heading">Account</div>\n'
    + '        <a role="menuitem" href="/register.html">✏️ Register</a>\n'
    + '        <a role="menuitem" href="/login.html">🔑 Log in</a>\n'
    + '      </div>\n'
    + '      <div class="menu-group" data-auth="in" hidden>\n'
    + '        <div class="menu-heading">Account</div>\n'
    + '        <a role="menuitem" href="/app.html">🏠 My district</a>\n'
    + '        <button type="button" role="menuitem" data-logout>🚪 Log out</button>\n'
    + '      </div>\n'
    + '      <div class="menu-group">\n'
    + '        <div class="menu-heading">Admin</div>\n'
    + '        <a role="menuitem" href="/admin.html">🛠️ Admin portal</a>\n'
    + '      </div>\n'
    + '    </div>\n'
    + '  </div>\n'
    + '</header>\n'
    + '<div class="back-row"><a class="back-btn" href="/">← Back to home</a></div>\n'
    + body + '\n<script src="/nav.js"></script>\n</body>\n</html>\n';
}
function districtPageHtml(district, viewer) {
  const prov = district.province;
  const disco = discoForDistrict(district.name, prov);
  const grids = gridsIn(district.name);
  const cnicOk = !!cnicPrefixForDistrict(district.name);
  const gridItems = grids.map((g) => '<li>' + escHtml(g.name) + (g.is_example ? ' <span class="badge example">EXAMPLE</span>' : '') + '</li>').join('')
    || '<li>No grid stations listed for this district yet — a grid appears here once the admin creates it.</li>';
  let accessNote;
  if (!viewer) {
    accessNote = '<p class="warn">🔒 <strong>Login required.</strong> Schedules and on/off messages for this district are shown only to logged-in people from this district. '
      + '<a href="/">Log in or sign up</a> — your CNIC district must match this district.</p>'
      + (cnicOk ? '' : '<p class="warn">⏳ <strong>Signups for ' + escHtml(district.name) + ' are not open yet.</strong> '
        + 'Its CNIC district code is still being verified, so nobody can sign up for this district until that check is done. '
        + 'Check back soon — or ask the master admin about it.</p>');
  } else if (viewer.district.toLowerCase() === district.name.toLowerCase()) {
    accessNote = '<p class="note">You are logged in for <strong>' + escHtml(viewer.district) + '</strong>. '
      + '<a href="/app.html">Open your dashboard</a> to see your grid\'s official schedule and messages.</p>';
  } else {
    accessNote = '<p class="warn">🔒 You are logged in for <strong>' + escHtml(viewer.district) + '</strong>, so this district\'s schedules and messages are not visible to you. '
      + 'Each person sees only their own district. <a href="/app.html">Open your dashboard</a>.</p>';
  }
  const body = '<section class="hero"><h1>Load-shedding schedule — ' + escHtml(district.name) + '</h1>'
    + '<p>Official load-shedding schedules for ' + escHtml(district.name) + ' (' + escHtml(prov) + '), Pakistan, published by the government admin for each grid station. '
    + 'Schedules are visible only to logged-in people from this district.</p>'
    + (disco
      ? '<p class="note">DISCO for this district: <strong>' + escHtml(disco) + '</strong> · for an official complaint call the national electricity helpline <strong>118</strong>.</p>'
      : '<p class="note">No single DISCO is listed for this district — for an official complaint call the national electricity helpline <strong>118</strong>.</p>')
    + accessNote + '</section>'
    + '<section class="section"><h2>Grid stations in ' + escHtml(district.name) + '</h2>'
    + '<ul>' + gridItems + '</ul>'
    + '<p class="note">A grid station is shown with its schedule only after the admin publishes one for it. Grid names are public; schedules and messages are not.</p></section>'
    + '<section class="section"><h2>Other districts in ' + escHtml(prov) + '</h2><p>'
    + districts().filter((d) => d.province === prov && d.name !== district.name).map((d) => '<a href="/district/' + citySlug(d.name) + '">' + escHtml(d.name) + '</a>').join(' · ')
    + '</p><p><a href="/districts">All districts</a> · <a href="/">Home</a></p></section>';
  return pageShell(
    'Load-shedding schedule in ' + district.name + ' — Bijli Map',
    'Official load-shedding schedule for ' + district.name + ', Pakistan, published by the government admin. Login required; each person sees only their own district.',
    body);
}
function districtsIndexHtml() {
  const tableHead = '<div class="table-wrap"><table>'
    + '<thead><tr><th>District</th><th>DISCO</th><th>Grid stations</th></tr></thead><tbody>';
  const sections = PROVINCE_ORDER.map((prov) => {
    const names = districts().filter((d) => d.province === prov);
    const rows = names.map((d) => {
      const disco = discoForDistrict(d.name, prov);
      return '<tr><td><a href="/district/' + citySlug(d.name) + '">' + escHtml(d.name) + '</a></td><td>'
        + escHtml(disco || '—') + '</td><td>' + gridsIn(d.name).length + '</td></tr>';
    }).join('');
    return '<section class="section"><h2>' + escHtml(prov) + ' (' + names.length + ' districts)</h2>'
      + tableHead + rows + '</tbody></table></div></section>';
  }).join('');
  const body = '<section class="hero"><h1>Load-shedding schedules by district — Bijli Map</h1>'
    + '<p>All 168 districts of Pakistan have their own page. Pick your district to see its grid stations. '
    + 'Schedules and on/off messages are shown only after login, and only to people from that district — logged-out visitors see district names only, never schedules.</p>'
    + '<p class="warn">🔒 <strong>Login required for schedules.</strong> Sign up with your Gmail and CNIC — your CNIC district must match the district you select. '
    + 'For an official complaint, call the national electricity helpline <strong>118</strong>.</p></section>'
    + sections;
  return pageShell('Load-shedding schedules by district — Bijli Map',
    'Bijli Map district pages: official load-shedding schedules for all 168 districts of Pakistan. Login required; each person sees only their own district.',
    body);
}
function sitemapXml(host) {
  const base = 'http://' + host;
  const urls = ['/', '/districts', ...districts().map((d) => '/district/' + citySlug(d.name))];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => '  <url><loc>' + base + u + '</loc></url>').join('\n')
    + '\n</urlset>\n';
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' };
    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    // ---- health (no DB, no auth — for the platform health check) ----
    // SnapDeploy's deploy failed 2026-11-05 with "container started but
    // isn't responding on its port": the app must answer on the port fast
    // and on all interfaces. This endpoint exists for exactly that.
    if (p === '/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true });
    }
    // ---- public info (no schedule data, no login needed) ----
    if (p === '/api/meta' && req.method === 'GET') {
      return sendJson(res, 200, { discos: discos(), helpline: HELPLINE,
        districts_total: districts().length,
        notice: 'Schedules and on/off messages are shown only to logged-in people from their own district. For an official complaint call helpline 118.' });
    }
    if (p === '/api/discos' && req.method === 'GET') return sendJson(res, 200, { discos: discos(), helpline: HELPLINE });
    if (p === '/api/districts' && req.method === 'GET') {
      const list = districts().map((d) => ({
        name: d.name, province: d.province, slug: citySlug(d.name),
        disco: discoForDistrict(d.name, d.province), // null where no DISCO is unambiguous
        // Whether a person can sign up for this district today: the CNIC
        // district code must be verified first. Unverified districts are
        // listed (so people can find them) but cannot be claimed yet.
        cnic_verified: !!cnicPrefixForDistrict(d.name),
        // The district's verified 3-digit CNIC prefix (null when
        // unverified), so the signup form can tell the person BEFORE
        // they submit what their CNIC must start with. The prefix is
        // not a secret: it is the district's public code, and the check
        // itself is a format check, not identity verification.
        cnic_prefix: cnicPrefixForDistrict(d.name),
      }));
      const per_province = PROVINCE_ORDER.map((prov) => ({
        name: prov, districts: list.filter((d) => d.province === prov).length,
      }));
      return sendJson(res, 200, { total: list.length, per_province, districts: list, helpline: HELPLINE });
    }

    // ---- auth ----
    if (p === '/api/auth/me' && req.method === 'GET') {
      const u = sessionUser(req);
      if (!u) return sendJson(res, 200, { logged_in: false });
      return sendJson(res, 200, { logged_in: true, user: publicUser(u) });
    }
    if (p === '/api/auth/signup' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'body required' });
      const ip = clientIp(req);
      const gmail = String(body.gmail || '').trim().toLowerCase();
      const password = String(body.password || '');
      const phone = String(body.phone || '').trim().slice(0, 20);
      const cnic = normalizeCnic(body.cnic);
      const districtName = String(body.district || '').trim();
      const provinceName = String(body.province || '').trim();
      if (!validGmail(gmail)) return sendJson(res, 400, { error: 'a valid Gmail address is required' });
      if (password.length < 8) return sendJson(res, 400, { error: 'password must be at least 8 characters' });
      if (phone && !/^[0-9+][0-9 ()-]{9,18}$/.test(phone)) return sendJson(res, 400, { error: 'phone number looks invalid' });
      if (cnic.length !== 13) return sendJson(res, 400, { error: 'CNIC must be 13 digits (e.g. 17301-1234567-1)' });
      // Role is never chosen at signup: everyone signs up as a public
      // user (the INSERT below hardcodes 'user'). Admin accounts are
      // created by the master admin only.
      const drow = districtRow(districtName);
      if (!drow) return sendJson(res, 400, { error: 'district not found' });
      if (provinceName && provinceName.toLowerCase() !== drow.province.toLowerCase()) {
        return sendJson(res, 400, { error: 'province does not match the district' });
      }
      const prefix = cnicPrefixForDistrict(drow.name);
      if (!prefix) {
        return sendJson(res, 400, { error: 'CNIC check is not available for ' + drow.name + ' yet — its district prefix is still being verified. Please try another district or wait for verification.' });
      }
      // First 3 digits only: the 5-digit prefix also encodes tehsil +
      // registration office, so each district has many valid 5-digit
      // prefixes sharing the same first 3 digits (see lib/cnic.js).
      const code3 = cnic.slice(0, 3);
      if (code3 !== prefix) {
        return sendJson(res, 400, { error: 'CNIC district code does not match the selected district' });
      }
      const hash = cnicHash(cnic);
      const dup = db.prepare('SELECT id FROM users WHERE gmail = ? OR cnic_hash = ?').get(gmail, hash);
      if (dup) return sendJson(res, 400, { error: 'an account already exists for this Gmail or CNIC' });
      if (!signupAllowed(ip)) {
        return sendJson(res, 429, { error: 'too many accounts created from this connection — try again later' });
      }
      const row = db.prepare(`INSERT INTO users(gmail, password_hash, phone, cnic_hash, cnic_district_code, role, district)
        VALUES(?,?,?,?,?,'user',?)`).run(gmail, hashPassword(password), phone, hash, code3, drow.name);
      signupCounted(ip);
      const user = db.prepare('SELECT id, gmail, phone, role, district, grid_id, created_at FROM users WHERE id = ?').get(Number(row.lastInsertRowid));
      const cookie = setSessionCookie(res, user);
      return sendJson(res, 200, { ok: true, user: publicUser(user) }, { 'Set-Cookie': cookie });
    }
    if (p === '/api/auth/login' && req.method === 'POST') {
      const ip = clientIp(req);
      if (ipBlocked(ip)) return sendJson(res, 429, { error: 'too many failed attempts — try again later' });
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'body required' });
      const gmail = String(body.gmail || '').trim().toLowerCase();
      const password = String(body.password || '');
      const fail = () => { ipFail(ip); return sendJson(res, 401, { error: 'invalid Gmail or password' }); };
      const user = db.prepare('SELECT * FROM users WHERE gmail = ?').get(gmail);
      if (!user) return fail();
      const nowSec = Math.floor(Date.now() / 1000);
      if (user.locked_until && user.locked_until > nowSec) {
        return sendJson(res, 429, { error: 'account temporarily locked after too many failed attempts — try again later' });
      }
      if (!verifyPassword(password, user.password_hash)) {
        const attempts = (user.failed_attempts || 0) + 1;
        const lockedUntil = attempts >= MAX_FAILED_LOGINS ? nowSec + LOGIN_LOCK_SECONDS : 0;
        db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')
          .run(attempts, lockedUntil, user.id);
        return fail();
      }
      db.prepare('UPDATE users SET failed_attempts = 0, locked_until = 0 WHERE id = ?').run(user.id);
      ipReset(ip);
      const cookie = setSessionCookie(res, user);
      return sendJson(res, 200, { ok: true, user: publicUser(user) }, { 'Set-Cookie': cookie });
    }
    if (p === '/api/auth/logout' && req.method === 'POST') {
      const cookie = clearSessionCookie(req, res);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie });
    }
    // ---- change password (any logged-in user/admin) ----
    // There is no "forgot password" email in this version (no mail
    // service): a user who forgets their password asks the master admin,
    // who resets it from the master console below.
    if (p === '/api/auth/change-password' && req.method === 'POST') {
      const u = sessionUser(req);
      if (!u) return sendJson(res, 401, { error: 'login required' });
      const body = await readBody(req);
      if (!body || typeof body.current !== 'string' || typeof body.next !== 'string') {
        return sendJson(res, 400, { error: 'current and next password required' });
      }
      const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(u.id);
      if (!row || !verifyPassword(body.current, row.password_hash)) {
        return sendJson(res, 401, { error: 'current password is wrong' });
      }
      if (body.next.length < 8) return sendJson(res, 400, { error: 'new password must be at least 8 characters' });
      if (body.next === body.current) return sendJson(res, 400, { error: 'new password must be different from the current one' });
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.next), u.id);
      // A password is usually changed because the old one is no longer
      // trusted — so every other session dies with it (the master reset
      // already did this; change-password did not, leaving a stolen
      // session valid for up to 24h). This browser stays logged in: it
      // gets a fresh session cookie in the response.
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      const cookie = setSessionCookie(res, u);
      audit('password.change', u, u.grid_id || null, u.district, 'password changed');
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie });
    }

    // ---- logged-in public user: own district only ----
    if (p === '/api/my/grids' && req.method === 'GET') {
      const u = sessionUser(req);
      if (!u) return sendJson(res, 401, { error: 'login required' });
      if (u.role !== 'user') return sendJson(res, 403, { error: 'admins use the admin portal' });
      // A grid is listed only once the admin has published a schedule for it.
      const list = gridsIn(u.district).filter((g) => gridHasSchedule(g.id))
        .map((g) => ({ id: g.id, district: g.district, name: g.name, is_example: g.is_example }));
      return sendJson(res, 200, { district: u.district, grids: list });
    }
    const gridMatch = p.match(/^\/api\/my\/grid\/(\d+)\/(schedule|messages)$/);
    if (gridMatch && req.method === 'GET') {
      const u = sessionUser(req);
      if (!u) return sendJson(res, 401, { error: 'login required' });
      if (u.role !== 'user') return sendJson(res, 403, { error: 'admins use the admin portal' });
      const grid = gridById(gridMatch[1]);
      if (!grid) return sendJson(res, 404, { error: 'grid not found' });
      if (grid.district.toLowerCase() !== u.district.toLowerCase()) {
        return sendJson(res, 403, { error: 'this grid belongs to another district' });
      }
      if (gridMatch[2] === 'schedule') {
        return sendJson(res, 200, { grid: { id: grid.id, district: grid.district, name: grid.name },
          schedule: scheduleForGrid(grid.id).map((s) => ({ weekday: s.weekday, day: WEEKDAYS[s.weekday], windows: s.windows, note: s.note, updated_at: s.updated_at })) });
      }
      return sendJson(res, 200, { grid: { id: grid.id, district: grid.district, name: grid.name },
        // The dashboard needs to know which messages are the reader's own
        // (so it can offer Delete on those only). The author's identity is
        // never exposed — only a boolean, computed server-side.
        messages: messagesForGrid(grid.id, 50).map((m) => ({ id: m.id, status: m.status, note: m.note, created_at: m.created_at, own: m.user_id === u.id })) });
    }
    const msgMatch = p.match(/^\/api\/my\/grid\/(\d+)\/message$/);
    if (msgMatch && req.method === 'POST') {
      const u = sessionUser(req);
      if (!u) return sendJson(res, 401, { error: 'login required' });
      if (u.role !== 'user') return sendJson(res, 403, { error: 'admins use the admin portal' });
      const body = await readBody(req);
      if (!body || !['on', 'off'].includes(body.status)) {
        return sendJson(res, 400, { error: 'status must be on or off' });
      }
      const grid = gridById(msgMatch[1]);
      if (!grid) return sendJson(res, 404, { error: 'grid not found' });
      if (grid.district.toLowerCase() !== u.district.toLowerCase()) {
        return sendJson(res, 403, { error: 'this grid belongs to another district' });
      }
      const row = db.prepare(`INSERT INTO grid_messages(grid_id, user_id, status, note) VALUES(?,?,?,?)`)
        .run(grid.id, u.id, body.status, String(body.note || '').slice(0, 200));
      return sendJson(res, 200, { ok: true, id: Number(row.lastInsertRowid) });
    }
    if (p === '/api/my/message/delete' && req.method === 'POST') {
      const u = sessionUser(req);
      if (!u) return sendJson(res, 401, { error: 'login required' });
      const body = await readBody(req);
      if (!body || body.id === undefined) return sendJson(res, 400, { error: 'id required' });
      const msg = db.prepare('SELECT id, grid_id, user_id FROM grid_messages WHERE id = ?').get(Number(body.id));
      if (!msg) return sendJson(res, 404, { error: 'message not found' });
      if (msg.user_id !== u.id) return sendJson(res, 403, { error: 'you can delete only your own messages' });
      db.prepare('DELETE FROM grid_messages WHERE id = ?').run(msg.id);
      return sendJson(res, 200, { ok: true });
    }

    // ---- admin portal (role=admin, one district + one grid) ----
    if (p === '/api/admin/my-grid' && req.method === 'GET') {
      const u = sessionUser(req);
      if (!u) return sendJson(res, 401, { error: 'login required' });
      if (u.role !== 'admin' || !u.grid_id) return sendJson(res, 403, { error: 'admin account required' });
      const grid = gridById(u.grid_id);
      if (!grid) return sendJson(res, 404, { error: 'assigned grid not found' });
      return sendJson(res, 200, { grid: { id: grid.id, district: grid.district, name: grid.name },
        schedule: scheduleForGrid(grid.id),
        messages: db.prepare(`SELECT m.id id, m.status status, m.note note, m.created_at created_at,
          'User ' || m.user_id reporter FROM grid_messages m
          WHERE m.grid_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 50`).all(grid.id) });
    }
    if (p === '/api/admin/schedule' && req.method === 'POST') {
      const u = sessionUser(req);
      if (!u) return sendJson(res, 401, { error: 'login required' });
      if (u.role !== 'admin' || !u.grid_id) return sendJson(res, 403, { error: 'admin account required' });
      if (rateLimited('admin-schedule:' + clientIp(req), ADMIN_SCHEDULE_LIMIT, RATE_WINDOW_MS)) {
        return sendJson(res, 429, { error: 'too many schedule writes — try again later' });
      }
      const body = await readBody(req);
      if (!body || body.grid_id === undefined || body.weekday === undefined || !body.windows) {
        return sendJson(res, 400, { error: 'grid_id, weekday and windows required' });
      }
      if (Number(body.grid_id) !== u.grid_id) {
        return sendJson(res, 403, { error: 'you can publish schedules only for your own grid' });
      }
      const weekday = Number(body.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return sendJson(res, 400, { error: 'weekday must be 0–6 (Sunday=0)' });
      if (!validWindows(body.windows)) return sendJson(res, 400, { error: 'windows must be non-overlapping HH:MM start/end pairs, start before end' });
      const grid = gridById(u.grid_id);
      db.prepare(`INSERT INTO grid_schedules(grid_id, weekday, windows, note, published_by, updated_at)
        VALUES(?,?,?,?,?,datetime('now'))
        ON CONFLICT(grid_id, weekday) DO UPDATE SET windows=excluded.windows, note=excluded.note,
        published_by=excluded.published_by, updated_at=datetime('now')`)
        .run(grid.id, weekday, JSON.stringify(body.windows), String(body.note || '').slice(0, 300), u.id);
      audit('schedule.publish', u, grid.id, grid.district, WEEKDAYS[weekday] + ' ' + JSON.stringify(body.windows));
      return sendJson(res, 200, { ok: true, grid: { id: grid.id, district: grid.district, name: grid.name } });
    }
    if (p === '/api/admin/schedule/delete' && req.method === 'POST') {
      const u = sessionUser(req);
      if (!u) return sendJson(res, 401, { error: 'login required' });
      if (u.role !== 'admin' || !u.grid_id) return sendJson(res, 403, { error: 'admin account required' });
      if (rateLimited('admin-schedule:' + clientIp(req), ADMIN_SCHEDULE_LIMIT, RATE_WINDOW_MS)) {
        return sendJson(res, 429, { error: 'too many schedule writes — try again later' });
      }
      const body = await readBody(req);
      if (!body || body.grid_id === undefined || body.weekday === undefined) {
        return sendJson(res, 400, { error: 'grid_id and weekday required' });
      }
      if (Number(body.grid_id) !== u.grid_id) {
        return sendJson(res, 403, { error: 'you can delete schedules only for your own grid' });
      }
      const grid = gridById(u.grid_id);
      db.prepare('DELETE FROM grid_schedules WHERE grid_id = ? AND weekday = ?').run(grid.id, Number(body.weekday));
      audit('schedule.delete', u, grid.id, grid.district, WEEKDAYS[Number(body.weekday)]);
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/admin/message/delete' && req.method === 'POST') {
      const u = sessionUser(req);
      if (!u) return sendJson(res, 401, { error: 'login required' });
      if (u.role !== 'admin' || !u.grid_id) return sendJson(res, 403, { error: 'admin account required' });
      const body = await readBody(req);
      if (!body || body.id === undefined) return sendJson(res, 400, { error: 'id required' });
      const msg = db.prepare('SELECT id, grid_id FROM grid_messages WHERE id = ?').get(Number(body.id));
      if (!msg) return sendJson(res, 404, { error: 'message not found' });
      if (msg.grid_id !== u.grid_id) return sendJson(res, 403, { error: 'this message belongs to another grid' });
      db.prepare('DELETE FROM grid_messages WHERE id = ?').run(msg.id);
      const grid = gridById(u.grid_id);
      audit('message.delete', u, grid.id, grid.district, 'message ' + msg.id);
      return sendJson(res, 200, { ok: true });
    }

    // ---- master (ADMIN_CODE only): grids + admin accounts + audit ----
    // The master code is NEVER accepted in a URL query string (it would
    // land in browser history and server logs). POST bodies carry it in
    // `code`; GET endpoints read the X-Master-Code header instead.
    const masterOk = (body) => body && body.code === ADMIN_CODE;
    const masterHeaderOk = (req) => req.headers['x-master-code'] === ADMIN_CODE;
    if (p === '/api/master/grid' && req.method === 'POST') {
      const body = await readBody(req);
      if (!masterOk(body)) return sendJson(res, 403, { error: 'bad admin code' });
      if (!body.district || !body.name) return sendJson(res, 400, { error: 'district and name required' });
      const drow = districtRow(String(body.district));
      if (!drow) return sendJson(res, 400, { error: 'district not found' });
      const name = String(body.name).trim().slice(0, 120);
      if (!name) return sendJson(res, 400, { error: 'name must not be empty' });
      const row = db.prepare('INSERT OR IGNORE INTO grids(district, name) VALUES(?,?)').run(drow.name, name);
      const grid = db.prepare('SELECT id, district, name FROM grids WHERE district = ? AND name = ?').get(drow.name, name);
      // INSERT OR IGNORE silently does nothing for a grid that already
      // exists — log the audit entry only when one was actually created,
      // or the log claims creates that never happened.
      if (Number(row.changes) === 1) audit('grid.create', null, grid.id, drow.name, name);
      return sendJson(res, 200, { ok: true, id: grid.id, created: Number(row.changes) === 1 });
    }
    if (p === '/api/master/grid/remove' && req.method === 'POST') {
      const body = await readBody(req);
      if (!masterOk(body)) return sendJson(res, 403, { error: 'bad admin code' });
      if (body.grid_id === undefined) return sendJson(res, 400, { error: 'grid_id required' });
      const grid = gridById(body.grid_id);
      if (!grid) return sendJson(res, 404, { error: 'grid not found' });
      db.prepare('DELETE FROM grid_schedules WHERE grid_id = ?').run(grid.id);
      db.prepare('DELETE FROM grid_messages WHERE grid_id = ?').run(grid.id);
      db.prepare('UPDATE users SET grid_id = NULL WHERE grid_id = ?').run(grid.id);
      db.prepare('DELETE FROM grids WHERE id = ?').run(grid.id);
      audit('grid.remove', null, grid.id, grid.district, grid.name);
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/master/grids' && req.method === 'GET') {
      if (!masterHeaderOk(req)) return sendJson(res, 403, { error: 'bad admin code' });
      return sendJson(res, 200, { grids: db.prepare('SELECT id, district, name, is_example FROM grids ORDER BY district, name').all() });
    }
    if (p === '/api/master/admin' && req.method === 'POST') {
      const body = await readBody(req);
      if (!masterOk(body)) return sendJson(res, 403, { error: 'bad admin code' });
      const gmail = String(body.gmail || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!validGmail(gmail)) return sendJson(res, 400, { error: 'a valid Gmail address is required' });
      if (password.length < 8) return sendJson(res, 400, { error: 'password must be at least 8 characters' });
      const grid = gridById(body.grid_id);
      if (!grid) return sendJson(res, 400, { error: 'grid not found — create the grid first' });
      if (body.district && String(body.district).toLowerCase() !== grid.district.toLowerCase()) {
        return sendJson(res, 400, { error: 'district does not match the grid' });
      }
      const dup = db.prepare('SELECT id FROM users WHERE gmail = ?').get(gmail);
      if (dup) return sendJson(res, 400, { error: 'an account already exists for this Gmail' });
      // Admin accounts carry no CNIC of their own here: the master assigns
      // them after checking the person's government identity off-system.
      // cnic_hash is a marker (never a real CNIC) so the UNIQUE constraint
      // and the one-account-per-person rule still hold per Gmail.
      const marker = cnicHash('admin:' + gmail);
      const row = db.prepare(`INSERT INTO users(gmail, password_hash, phone, cnic_hash, cnic_district_code, role, district, grid_id)
        VALUES(?,?,?,?,'','admin',?,?)`).run(gmail, hashPassword(password), '', marker, grid.district, grid.id);
      audit('admin.create', null, grid.id, grid.district, gmail);
      return sendJson(res, 200, { ok: true, id: Number(row.lastInsertRowid), district: grid.district, grid_id: grid.id });
    }
    if (p === '/api/master/admin/remove' && req.method === 'POST') {
      const body = await readBody(req);
      if (!masterOk(body)) return sendJson(res, 403, { error: 'bad admin code' });
      if (!body.gmail) return sendJson(res, 400, { error: 'gmail required' });
      const target = db.prepare("SELECT id, district, grid_id FROM users WHERE gmail = ? AND role = 'admin'").get(String(body.gmail).trim().toLowerCase());
      if (!target) return sendJson(res, 404, { error: 'admin account not found' });
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
      audit('admin.remove', null, target.grid_id, target.district, String(body.gmail).trim().toLowerCase());
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/master/admins' && req.method === 'GET') {
      if (!masterHeaderOk(req)) return sendJson(res, 403, { error: 'bad admin code' });
      const rows = db.prepare(`SELECT u.id id, u.gmail gmail, u.district district, u.grid_id grid_id,
        g.name grid_name, u.created_at created_at FROM users u LEFT JOIN grids g ON g.id = u.grid_id
        WHERE u.role = 'admin' ORDER BY u.district, u.gmail`).all();
      return sendJson(res, 200, { admins: rows });
    }
    if (p === '/api/master/users' && req.method === 'GET') {
      if (!masterHeaderOk(req)) return sendJson(res, 403, { error: 'bad admin code' });
      const rows = db.prepare(`SELECT id, gmail, phone, role, district, grid_id, created_at
        FROM users ORDER BY created_at DESC, id DESC LIMIT 200`).all();
      return sendJson(res, 200, { users: rows });
    }
    if (p === '/api/master/user/reset-password' && req.method === 'POST') {
      // Counted before the code check: the whole point is to slow a
      // brute-force of the master code. A wrong code still burns one of
      // the 20 hourly attempts from that IP.
      if (rateLimited('master-reset:' + clientIp(req), MASTER_RESET_LIMIT, RATE_WINDOW_MS)) {
        return sendJson(res, 429, { error: 'too many password resets — try again later' });
      }
      const body = await readBody(req);
      if (!masterOk(body)) return sendJson(res, 403, { error: 'bad admin code' });
      const gmail = String(body.gmail || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!validGmail(gmail)) return sendJson(res, 400, { error: 'a valid Gmail address is required' });
      if (password.length < 8) return sendJson(res, 400, { error: 'new password must be at least 8 characters' });
      const target = db.prepare('SELECT id, district, grid_id FROM users WHERE gmail = ?').get(gmail);
      if (!target) return sendJson(res, 404, { error: 'account not found' });
      db.prepare('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = 0 WHERE id = ?')
        .run(hashPassword(password), target.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
      audit('password.reset', null, target.grid_id, target.district, gmail + ' (password reset by master; all sessions ended)');
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/master/audit' && req.method === 'GET') {
      if (!masterHeaderOk(req)) return sendJson(res, 403, { error: 'bad admin code' });
      const rows = db.prepare(`SELECT id, actor_gmail, action, grid_id, district, detail, created_at
        FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 100`).all();
      return sendJson(res, 200, { rows });
    }

    // ---- favicon (inline SVG lightning bolt, so browsers stop 404ing) ----
    if (p === '/favicon.ico' && req.method === 'GET') {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚡</text></svg>';
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' });
      return res.end(svg);
    }
    // ---- district pages (server-rendered; never embed schedule data) ----
    if (p === '/districts' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(districtsIndexHtml());
    }
    if (p === '/sitemap.xml' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      return res.end(sitemapXml(req.headers.host || '127.0.0.1:3031'));
    }
    if (p.startsWith('/district/') && req.method === 'GET') {
      const slug = decodeURIComponent(p.slice('/district/'.length)).split('/')[0];
      // Karachi is not one district in the list — it is 7 districts
      // (Central, East, South, West, Keamari, Korangi, Malir). A person
      // typing "Karachi" gets a helpful page, not a dead end.
      if (citySlug(slug) === 'karachi') {
        const khi = districts().filter((d) => d.name.startsWith('Karachi') || ['Keamari', 'Korangi', 'Malir'].includes(d.name));
        const links = khi.map((d) => '<li><a href="/district/' + citySlug(d.name) + '">' + escHtml(d.name) + '</a>'
          + ' — DISCO: ' + escHtml(discoForDistrict(d.name, d.province) || 'K-Electric') + '</li>').join('');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(pageShell('Load-shedding schedule in Karachi — Bijli Map',
          'Karachi is 7 districts. Pick yours to see its grid stations and load-shedding schedule.',
          '<section class="hero"><h1>Load-shedding schedule — Karachi</h1>'
          + '<p>Karachi is not one district — it is 7 districts, each with its own page and its own K-Electric grid stations. Pick yours:</p>'
          + '<ul>' + links + '</ul>'
          + '<p class="note">Schedules are shown only after login, and only to people from that district. For an official complaint call the national electricity helpline <strong>118</strong>.</p>'
          + '<p><a href="/districts">All districts</a> · <a href="/">Home</a></p></section>'));
      }
      const district = findDistrictBySlug(citySlug(slug));
      if (!district) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(pageShell('District not found — Bijli Map',
          'No Bijli Map page exists for this district.',
          '<section class="hero"><h1>District not found</h1><p>This is not one of the 168 districts. '
          + 'See <a href="/districts">all districts</a>.</p></section>'));
      }
      const viewer = sessionUser(req);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(districtPageHtml(district, viewer));
    }
    if (req.method === 'GET') return serveStatic(req, res);
    res.writeHead(405); res.end('Method not allowed');
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Bijli Map v2.0 running on http://0.0.0.0:${PORT} (DB: ${DB_FILE})`);
});
