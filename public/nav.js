// Bijli Map — shared header behaviour (one file, every page).
// The header markup is static HTML in each page (index/app/admin +
// server.js pageShell); this file only wires it up:
//   - kebab (⋮) menu: toggle, close on selection / outside tap / Escape
//   - auth state: logged-out shows "Log in" + "Sign up", logged-in
//     shows "My district" (+ "Log out" in the menu), via /api/auth/me
//   - current-page highlight (aria-current="page") on matching links
//   - logout from the menu (POST /api/auth/logout, back to home)
'use strict';
(function () {
  var btn = document.getElementById('menuBtn');
  var menu = document.getElementById('overflowMenu');
  if (!btn || !menu) return;

  function closeMenu(restoreFocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) btn.focus();
  }
  function openMenu() {
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    var first = menu.querySelector('a[role="menuitem"], button[role="menuitem"]');
    if (first) first.focus();
  }
  btn.addEventListener('click', function () {
    if (menu.hidden) openMenu(); else closeMenu(false);
  });
  // Choosing anything in the menu closes it.
  menu.addEventListener('click', function (e) {
    if (e.target.closest('a, button')) closeMenu(false);
  });
  // A tap outside the menu closes it.
  document.addEventListener('click', function (e) {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) closeMenu(false);
  });
  // Escape closes it and returns focus to the button.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu(true);
  });

  // Highlight the current page's link, where it is in the header.
  var path = window.location.pathname;
  document.querySelectorAll('.topbar a[href]').forEach(function (a) {
    if (a.getAttribute('href') === path) a.setAttribute('aria-current', 'page');
  });

  // Show the right account actions for the login state.
  // [data-auth="in"] items start hidden in the markup; [data-auth="out"]
  // items start visible — so a visitor without JS still sees Log in / Sign up.
  function setAuth(loggedIn) {
    document.querySelectorAll('[data-auth]').forEach(function (el) {
      el.hidden = (el.getAttribute('data-auth') === 'in') !== loggedIn;
    });
  }
  document.querySelectorAll('[data-logout]').forEach(function (b) {
    b.addEventListener('click', async function () {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    });
  });
  fetch('/api/auth/me')
    .then(function (r) { return r.json(); })
    .then(function (d) { setAuth(!!(d && d.logged_in)); })
    .catch(function () { setAuth(false); });
})();
