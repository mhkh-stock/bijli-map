// Bijli Map frontend — fetches board, tracker, DISCOs; posts reports + estimates.
'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function loadBoard() {
  const d = await (await fetch('/api/board')).json();
  $('boardBody').innerHTML = d.areas.map((a) => {
    const badge = a.status === 'out' ? '<span class="badge out">OUT</span>'
      : a.status === 'restored' ? '<span class="badge restored">RESTORED</span>'
      : '<span class="badge none">No reports yet</span>';
    const demo = a.latest_is_demo ? ' <span class="badge demo">DEMO</span>' : '';
    const ex = a.is_example ? ' <span class="badge example">EXAMPLE</span>' : '';
    return '<tr><td>' + esc(a.city) + '</td><td>' + esc(a.area) + ex + '</td><td>' + esc(a.disco || '—') + '</td><td>' + badge + demo + '</td><td>' + a.report_count + '</td><td>' + esc(a.last_report_at || '—') + '</td></tr>';
  }).join('');
}
async function loadTracker() {
  const d = await (await fetch('/api/tracker')).json();
  $('trackerBody').innerHTML = d.rows.map((r) => {
    const actual = r.actual_hours === null
      ? 'Not enough reports yet' + (r.open_outage ? ' (outage still open — not counted)' : '')
      : r.actual_hours + 'h (' + r.completed_windows + ' completed window' + (r.completed_windows === 1 ? '' : 's') + ')';
    const isEx = /EXAMPLE/.test(r.note || '') ? ' <span class="badge example">EXAMPLE</span>' : '';
    return '<tr><td>' + esc(r.city) + ' / ' + esc(r.area) + '</td><td>' + esc(r.disco || '—') + '</td><td>' + esc(r.date) + '</td><td>' + r.scheduled_hours + 'h' + isEx + '</td><td>' + actual + '</td><td>' + esc(r.note || '') + '</td></tr>';
  }).join('');
}
async function loadDiscos() {
  const d = await (await fetch('/api/discos')).json();
  $('discoBody').innerHTML = d.discos.map((x) => '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.region) + '</td><td>' + esc(x.helpline) + '</td></tr>').join('');
}
$('repBtn').onclick = async () => {
  const body = { city: $('repCity').value, area: $('repArea').value, feeder: $('repFeeder').value, status: $('repStatus').value, note: $('repNote').value };
  const r = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  $('repResult').textContent = r.ok ? 'Shukriya! Report saved as a community report (unverified).' : ('Error: ' + (d.error || 'failed'));
  if (r.ok) { $('repNote').value = ''; loadBoard(); }
};
$('estBtn').onclick = async () => {
  const body = { battery_ah: Number($('estAh').value), voltage: Number($('estV').value), load_watts: Number($('estW').value) };
  const r = await fetch('/api/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  $('estResult').innerHTML = r.ok
    ? 'Estimated runtime: <b>' + d.runtime_text + '</b> (' + d.runtime_hours + ' hours) — from ' + d.energy_wh + ' Wh battery energy, ' + d.usable_wh + ' Wh usable at 85% efficiency.<br><span class="note">' + esc(d.note) + '</span>'
    : 'Error: ' + esc(d.error || 'failed');
};
loadBoard(); loadTracker(); loadDiscos();
