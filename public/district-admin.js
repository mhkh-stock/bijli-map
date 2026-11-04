// Bijli Map district admin frontend. Code lives in sessionStorage only.
'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function loadCities() {
  const d = await (await fetch('/api/meta')).json();
  const cities = [...new Set(d.areas.map((a) => a.city))].sort();
  $('daCity').innerHTML = cities.map((c) => '<option>' + esc(c) + '</option>').join('');
  const saved = sessionStorage.getItem('bijli-district-city');
  if (saved && cities.includes(saved)) $('daCity').value = saved;
  const savedCode = sessionStorage.getItem('bijli-district-code');
  if (savedCode) $('daCode').value = savedCode;
}
async function loadBoard() {
  const city = $('daCity').value, code = $('daCode').value;
  sessionStorage.setItem('bijli-district-city', city);
  sessionStorage.setItem('bijli-district-code', code);
  const r = await fetch('/api/district-admin/board?city=' + encodeURIComponent(city) + '&district_code=' + encodeURIComponent(code));
  const d = await r.json();
  if (!r.ok) { $('daMsg').textContent = 'Error: ' + (d.error || 'failed'); $('daBody').innerHTML = ''; return; }
  $('daMsg').textContent = d.reports.length + ' reports for ' + d.city + '. You can only hide/show reports in this city.';
  $('daBody').innerHTML = d.reports.map((x) => {
    const flags = (x.is_demo ? '<span class="badge demo">DEMO</span> ' : '') + (x.hidden ? '<span class="badge none">HIDDEN</span>' : '');
    const btn = '<button class="secondary" onclick="toggleHide(' + x.id + ',' + (x.hidden ? 0 : 1) + ')">' + (x.hidden ? 'Show' : 'Hide') + '</button>';
    return '<tr><td>' + esc(x.area) + '</td><td>' + esc(x.status) + '</td><td>' + esc(x.note) + '</td><td>' + esc(x.created_at) + '</td><td>' + flags + '</td><td>' + btn + '</td></tr>';
  }).join('');
}
async function toggleHide(id, hidden) {
  const r = await fetch('/api/district-admin/hide', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city: $('daCity').value, district_code: $('daCode').value, report_id: id, hidden }) });
  const d = await r.json();
  $('daMsg').textContent = r.ok ? 'Updated.' : ('Error: ' + (d.error || 'failed'));
  if (r.ok) loadBoard();
}
$('daLoadBtn').onclick = loadBoard;
loadCities();
