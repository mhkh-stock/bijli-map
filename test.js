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

    // ---- district pages (server-rendered SEO pages) ----
    const lpRes = await fetch(BASE + '/district/lahore');
    const lpHtml = await lpRes.text();
    check('district page Lahore: 200, city H1 + city title + disclaimer',
      lpRes.status === 200 && lpHtml.includes('<h1>Power outages in Lahore</h1>')
      && lpHtml.includes('<title>Power outages in Lahore today — Bijli Map</title>')
      && lpHtml.includes('COMMUNITY REPORTS') && lpHtml.includes('118'), lpRes.status);
    check('district page content is server-rendered (Gulberg row in HTML)',
      lpHtml.includes('Gulberg') && lpHtml.includes('Gulberg-1'), lpHtml.length);
    const lpCase = await fetch(BASE + '/district/LAHORE');
    check('district page slug is case-insensitive', lpCase.status === 200, lpCase.status);
    const lp404 = await fetch(BASE + '/district/nowherecity');
    check('unknown city district page is 404', lp404.status === 404, lp404.status);
    const smRes = await fetch(BASE + '/sitemap.xml');
    const smXml = await smRes.text();
    check('sitemap lists districts + district URLs',
      smRes.status === 200 && smXml.includes('/districts') && smXml.includes('/district/lahore')
      && smXml.includes('/district/peshawar'), smRes.status);
    const diRes = await fetch(BASE + '/districts');
    const diHtml = await diRes.text();
    check('districts index lists cities with links',
      diRes.status === 200 && diHtml.includes('/district/lahore') && diHtml.includes('/district/karachi'), diRes.status);

    // ---- district admins ----
    const daCreate = await post('/api/admin/district-admin', { code: CODE, city: 'Lahore', district_code: 'lahore-mod-1' });
    check('master creates a Lahore district code', daCreate.ok === true && daCreate.city === 'Lahore', daCreate);
    const daBadCreate = await post('/api/admin/district-admin', { code: 'wrong', city: 'Lahore', district_code: 'x' });
    check('district code creation rejects wrong master code', daBadCreate.error === 'bad admin code', daBadCreate);
    const daList = await j('/api/admin/district-admins?code=' + CODE);
    const daListRaw = await (await fetch(BASE + '/api/admin/district-admins?code=' + CODE)).text();
    check('district code list shows Lahore but never the code itself',
      daList.cities.includes('Lahore') && !daListRaw.includes('lahore-mod-1'), daListRaw);
    const daBoardBad = await fetch(BASE + '/api/district-admin/board?city=Lahore&district_code=wrong');
    check('district board rejects wrong code (403)', daBoardBad.status === 403, daBoardBad.status);
    const daBoard = await j('/api/district-admin/board?city=Lahore&district_code=lahore-mod-1');
    check('district board with correct code shows Lahore reports only',
      daBoard.reports.length > 0 && daBoard.reports.every((r) => r.city === 'Lahore'), daBoard.reports.length);
    const lgOut = daBoard.reports.find((r) => r.area === 'Gulberg' && r.status === 'out');
    check('district board finds Gulberg out report', !!lgOut, daBoard.reports.length);
    const daHide = await post('/api/district-admin/hide', { city: 'Lahore', district_code: 'lahore-mod-1', report_id: lgOut.id, hidden: true });
    check('district admin hides own-city report', daHide.ok === true, daHide);
    const afterHide = await j('/api/admin/reports?code=' + CODE);
    check('hidden-by-district report shows hidden in master list',
      afterHide.rows.find((r) => r.id === lgOut.id).hidden === 1, afterHide.rows.find((r) => r.id === lgOut.id));
    const khiRep = afterHide.rows.find((r) => r.city === 'Karachi');
    const daCross = await post('/api/district-admin/hide', { city: 'Lahore', district_code: 'lahore-mod-1', report_id: khiRep.id, hidden: true });
    check('district admin hiding another city report gets 403', daCross.error !== undefined, daCross);
    const afterCross = await j('/api/admin/reports?code=' + CODE);
    check('cross-city report unchanged after 403 attempt',
      afterCross.rows.find((r) => r.id === khiRep.id).hidden === 0, afterCross.rows.find((r) => r.id === khiRep.id));
    const daHideBad = await post('/api/district-admin/hide', { city: 'Lahore', district_code: 'wrong', report_id: lgOut.id, hidden: false });
    check('district hide rejects wrong code', daHideBad.error !== undefined, daHideBad);
    const daUnhide = await post('/api/district-admin/hide', { city: 'Lahore', district_code: 'lahore-mod-1', report_id: lgOut.id, hidden: false });
    check('district admin restores own-city report', daUnhide.ok === true, daUnhide);
    const daRemove = await post('/api/admin/district-admin/remove', { code: CODE, city: 'Lahore' });
    check('master removes Lahore district code', daRemove.ok === true, daRemove);
    const daBoardGone = await fetch(BASE + '/api/district-admin/board?city=Lahore&district_code=lahore-mod-1');
    check('district board rejects code after removal (403)', daBoardGone.status === 403, daBoardGone.status);
    const masterStill = await j('/api/admin/reports?code=' + CODE);
    check('master code still works after district admin work', Array.isArray(masterStill.rows), masterStill);

    const home = await fetch(BASE + '/');
    check('homepage serves 200', home.status === 200, home.status);
    const homeHtml = await home.text();
    check('homepage links to districts index', homeHtml.includes('/districts'), homeHtml.length);
    const adminPage = await fetch(BASE + '/admin.html');
    check('admin page serves 200', adminPage.status === 200, adminPage.status);
    const adminHtml = await adminPage.text();
    check('admin page has District admins section', adminHtml.includes('District admins') && adminHtml.includes('daCreateBtn'), adminHtml.length);
    const daPage = await fetch(BASE + '/district-admin.html');
    check('district admin page serves 200', daPage.status === 200, daPage.status);
    const discos = await j('/api/discos');
    check('discos endpoint: 11 discos, all helpline 118',
      discos.discos.length === 11 && discos.discos.every((d) => d.helpline === '118'), discos.discos.length);
  } finally {
    child.kill();
  }
  console.log(failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
