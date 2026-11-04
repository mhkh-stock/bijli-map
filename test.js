// Bijli Map — verification tests (fresh DB, live HTTP).
// Run: node test.js — exits non-zero on any failure.
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 3041;
const DB = '/tmp/bijli-test.sqlite';
for (const f of [DB, DB + '-shm', DB + '-wal']) { try { fs.unlinkSync(f); } catch {} }
const BASE = `http://127.0.0.1:${PORT}`;
const CODE = 'bijli-admin';
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS: ' + name);
  else { failures++; console.log('FAIL: ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); }
}
const j = async (p, opts) => (await (await fetch(BASE + p, opts)).json());
const post = (p, body) => j(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function waitReady() {
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/api/meta'); return true; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  return false;
}
(async () => {
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DB_FILE: DB }, stdio: 'pipe',
  });
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  try {
    check('server starts', await waitReady(), serverLog.slice(-500));
    const meta = await j('/api/meta');
    check('meta has 11 discos incl LESCO + K-Electric',
      meta.discos.length === 11 && meta.discos.some((d) => d.name === 'LESCO') && meta.discos.some((d) => d.name === 'K-Electric'), meta.discos.map((d) => d.name));
    check('meta helpline is 118', meta.helpline === '118', meta.helpline);
    check('meta has 5 seeded example areas', meta.areas.length === 5, meta.areas.length);
    check('meta carries unverified-reports notice', /unverified/i.test(meta.notice || ''), meta.notice);

    const board0 = await j('/api/board');
    const gul = board0.areas.find((a) => a.area === 'Gulberg');
    check('board: Gulberg latest demo report is restored', gul && gul.status === 'restored' && gul.latest_is_demo === true && gul.report_count === 2, gul);
    const tr0 = await j('/api/tracker');
    const gulTr = tr0.rows.find((r) => r.area === 'Gulberg');
    check('tracker: Gulberg demo window 10:00->12:30 = 2.5h actual vs 2.0h scheduled',
      gulTr && gulTr.scheduled_hours === 2 && gulTr.actual_hours === 2.5 && gulTr.completed_windows === 1, gulTr);
    const khiTr = tr0.rows.find((r) => r.area === 'Gulshan-e-Iqbal');
    check('tracker: open outage (no restore) is not counted as actual',
      khiTr && khiTr.actual_hours === null && khiTr.open_outage === true, khiTr);

    const rep1 = await post('/api/report', { city: 'TestCity', area: 'TestArea', status: 'out', note: 'test out' });
    check('report submission works', rep1.ok === true && rep1.id > 0, rep1);
    const board1 = await j('/api/board');
    const ta1 = board1.areas.find((a) => a.area === 'TestArea');
    check('board reflects latest report: TestArea OUT, count 1',
      ta1 && ta1.status === 'out' && ta1.report_count === 1 && ta1.latest_is_demo === false, ta1);
    await post('/api/report', { city: 'TestCity', area: 'TestArea', status: 'restored', note: 'test back' });
    const board2 = await j('/api/board');
    const ta2 = board2.areas.find((a) => a.area === 'TestArea');
    check('board updates on restore: TestArea RESTORED, count 2',
      ta2 && ta2.status === 'restored' && ta2.report_count === 2, ta2);
    const badRep = await post('/api/report', { city: '', area: 'X', status: 'out' });
    check('report rejects empty city', badRep.error !== undefined, badRep);
    const badStatus = await post('/api/report', { city: 'TestCity', area: 'TestArea', status: 'maybe' });
    check('report rejects bad status', badStatus.error !== undefined, badStatus);

    // Tracker window math via explicit reported_at: out 10:00 -> restored 13:15 = 3.25h.
    const areaAdd = await post('/api/admin/area', { code: CODE, city: 'TestCity', area: 'TrackArea', disco: 'LESCO' });
    check('admin adds area', areaAdd.ok === true && areaAdd.area_id > 0, areaAdd);
    const sch = await post('/api/admin/schedule', { code: CODE, area_id: areaAdd.area_id, date: '2026-11-05', scheduled_hours: 3, note: 'test schedule' });
    check('admin adds schedule', sch.ok === true, sch);
    await post('/api/report', { city: 'TestCity', area: 'TrackArea', status: 'out', reported_at: '2026-11-05 10:00:00' });
    await post('/api/report', { city: 'TestCity', area: 'TrackArea', status: 'restored', reported_at: '2026-11-05 13:15:00' });
    const tr1 = await j('/api/tracker');
    const tk = tr1.rows.find((r) => r.area === 'TrackArea');
    check('tracker: 10:00->13:15 window = 3.25h actual vs 3h scheduled',
      tk && tk.scheduled_hours === 3 && tk.actual_hours === 3.25 && tk.completed_windows === 1, tk);

    // Estimator: hand-computed. 100Ah*12V=1200Wh*0.85=1020/200W=5.10h.
    const e1 = await post('/api/estimate', { battery_ah: 100, voltage: 12, load_watts: 200 });
    check('estimator case 1: 100Ah/12V/200W = 5.10h, 5h 6min',
      e1.runtime_hours === 5.1 && e1.runtime_text === '5h 6min' && e1.energy_wh === 1200 && e1.usable_wh === 1020, e1);
    // 200Ah*24V=4800Wh*0.85=4080/500W=8.16h = 8h 10min (490 min).
    const e2 = await post('/api/estimate', { battery_ah: 200, voltage: 24, load_watts: 500 });
    check('estimator case 2: 200Ah/24V/500W = 8.16h, 8h 10min',
      e2.runtime_hours === 8.16 && e2.runtime_text === '8h 10min' && e2.usable_wh === 4080, e2);
    const eBad = await post('/api/estimate', { battery_ah: 100, voltage: 12, load_watts: 0 });
    check('estimator rejects zero load', eBad.error !== undefined, eBad);

    // Moderation: hide the TestArea 'out' report -> board count drops 2 -> 1, status stays restored.
    const adminList = await j('/api/admin/reports?code=' + CODE);
    const outRep = adminList.rows.find((r) => r.area === 'TestArea' && r.status === 'out');
    check('admin list finds TestArea out report', !!outRep, adminList.rows.length);
    const badHide = await post('/api/admin/hide', { code: 'wrong', id: outRep.id, hidden: true });
    check('admin hide rejects wrong code', badHide.error === 'bad admin code', badHide);
    const hide = await post('/api/admin/hide', { code: CODE, id: outRep.id, hidden: true });
    check('admin hide accepts correct code', hide.ok === true, hide);
    const board3 = await j('/api/board');
    const ta3 = board3.areas.find((a) => a.area === 'TestArea');
    check('hidden report excluded from board (count 2 -> 1)',
      ta3 && ta3.report_count === 1 && ta3.status === 'restored', ta3);

    const home = await fetch(BASE + '/');
    check('homepage serves 200', home.status === 200, home.status);
    const adminPage = await fetch(BASE + '/admin.html');
    check('admin page serves 200', adminPage.status === 200, adminPage.status);
    const discos = await j('/api/discos');
    check('discos endpoint: 11 discos, all helpline 118',
      discos.discos.length === 11 && discos.discos.every((d) => d.helpline === '118'), discos.discos.length);
  } finally {
    child.kill();
  }
  console.log(failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
