// Bijli Map admin frontend.
'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const code = () => $('code').value;

async function loadReports() {
  const r = await fetch('/api/admin/reports?code=' + encodeURIComponent(code()));
  const d = await r.json();
  if (!r.ok) { $('adminMsg').textContent = 'Error: ' + (d.error || 'failed'); return; }
  $('adminMsg').textContent = d.rows.length + ' reports (newest first). Hidden reports are excluded from the public board.';
  $('repBody').innerHTML = d.rows.map((x) => {
    const flags = (x.is_demo ? '<span class="badge demo">DEMO</span> ' : '') + (x.hidden ? '<span class="badge none">HIDDEN</span>' : '');
    const btn = '<button class="secondary" onclick="toggleHide(' + x.id + ',' + (x.hidden ? 0 : 1) + ')">' + (x.hidden ? 'Show' : 'Hide') + '</button>';
    return '<tr><td>' + esc(x.city) + ' / ' + esc(x.area) + '</td><td>' + esc(x.status) + '</td><td>' + esc(x.note) + '</td><td>' + esc(x.created_at) + '</td><td>' + flags + '</td><td>' + btn + '</td></tr>';
  }).join('');
}
async function toggleHide(id, hidden) {
  const r = await fetch('/api/admin/hide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code(), id, hidden }) });
  const d = await r.json();
  $('adminMsg').textContent = r.ok ? 'Updated.' : ('Error: ' + (d.error || 'failed'));
  if (r.ok) loadReports();
}
$('loadBtn').onclick = loadReports;
$('addAreaBtn').onclick = async () => {
  const r = await fetch('/api/admin/area', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code(), city: $('newCity').value, area: $('newArea').value, disco: $('newDisco').value, feeder: $('newFeeder').value }) });
  const d = await r.json();
  $('adminMsg').textContent = r.ok ? 'Area added (id ' + d.area_id + ').' : ('Error: ' + (d.error || 'failed'));
};
$('addSchBtn').onclick = async () => {
  const r = await fetch('/api/admin/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code(), area_id: Number($('schArea').value), date: $('schDate').value, scheduled_hours: Number($('schHours').value), note: $('schNote').value }) });
  const d = await r.json();
  $('adminMsg').textContent = r.ok ? 'Schedule saved.' : ('Error: ' + (d.error || 'failed'));
};
$('daCreateBtn').onclick = async () => {
  const r = await fetch('/api/admin/district-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code(), city: $('daCityNew').value, district_code: $('daCodeNew').value }) });
  const d = await r.json();
  $('adminMsg').textContent = r.ok ? 'District code set for ' + d.city + '. Share it privately with that city\'s moderator.' : ('Error: ' + (d.error || 'failed'));
};
$('daListBtn').onclick = async () => {
  const r = await fetch('/api/admin/district-admins?code=' + encodeURIComponent(code()));
  const d = await r.json();
  $('daList').textContent = r.ok ? (d.cities.length ? 'Cities with a district code: ' + d.cities.join(', ') + ' (codes are never shown here).' : 'No district codes issued yet.') : ('Error: ' + (d.error || 'failed'));
};
