// Bijli Map v2.0 — verification tests (fresh DB, live HTTP).
// Run: node test.js — exits non-zero on any failure.
// CNIC codes below MUST be the verified ones from
// ~/workspace/new-projects/cnic-district-codes.md — never guess them.
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// ---- verified CNIC test accounts (fill from the research table) ----
const PESHAWAR_CNIC = '1730112345671'; // Peshawar — VERIFY before running
const NOWSHERA_CNIC = '1720112345671'; // Nowshera — VERIFY before running
const LAHORE_CNIC = '3520212345671';   // Lahore — VERIFY before running
// A real district whose CNIC code is UNVERIFIED (fail-closed test):
const UNVERIFIED_DISTRICT = 'Darel';   // Gilgit-Baltistan — VERIFY it is unverified
const UNVERIFIED_CNIC = '1234512345671';

const PORT = 3041;
const DB = '/tmp/bijli-v2-test.sqlite';
for (const f of [DB, DB + '-shm', DB + '-wal']) { try { fs.unlinkSync(f); } catch {} }
const BASE = `http://127.0.0.1:${PORT}`;
const CODE = process.env.TEST_ADMIN_CODE || 'test-admin-code'; // test-only master code, never a real one
const SECRET = 'test-secret-v2';
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS: ' + name);
  else { failures++; console.log('FAIL: ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); }
}
// Minimal cookie jar: fetch does not persist cookies on its own.
async function req(p, opts, jar) {
  const headers = { ...(opts && opts.headers ? opts.headers : {}) };
  if (jar && jar.cookie) headers.Cookie = jar.cookie;
  const r = await fetch(BASE + p, { ...(opts || {}), headers });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie && jar) {
    const m = setCookie.match(/bijli_session=[^;]*/);
    if (m) jar.cookie = m[0];
    else if (/bijli_session=;/.test(setCookie)) jar.cookie = '';
  }
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, ok: r.ok, json, text };
}
const post = (p, body, jar) => req(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, jar);
async function waitReady() {
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/api/meta'); return true; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  return false;
}
function hmacHex(data) { return crypto.createHmac('sha256', SECRET).update(data).digest('hex'); }

(async () => {
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DB_FILE: DB, ADMIN_CODE: CODE, SESSION_SECRET: SECRET, LOGIN_LOCK_SECONDS: '3', SESSION_TTL_SECONDS: '86400' },
    stdio: 'pipe',
  });
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  try {
    check('server starts', await waitReady(), serverLog.slice(-500));
    // Startup health: the v1.2 deploy failed with "container started but
    // isn't responding on its port" — the server must bind all interfaces
    // (0.0.0.0), not localhost-only, and answer /health fast.
    const health = await req('/health');
    check('GET /health returns ok (platform health check)', health.status === 200 && health.json && health.json.ok === true, health.json);
    {
      // The v1.2 deploy failed with "container started but isn't responding
      // on its port": the server must listen on 0.0.0.0, not localhost-only.
      // Verifying via /proc/net/tcp (this sandbox's own LAN IP is not
      // routable back to itself, so an HTTP fetch to it proves nothing).
      let boundExternal = null;
      try {
        const portHex = PORT.toString(16).toUpperCase().padStart(4, '0');
        const lines = fs.readFileSync('/proc/net/tcp', 'utf8').split('\n').slice(1);
        for (const ln of lines) {
          const parts = ln.trim().split(/\s+/);
          if (parts.length < 4) continue;
          const [ipHex, pHex] = parts[1].split(':');
          if (pHex === portHex && parts[3] === '0A') { boundExternal = (ipHex === '00000000'); break; }
        }
      } catch { boundExternal = null; }
      if (boundExternal === null) console.log('SKIP: /proc/net/tcp unavailable — cannot verify the listen address');
      else check('server listens on 0.0.0.0 (reachable from outside the container)', boundExternal === true, boundExternal);
    }
    const meta = (await req('/api/meta')).json;
    check('meta has 11 discos incl LESCO + K-Electric',
      meta.discos.length === 11 && meta.discos.some((d) => d.name === 'LESCO') && meta.discos.some((d) => d.name === 'K-Electric'), meta.discos.map((d) => d.name));
    check('meta helpline is 118 and 168 districts', meta.helpline === '118' && meta.districts_total === 168, meta);
    check('meta carries login-required notice', /logged-in/i.test(meta.notice || ''), meta.notice);

    const discos = (await req('/api/discos')).json;
    check('discos endpoint: 11 discos, all helpline 118',
      discos.discos.length === 11 && discos.discos.every((d) => d.helpline === '118'), discos.discos.length);

    // Removed v1 endpoints are gone.
    const boardGone = await req('/api/board');
    check('open board endpoint is gone (404)', boardGone.status === 404, boardGone.status);
    const repGone = await post('/api/report', { city: 'X', area: 'Y', status: 'out' });
    check('open report endpoint is gone (405)', repGone.status === 405, repGone.status);
    const estGone = await post('/api/estimate', { battery_ah: 100, voltage: 12, load_watts: 200 });
    check('estimator endpoint is gone (405)', estGone.status === 405, estGone.status);

    // ---- district pages: logged out sees names + login prompt, never schedules ----
    const lp = await req('/district/lahore');
    check('district page Lahore logged out: 200, login prompt, no schedule windows',
      lp.status === 200 && lp.text.includes('Login required') && !lp.text.includes('08:00') && lp.text.includes('LESCO'), lp.status);
    const nw = await req('/district/nowshera');
    check('district page Nowshera logged out: 200, login prompt, DISCO PESCO',
      nw.status === 200 && nw.text.includes('Login required') && nw.text.includes('DISCO for this district: <strong>PESCO</strong>'), nw.status);
    const mu = await req('/district/multan');
    check('district page Multan: 200, no DISCO guess (helpline 118 only)',
      mu.status === 200 && mu.text.includes('No single DISCO is listed for this district') && mu.text.includes('118')
      && !mu.text.includes('DISCO for this district:'), mu.status);
    const gb = await req('/district/gilgit');
    check('district page Gilgit (GB): 200, no DISCO guess',
      gb.status === 200 && gb.text.includes('No single DISCO is listed for this district'), gb.status);
    const khi = await req('/district/karachi');
    check('district page Karachi is a helpful page listing the 7 Karachi districts (not a dead-end 404)',
      khi.status === 200 && khi.text.includes('Karachi is not one district') && khi.text.includes('Karachi East') && khi.text.includes('Korangi'), khi.status);
    const unk = await req('/district/nowherecity');
    check('unknown district page is 404', unk.status === 404, unk.status);
    const lpCase = await req('/district/LAHORE');
    check('district page slug is case-insensitive', lpCase.status === 200, lpCase.status);

    const di = await req('/districts');
    const apiD = (await req('/api/districts')).json;
    const expectedCounts = { Punjab: 41, 'Khyber Pakhtunkhwa': 36, Sindh: 30, Balochistan: 36, 'Islamabad Capital Territory': 1, 'Gilgit-Baltistan': 14, 'Azad Jammu and Kashmir': 10 };
    const gotCounts = Object.fromEntries(apiD.per_province.map((g) => [g.name, g.districts]));
    check('api/districts: 168 districts with counts 41/36/30/36/1/14/10 (fake districts Bari Swat + Paharpur removed)',
      apiD.total === 168 && JSON.stringify(gotCounts) === JSON.stringify(expectedCounts), gotCounts);
    check('api/districts: no Bari Swat or Paharpur in the list',
      !apiD.districts.some((d) => d.name === 'Bari Swat' || d.name === 'Paharpur'), apiD.districts.length);
    check('api/districts: cnic_verified flag — Peshawar true, Gilgit false',
      apiD.districts.find((d) => d.name === 'Peshawar').cnic_verified === true
      && apiD.districts.find((d) => d.name === 'Gilgit').cnic_verified === false, null);
    const districtSlugs = apiD.districts.map((d) => d.slug);
    check('api/districts: 168 unique slugs', new Set(districtSlugs).size === 168, districtSlugs.length);
    const indexSlugs = new Set([...di.text.matchAll(/href="\/district\/([^"]+)"/g)].map((m) => m[1]));
    check('districts index links all 168 district pages, grouped by province',
      di.status === 200 && districtSlugs.every((s) => indexSlugs.has(s)) && di.text.includes('Punjab (41 districts)')
      && di.text.includes('Khyber Pakhtunkhwa (36 districts)'), indexSlugs.size);
    const sm = await req('/sitemap.xml');
    check('sitemap lists all 168 district URLs',
      sm.status === 200 && districtSlugs.every((s) => sm.text.includes('/district/' + s)), sm.text.length);
    const gilgitPage = await req('/district/gilgit');
    check('district page for unverified district says signups are not open yet',
      gilgitPage.status === 200 && /not open yet/i.test(gilgitPage.text), gilgitPage.status);
    const fav = await req('/favicon.ico');
    check('favicon serves 200 (SVG)', fav.status === 200 && fav.text.includes('<svg'), fav.status);
    const robots = await req('/robots.txt');
    check('robots.txt serves 200 with sitemap line', robots.status === 200 && robots.text.includes('Sitemap:'), robots.status);

    // ---- auth: signup validation ----
    const wrongCode = await post('/api/auth/signup', { gmail: 'wrongcode@gmail.com', password: 'password123', cnic: PESHAWAR_CNIC, province: 'Punjab', district: 'Lahore' });
    check('signup rejects CNIC code that does not match the district', wrongCode.status === 400 && /does not match/.test(wrongCode.json.error || ''), wrongCode.json);
    const badFormat = await post('/api/auth/signup', { gmail: 'badformat@gmail.com', password: 'password123', cnic: '17301123456', district: 'Peshawar' });
    check('signup rejects malformed CNIC (not 13 digits)', badFormat.status === 400, badFormat.json);
    const unver = await post('/api/auth/signup', { gmail: 'unver@gmail.com', password: 'password123', cnic: UNVERIFIED_CNIC, district: UNVERIFIED_DISTRICT });
    check('signup for district with unverified CNIC code fails closed', unver.status === 400 && /not available/.test(unver.json.error || ''), unver.json);
    const shortPass = await post('/api/auth/signup', { gmail: 'shortpass@gmail.com', password: 'short', cnic: PESHAWAR_CNIC, district: 'Peshawar' });
    check('signup rejects short password', shortPass.status === 400, shortPass.json);
    const badGmail = await post('/api/auth/signup', { gmail: 'not-an-email', password: 'password123', cnic: PESHAWAR_CNIC, district: 'Peshawar' });
    check('signup rejects invalid Gmail', badGmail.status === 400, badGmail.json);

    // Role can never be chosen at signup.
    const escJar = { cookie: '' };
    const escAttempt = await post('/api/auth/signup', { gmail: 'escalate@gmail.com', password: 'password123', cnic: '1730198765432', district: 'Peshawar', role: 'admin' }, escJar);
    check('signup with role=admin still creates a public user', escAttempt.status === 200 && escAttempt.json.user.role === 'user', escAttempt.json);
    const escMe = (await req('/api/auth/me', {}, escJar)).json;
    check('escalation account really is role user', escMe.user && escMe.user.role === 'user', escMe);

    // Happy-path signups: one Peshawar user, one Lahore user.
    const jar1 = { cookie: '' };
    const su1 = await post('/api/auth/signup', { gmail: 'peshawar.user@gmail.com', password: 'password123', cnic: PESHAWAR_CNIC, province: 'Khyber Pakhtunkhwa', district: 'Peshawar' }, jar1);
    check('signup Peshawar user with matching CNIC works', su1.status === 200 && su1.json.user.district === 'Peshawar' && !!jar1.cookie, su1.json);
    const jar2 = { cookie: '' };
    const su2 = await post('/api/auth/signup', { gmail: 'lahore.user@gmail.com', password: 'password123', cnic: LAHORE_CNIC, province: 'Punjab', district: 'Lahore' }, jar2);
    check('signup Lahore user with matching CNIC works', su2.status === 200 && su2.json.user.district === 'Lahore', su2.json);
    const dupGmail = await post('/api/auth/signup', { gmail: 'peshawar.user@gmail.com', password: 'password123', cnic: NOWSHERA_CNIC, district: 'Nowshera' });
    check('signup rejects duplicate Gmail', dupGmail.status === 400, dupGmail.json);
    const dupCnic = await post('/api/auth/signup', { gmail: 'other.person@gmail.com', password: 'password123', cnic: PESHAWAR_CNIC, district: 'Peshawar' });
    check('signup rejects duplicate CNIC', dupCnic.status === 400, dupCnic.json);

    // Passwords hashed, full CNIC never stored.
    {
      const tdb = new DatabaseSync(DB, { readOnly: true });
      const row = tdb.prepare('SELECT password_hash, cnic_hash, cnic_district_code FROM users WHERE gmail = ?').get('peshawar.user@gmail.com');
      const dump = JSON.stringify(tdb.prepare('SELECT * FROM users').all());
      tdb.close();
      check('password stored as scrypt hash, never plaintext',
        row.password_hash.startsWith('scrypt$') && !dump.includes('password123'), row.password_hash.slice(0, 20));
      check('full CNIC never stored; only its hash + 3-digit district prefix',
        /^[0-9a-f]{64}$/.test(row.cnic_hash) && row.cnic_district_code === PESHAWAR_CNIC.slice(0, 3)
        && !dump.includes(PESHAWAR_CNIC) && !dump.includes('17301-1234567-1'), row.cnic_district_code);
    }

    // ---- login: lockout first (it uses the per-IP limiter, so it runs
    // before any other failed logins from this IP) ----
    // Fresh account for the lockout test (5 fails -> locked).
    const lockJar = { cookie: '' };
    await post('/api/auth/signup', { gmail: 'lock.test@gmail.com', password: 'password123', cnic: NOWSHERA_CNIC, district: 'Nowshera' }, lockJar);
    for (let i = 0; i < 5; i++) await post('/api/auth/login', { gmail: 'lock.test@gmail.com', password: 'wrongpassword' });
    {
      const tdb = new DatabaseSync(DB, { readOnly: true });
      const row = tdb.prepare('SELECT failed_attempts, locked_until FROM users WHERE gmail = ?').get('lock.test@gmail.com');
      tdb.close();
      check('account lock is recorded in the DB (5 fails, locked_until in future)',
        row && row.failed_attempts === 5 && row.locked_until > Math.floor(Date.now() / 1000), row);
    }
    const locked = await post('/api/auth/login', { gmail: 'lock.test@gmail.com', password: 'password123' });
    check('5 failed logins lock the account (correct password still 429)', locked.status === 429, locked.json);
    await new Promise((r) => setTimeout(r, 3500));
    const afterLock = await post('/api/auth/login', { gmail: 'lock.test@gmail.com', password: 'password123' }, lockJar);
    check('account unlocks after the lock window', afterLock.status === 200, afterLock.json);

    // ---- login: generic errors ----
    const badLogin = await post('/api/auth/login', { gmail: 'peshawar.user@gmail.com', password: 'wrongpassword' });
    check('login with wrong password: 401 generic error', badLogin.status === 401 && badLogin.json.error === 'invalid Gmail or password', badLogin.json);
    const noUser = await post('/api/auth/login', { gmail: 'nobody@gmail.com', password: 'whatever123' });
    check('login with unknown Gmail: same generic 401 (no enumeration)', noUser.status === 401 && noUser.json.error === 'invalid Gmail or password', noUser.json);

    // Session expiry: craft an expired session row + signed cookie.
    {
      const token = 'expired-test-token-0001';
      const tdb = new DatabaseSync(DB);
      const user = tdb.prepare("SELECT id FROM users WHERE gmail = 'peshawar.user@gmail.com'").get();
      const past = Math.floor(Date.now() / 1000) - 60;
      tdb.prepare('INSERT INTO sessions(user_id, token_hash, expires_at) VALUES(?,?,?)').run(user.id, hmacHex(token), past);
      tdb.close();
      const jar = { cookie: 'bijli_session=' + token + '.' + hmacHex(token) };
      const me = (await req('/api/auth/me', {}, jar)).json;
      check('expired session is rejected', me.logged_in === false, me);
    }
    // Tampered cookie is rejected.
    {
      const jar = { cookie: 'bijli_session=abc.definitely-not-a-valid-signature' };
      const me = (await req('/api/auth/me', {}, jar)).json;
      check('tampered session cookie is rejected', me.logged_in === false, me);
    }
    // Logout clears the session.
    {
      const jar = { cookie: '' };
      await post('/api/auth/login', { gmail: 'peshawar.user@gmail.com', password: 'password123' }, jar);
      const before = (await req('/api/auth/me', {}, jar)).json;
      await post('/api/auth/logout', {}, jar);
      const after = (await req('/api/auth/me', {}, jar)).json;
      check('logout ends the session', before.logged_in === true && after.logged_in === false, { before: before.logged_in, after: after.logged_in });
    }

    // ---- scoping: users see only their own district ----
    const anon = await req('/api/my/grids');
    check('logged-out user gets 401 on /api/my/grids', anon.status === 401, anon.status);
    const grids1 = (await req('/api/my/grids', {}, jar1)).json;
    check('Peshawar user lists only Peshawar grids with a published schedule',
      grids1.district === 'Peshawar' && grids1.grids.some((g) => g.name === 'University Road')
      && !grids1.grids.some((g) => g.name === 'Gulberg'), grids1.grids.map((g) => g.name));
    const grids2 = (await req('/api/my/grids', {}, jar2)).json;
    check('Lahore user lists only Lahore grids',
      grids2.district === 'Lahore' && grids2.grids.some((g) => g.name === 'Gulberg')
      && !grids2.grids.some((g) => g.name === 'University Road'), grids2.grids.map((g) => g.name));
    const peshGrid = grids1.grids.find((g) => g.name === 'University Road');
    const lhrGrid = grids2.grids.find((g) => g.name === 'Gulberg');
    const ownSch = await req('/api/my/grid/' + peshGrid.id + '/schedule', {}, jar1);
    check('user reads own grid schedule (seeded EXAMPLE Monday windows)',
      ownSch.status === 200 && ownSch.json.schedule.some((s) => s.weekday === 1 && s.windows[0].start === '08:00'), ownSch.json.schedule);
    const crossSch = await req('/api/my/grid/' + lhrGrid.id + '/schedule', {}, jar1);
    check('user reading another district schedule gets 403', crossSch.status === 403, crossSch.status);
    const crossMsg = await req('/api/my/grid/' + lhrGrid.id + '/messages', {}, jar1);
    check('user reading another district messages gets 403', crossMsg.status === 403, crossMsg.status);
    const crossPost = await post('/api/my/grid/' + lhrGrid.id + '/message', { status: 'off', note: 'cross post' }, jar1);
    check('user posting to another district grid gets 403', crossPost.status === 403, crossPost.json);
    const ownPost = await post('/api/my/grid/' + peshGrid.id + '/message', { status: 'off', note: 'light gayi 2 hours' }, jar1);
    check('user posts on/off message in own grid', ownPost.status === 200 && ownPost.json.id > 0, ownPost.json);
    const ownMsgs = (await req('/api/my/grid/' + peshGrid.id + '/messages', {}, jar1)).json;
    check('own grid messages show the post, with no other account data',
      ownMsgs.messages.some((m) => m.id === ownPost.json.id && m.status === 'off') && !JSON.stringify(ownMsgs).includes('peshawar.user@gmail.com'), ownMsgs.messages.length);
    const lhrMsgs = await req('/api/my/grid/' + lhrGrid.id + '/messages', {}, jar2);
    check('Lahore user messages do not contain the Peshawar post', lhrMsgs.status === 200 && !lhrMsgs.json.messages.some((m) => m.id === ownPost.json.id), lhrMsgs.json.messages.length);
    const badStatus = await post('/api/my/grid/' + peshGrid.id + '/message', { status: 'maybe' }, jar1);
    check('message rejects bad status', badStatus.status === 400, badStatus.json);
    // Own-message delete: own ok, another user's 403.
    const lhrPost = await post('/api/my/grid/' + lhrGrid.id + '/message', { status: 'on', note: 'light aa gayi' }, jar2);
    const delOther = await post('/api/my/message/delete', { id: lhrPost.json.id }, jar1);
    check('user cannot delete another user message (403)', delOther.status === 403, delOther.json);
    const delOwn = await post('/api/my/message/delete', { id: ownPost.json.id }, jar1);
    check('user deletes own message', delOwn.status === 200, delOwn.json);

    // Grids are listed only once a schedule is published.
    const masterGrid = await post('/api/master/grid', { code: 'wrong', district: 'Peshawar', name: 'NoSchedule Grid' });
    check('master grid creation rejects wrong code', masterGrid.status === 403, masterGrid.json);
    const newGrid = await post('/api/master/grid', { code: CODE, district: 'Peshawar', name: 'NoSchedule Grid' });
    check('master creates a grid in Peshawar', newGrid.status === 200 && newGrid.json.id > 0, newGrid.json);
    const grids1b = (await req('/api/my/grids', {}, jar1)).json;
    check('grid without a published schedule is NOT listed to users',
      !grids1b.grids.some((g) => g.name === 'NoSchedule Grid'), grids1b.grids.map((g) => g.name));

    // ---- admin: master-created, one grid only ----
    const adminJar = { cookie: '' };
    const badAdmin = await post('/api/master/admin', { code: 'wrong', gmail: 'gov.peshawar@gmail.com', password: 'adminpass123', grid_id: peshGrid.id });
    check('master admin creation rejects wrong code', badAdmin.status === 403, badAdmin.json);
    const mkAdmin = await post('/api/master/admin', { code: CODE, gmail: 'gov.peshawar@gmail.com', password: 'adminpass123', grid_id: peshGrid.id });
    check('master creates an admin for the Peshawar grid', mkAdmin.status === 200 && mkAdmin.json.district === 'Peshawar', mkAdmin.json);
    const adminLogin = await post('/api/auth/login', { gmail: 'gov.peshawar@gmail.com', password: 'adminpass123' }, adminJar);
    check('admin logs in with role admin', adminLogin.status === 200 && adminLogin.json.user.role === 'admin', adminLogin.json);
    const adminGrid = await req('/api/admin/my-grid', {}, adminJar);
    check('admin sees own grid + schedule', adminGrid.status === 200 && adminGrid.json.grid.name === 'University Road', adminGrid.json.grid);
    const adminAsUser = await req('/api/my/grids', {}, adminJar);
    check('admin cannot use public user endpoints (403)', adminAsUser.status === 403, adminAsUser.status);
    const pub = await post('/api/admin/schedule', { grid_id: peshGrid.id, weekday: 2, windows: [{ start: '09:00', end: '11:00' }], note: 'official' }, adminJar);
    check('admin publishes schedule for own grid', pub.status === 200, pub.json);
    const userSees = await req('/api/my/grid/' + peshGrid.id + '/schedule', {}, jar1);
    check('public user sees the admin-published Tuesday schedule',
      userSees.status === 200 && userSees.json.schedule.some((s) => s.weekday === 2 && s.windows[0].start === '09:00'), userSees.json.schedule);
    const pubOther = await post('/api/admin/schedule', { grid_id: lhrGrid.id, weekday: 2, windows: [{ start: '09:00', end: '11:00' }] }, adminJar);
    check('admin publishing another grid schedule gets 403', pubOther.status === 403, pubOther.json);
    const badWindows = await post('/api/admin/schedule', { grid_id: peshGrid.id, weekday: 3, windows: [{ start: '11:00', end: '09:00' }] }, adminJar);
    check('admin schedule rejects end-before-start windows', badWindows.status === 400, badWindows.json);
    const delOtherSch = await post('/api/admin/schedule/delete', { grid_id: lhrGrid.id, weekday: 1 }, adminJar);
    check('admin deleting another grid schedule gets 403', delOtherSch.status === 403, delOtherSch.json);
    const delOwnSch = await post('/api/admin/schedule/delete', { grid_id: peshGrid.id, weekday: 2 }, adminJar);
    check('admin deletes own grid schedule', delOwnSch.status === 200, delOwnSch.json);
    const afterDel = await req('/api/my/grid/' + peshGrid.id + '/schedule', {}, jar1);
    check('deleted weekday no longer in public schedule',
      afterDel.status === 200 && !afterDel.json.schedule.some((s) => s.weekday === 2), afterDel.json.schedule);
    // Admin message delete: own grid ok, other grid 403.
    const lhrMsg2 = await post('/api/my/grid/' + lhrGrid.id + '/message', { status: 'off', note: 'for admin test' }, jar2);
    const admDelOther = await post('/api/admin/message/delete', { id: lhrMsg2.json.id }, adminJar);
    check('admin deleting another grid message gets 403', admDelOther.status === 403, admDelOther.json);
    const ownMsg2 = await post('/api/my/grid/' + peshGrid.id + '/message', { status: 'on', note: 'admin delete test' }, jar1);
    const admDelOwn = await post('/api/admin/message/delete', { id: ownMsg2.json.id }, adminJar);
    check('admin deletes a message in own grid', admDelOwn.status === 200, admDelOwn.json);
    // Audit log records the admin's publish. Master GET endpoints take
    // the code in the X-Master-Code header — never in the URL.
    const audit = (await req('/api/master/audit', { headers: { 'X-Master-Code': CODE } })).json;
    check('audit log records schedule publish by the admin',
      audit.rows.some((r) => r.action === 'schedule.publish' && r.actor_gmail === 'gov.peshawar@gmail.com'), audit.rows.map((r) => r.action));
    const auditBad = await req('/api/master/audit', { headers: { 'X-Master-Code': 'wrong' } });
    check('audit log rejects wrong master code (header)', auditBad.status === 403, auditBad.status);
    const auditQuery = await req('/api/master/audit?code=' + CODE);
    check('audit log rejects master code in the URL query string', auditQuery.status === 403, auditQuery.status);
    const adminList = await req('/api/master/admins', { headers: { 'X-Master-Code': CODE } });
    const adminListRaw = adminList.text;
    check('master admin list shows the admin Gmail, never password hashes',
      adminList.status === 200 && adminList.json.admins.some((a) => a.gmail === 'gov.peshawar@gmail.com') && !adminListRaw.includes('scrypt'), adminList.json.admins.length);
    // Master removes the admin; login then fails.
    const rmAdmin = await post('/api/master/admin/remove', { code: CODE, gmail: 'gov.peshawar@gmail.com' });
    check('master removes the admin account', rmAdmin.status === 200, rmAdmin.json);
    const deadLogin = await post('/api/auth/login', { gmail: 'gov.peshawar@gmail.com', password: 'adminpass123' });
    check('removed admin can no longer log in', deadLogin.status === 401, deadLogin.json);
    // Master removes the empty test grid.
    const rmGrid = await post('/api/master/grid/remove', { code: CODE, grid_id: newGrid.json.id });
    check('master removes the test grid', rmGrid.status === 200, rmGrid.json);

    // ---- change password + master password reset (no email reset exists) ----
    const chgWrong = await post('/api/auth/change-password', { current: 'notmypassword', next: 'newpassword123' }, jar1);
    check('change password rejects wrong current password', chgWrong.status === 401, chgWrong.json);
    const chgShort = await post('/api/auth/change-password', { current: 'password123', next: 'short' }, jar1);
    check('change password rejects short new password', chgShort.status === 400, chgShort.json);
    const chgOk = await post('/api/auth/change-password', { current: 'password123', next: 'newpassword123' }, jar1);
    check('change password works', chgOk.status === 200, chgOk.json);
    const oldPassLogin = await post('/api/auth/login', { gmail: 'peshawar.user@gmail.com', password: 'password123' });
    check('old password stops working after change', oldPassLogin.status === 401, oldPassLogin.json);
    const newPassLogin = await post('/api/auth/login', { gmail: 'peshawar.user@gmail.com', password: 'newpassword123' }, jar1);
    check('new password works after change', newPassLogin.status === 200, newPassLogin.json);
    const chgAnon = await post('/api/auth/change-password', { current: 'x', next: 'newpassword123' });
    check('change password requires login', chgAnon.status === 401, chgAnon.status);
    const resetBadCode = await post('/api/master/user/reset-password', { code: 'wrong', gmail: 'peshawar.user@gmail.com', password: 'resetpass123' });
    check('master password reset rejects wrong code', resetBadCode.status === 403, resetBadCode.json);
    const resetNoUser = await post('/api/master/user/reset-password', { code: CODE, gmail: 'nobody@gmail.com', password: 'resetpass123' });
    check('master password reset 404s unknown account', resetNoUser.status === 404, resetNoUser.json);
    const resetOk = await post('/api/master/user/reset-password', { code: CODE, gmail: 'peshawar.user@gmail.com', password: 'resetpass123' });
    check('master resets the user password', resetOk.status === 200, resetOk.json);
    const resetLogin = await post('/api/auth/login', { gmail: 'peshawar.user@gmail.com', password: 'resetpass123' }, jar1);
    check('user logs in with the master-reset password', resetLogin.status === 200, resetLogin.json);

    // ---- own-message flag (dashboard Delete button depends on it) ----
    const ownPost2 = await post('/api/my/grid/' + peshGrid.id + '/message', { status: 'off', note: 'own flag test' }, jar1);
    const msgsOwn = (await req('/api/my/grid/' + peshGrid.id + '/messages', {}, jar1)).json;
    const mine = msgsOwn.messages.find((m) => m.id === ownPost2.json.id);
    check('messages mark the reader own messages own=true, others own=false',
      mine && mine.own === true && msgsOwn.messages.every((m) => m.id === ownPost2.json.id || m.own === false) && !('user_id' in mine) && !JSON.stringify(msgsOwn).includes('peshawar.user@gmail.com'), mine);
    await post('/api/my/message/delete', { id: ownPost2.json.id }, jar1);

    // ---- signup rate limit (distinct IP so it cannot affect the rest) ----
    {
      let saw429 = false;
      let made = 0;
      for (let i = 0; i < 21; i++) {
        const cnic = '35202' + String(30000000 + i); // 13 digits, Lahore prefix 352
        const r = await req('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.99' }, body: JSON.stringify({ gmail: `ratelimit${i}@gmail.com`, password: 'password123', cnic, district: 'Lahore' }) });
        if (r.status === 429) { saw429 = true; break; }
        if (r.status === 200) made++;
      }
      check('signup rate limit: 20 accounts from one IP, 21st gets 429', saw429 && made === 20, { made, saw429 });
    }

    // ---- static pages carry the QA fixes ----
    const home2 = await req('/');
    check('homepage: fixed typo (Aapke), About section, contact email, 168 districts',
      home2.text.includes('Aapke district') && home2.text.includes('About Bijli Map') && home2.text.includes('mhkh3200@gmail.com') && home2.text.includes('All 168 districts'), home2.status);
    const appHtml = await req('/app.html');
    check('dashboard: real logout, own-delete, EXAMPLE banner, now-status, PKT times, change-password form',
      appHtml.text.includes("fetch('/api/auth/logout'") && appHtml.text.includes('delOwn') && appHtml.text.includes('exampleBanner')
      && appHtml.text.includes('nowBox') && appHtml.text.includes('Asia/Karachi') && appHtml.text.includes('Change your password'), appHtml.status);
    const adminHtml = await req('/admin.html');
    check('admin page: no leaked master code, header auth, users table, password reset, logout',
      !adminHtml.text.includes(CODE) && adminHtml.text.includes('X-Master-Code') && adminHtml.text.includes('Registered users')
      && adminHtml.text.includes('Reset a user') && adminHtml.text.includes("fetch('/api/auth/logout'"), adminHtml.status);

    // ---- pages serve ----
    const home = await req('/');
    check('homepage serves 200 with signup + login', home.status === 200 && home.text.includes('Sign up') && home.text.includes('Log in'), home.status);
    const appPage = await req('/app.html');
    check('dashboard page serves 200', appPage.status === 200, appPage.status);
    const adminPage = await req('/admin.html');
    check('admin page serves 200 with master console', adminPage.status === 200 && adminPage.text.includes('Master console'), adminPage.status);
    const daGone = await req('/district-admin.html');
    check('old district-admin page is gone (404)', daGone.status === 404, daGone.status);
  } finally {
    child.kill();
  }
  console.log(failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
