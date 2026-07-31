/**
 * Auth Helper (RBAC bootstrap)
 * ---------------------------------------------------------------
 * Dijalankan sedini mungkin (sebelum nav.js) supaya elemen
 * bertanda `data-owner-only="1"` tidak sempat "flicker" ke user
 * karyawan sebelum role diketahui.
 *
 * Kontrak untuk halaman:
 *   window.currentUserRole   → 'owner' | 'karyawan' | undefined (belum loaded)
 *   window.isOwner()         → boolean (cek localStorage sebagai fallback)
 *   window.authReady         → Promise yang resolve setelah role fetch selesai
 *   event 'pos:role-loaded'  → dispatched di window; detail.role
 *
 * Guard visual:
 *   Elemen dengan atribut  data-owner-only="1"  otomatis disembunyikan
 *   sampai role terkonfirmasi 'owner' → atributnya di-remove.
 *
 * Idempoten: aman di-load lebih dari sekali (nav.js juga punya fallback).
 */
(function () {
  'use strict';
  if (window.__authHelperLoaded) return;
  window.__authHelperLoaded = true;

  /* ── Inject CSS: sembunyikan owner-only sampai role dikonfirmasi ── */
  if (!document.getElementById('rbac-guard-style')) {
    const s = document.createElement('style');
    s.id = 'rbac-guard-style';
    s.textContent = '[data-owner-only="1"]{display:none !important}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* ── Helper sinkron: pakai localStorage sebagai bootstrap value ── */
  window.isOwner = function () {
    if (window.currentUserRole) return window.currentUserRole === 'owner';
    try { return localStorage.getItem('pos_user_role') === 'owner'; } catch (_) { return false; }
  };

  const stripGuard = (root) => {
    if (!root) return;
    if (root.nodeType === 1 && root.getAttribute && root.getAttribute('data-owner-only') === '1') {
      root.removeAttribute('data-owner-only');
    }
    if (root.querySelectorAll) {
      root.querySelectorAll('[data-owner-only="1"]').forEach((el) => {
        el.removeAttribute('data-owner-only');
      });
    }
  };

  const applyRole = (role, name) => {
    window.currentUserRole = role;
    try { localStorage.setItem('pos_user_role', role); } catch (_) {}
    try {
      document.body?.classList.remove('role-owner', 'role-karyawan');
      document.body?.classList.add('role-' + role);
    } catch (_) {}
    if (role === 'owner') {
      // Bersihkan yang sudah ada + pasang observer supaya konten yang
      // di-render belakangan (setelah fetch data / template dinamis)
      // juga otomatis di-unhide.
      stripGuard(document.body || document.documentElement);
      try {
        if (!window.__rbacObserver) {
          const obs = new MutationObserver((muts) => {
            for (const m of muts) {
              m.addedNodes.forEach((n) => stripGuard(n));
            }
          });
          const start = () => obs.observe(document.body, { childList: true, subtree: true });
          if (document.body) start();
          else document.addEventListener('DOMContentLoaded', start, { once: true });
          window.__rbacObserver = obs;
        }
      } catch (_) {}
    }
    try {
      window.dispatchEvent(new CustomEvent('pos:role-loaded', { detail: { role, name } }));
    } catch (_) {}
  };

  window.authReady = fetch('/api/v1/auth/me', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const role = d?.user?.role || 'karyawan';
      const name = d?.user?.nama || null;
      applyRole(role, name);
      return { role, name, user: d?.user || null };
    })
    .catch(() => {
      // Offline / login expired → jangan promote apa-apa
      applyRole('karyawan', null);
      return { role: 'karyawan', name: null, user: null };
    });
})();
