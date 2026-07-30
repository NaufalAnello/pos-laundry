/* ════════════════════════════════════════════════════════════
   POS Laundry — Shared Navigation
   Desktop ≥768px : sidebar 200px putih + topbar wordmark
   Mobile  <768px : pill nav floating (4 item) + FAB Order terpisah
                    Nav DISEMBUNYIKAN di halaman Order Baru (/order/baru).
   ════════════════════════════════════════════════════════════ */
(function () {
  const p = location.pathname;

  /* ── SVG icons (stroke sederhana, stroke-width 1.8, linecap round) ── */
  const SVG = {
    home:    '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
    antrian: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/></svg>',
    tagihan: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M15 13h3"/></svg>',
    lainnya: '<svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    plus:    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    truck:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v10H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
    logout:  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>',
  };

  /* ── Active state helpers ──────────────────────────────── */
  const sbActive = (href) => {
    if (href === '/') return p === '/';
    return p === href;
  };

  const bnActive = (href) => {
    if (href === '/') return p === '/';
    if (href === '/order') return p === '/order';
    if (href === '/tagihan') return p === '/tagihan';
    return false;
  };

  // "Lainnya" aktif kalau bukan Home / Antrian / Tagihan / Order Baru
  const isMoreActive = () => {
    const main = ['/', '/order', '/order/baru', '/tagihan'];
    return !main.includes(p);
  };

  const isOrderBaru = () => p === '/order/baru';

  /* ── Data model ────────────────────────────────────────── */
  // ownerOnly: true → hanya tampil untuk role 'owner' (RBAC)
  // Sidebar (desktop) — pakai monogram tile 20×20 di kiri
  const NAV = [
    {
      group: 'Operasional',
      items: [
        { href: '/',           mono: 'HM', label: 'Dashboard'  },
        { href: '/order/baru', mono: 'OB', label: 'Order Baru' },
        { href: '/order',      mono: 'AN', label: 'Antrian'    },
        { href: '/tagihan',    mono: 'TG', label: 'Tagihan'    },
      ]
    },
    {
      group: 'Keuangan',
      items: [
        { href: '/kas',              mono: 'BK', label: 'Buku Kas',     ownerOnly: true },
        { href: '/deposit',          mono: 'DP', label: 'Deposit'     },
        { href: '/antar-jemput',     mono: 'AJ', label: 'Antar Jemput' },
        { href: '/reservasi-jemput', mono: 'JJ', label: 'Jadwal Jemput'},
        { href: '/laporan',          mono: 'LP', label: 'Laporan',      ownerOnly: true },
      ]
    },
    {
      group: 'Marketing',
      items: [
        { href: '/promo',     mono: 'PR', label: 'Promo',     ownerOnly: true },
        { href: '/poin',      mono: 'PN', label: 'Poin',      ownerOnly: true },
        { href: '/pelanggan', mono: 'PL', label: 'Pelanggan' },
        { href: '/wa-center', mono: 'PW', label: 'Pusat WA'  },
      ]
    },
    {
      group: 'Master',
      items: [
        { href: '/layanan',    mono: 'LY', label: 'Layanan',     ownerOnly: true },
        { href: '/stok-bahan', mono: 'SB', label: 'Stok Bahan' },
        { href: '/ai-insight', mono: 'AI', label: 'AI Insight',  ownerOnly: true },
        { href: '/pengaturan', mono: 'PG', label: 'Pengaturan',  ownerOnly: true },
      ]
    }
  ];

  // Menu Lainnya (bottom sheet mobile) — 13 item, grid 4 kolom, monogram tile 50×50
  const MORE_ITEMS = [
    { href: '/kas',              mono: 'BK', label: 'Buku Kas',     ownerOnly: true },
    { href: '/deposit',          mono: 'DP', label: 'Deposit' },
    { href: '/antar-jemput',     mono: 'AJ', label: 'Antar Jemput' },
    { href: '/reservasi-jemput', mono: 'JJ', label: 'Jadwal Jemput', badge: 'reservasi' },
    { href: '/promo',            mono: 'PR', label: 'Promo',        ownerOnly: true },
    { href: '/poin',             mono: 'PN', label: 'Poin',         ownerOnly: true },
    { href: '/pelanggan',        mono: 'PL', label: 'Pelanggan' },
    { href: '/wa-center',        mono: 'PW', label: 'Pusat WA' },
    { href: '/laporan',          mono: 'LP', label: 'Laporan',      ownerOnly: true },
    { href: '/layanan',          mono: 'LY', label: 'Layanan',      ownerOnly: true },
    { href: '/stok-bahan',       mono: 'SB', label: 'Stok Bahan' },
    { href: '/ai-insight',       mono: 'AI', label: 'AI Insight',   ownerOnly: true },
    { href: '/pengaturan',       mono: 'PG', label: 'Pengaturan',   ownerOnly: true },
  ];

  /* ── Page title from <title> ──────────────────────────── */
  const pageTitle = () => {
    const t = document.title.replace(/ ?[—–-] ?POS Laundry$/, '').trim();
    return t || 'POS Laundry';
  };

  /* ── Build HTML ────────────────────────────────────────── */
  const a = (cls, active) => active ? cls + ' active' : cls;
  const ownAttr = (own) => own ? ' data-owner-only="1"' : '';

  const sidebarHTML = `
<aside class="pos-sidebar" id="pos-sidebar">
  <div class="sb-brand">
    <span class="sb-brand-mono">NL</span>
    <span class="sb-brand-text">nala laundry</span>
  </div>
  <nav class="sb-nav">
    ${NAV.map(g => `
      <div class="sb-group"${ownAttr(g.ownerOnly)}>
        <div class="sb-group-label">${g.group}</div>
        ${g.items.map(it => `
          <a href="${it.href}" class="${a('sb-item', sbActive(it.href))}"${ownAttr(it.ownerOnly)}>
            <span class="sb-mono">${it.mono}</span>
            <span class="sb-lbl">${it.label}</span>
          </a>`).join('')}
      </div>`).join('')}
  </nav>
  <div class="sb-footer">
    <div class="sb-user-name" id="sbUserName">–</div>
    <div class="sb-user-role" id="sbUserRole" style="font-size:11px;color:var(--gray-5);margin-top:2px"></div>
    <button class="sb-logout" onclick="posLogout()">${SVG.logout} Keluar</button>
  </div>
</aside>`;

  const topbarHTML = `
<div class="pos-topbar">
  <span class="pos-topbar-mono">NL</span>
  <span class="pos-topbar-page">${pageTitle()}</span>
  <a href="/" id="tbAJBell" title="Order antar jemput belum diproses"
     style="display:none;margin-left:auto;margin-right:10px;text-decoration:none;
            font-size:13px;color:#B45309;background:#FEF3E2;border:1px solid #FDE68A;
            padding:4px 10px;border-radius:999px;font-weight:700;display:none;align-items:center;gap:5px">
    ${SVG.truck} <span id="tbAJBellCount">0</span>
  </a>
  <span class="pos-topbar-user" id="tbUserName">–</span>
</div>`;

  const hideBottom = isOrderBaru();

  // Sinyal ke halaman: nav bawah tersembunyi → sticky bar boleh menempel dasar
  if (hideBottom) document.documentElement.classList.add('no-bottom-nav');

  const pillNavHTML = hideBottom ? '' : `
<nav class="pos-pill-nav" id="pos-pill-nav">
  <a href="/" class="${a('pn-item', bnActive('/'))}">
    <span class="pn-icon">${SVG.home}</span>
    <span class="pn-label">Home</span>
  </a>
  <a href="/order" class="${a('pn-item', bnActive('/order'))}">
    <span class="pn-icon">${SVG.antrian}</span>
    <span class="pn-label">Antrian</span>
  </a>
  <a href="/tagihan" class="${a('pn-item', bnActive('/tagihan'))}" style="position:relative">
    <span class="pn-icon">${SVG.tagihan}</span>
    <span class="pn-label">Tagihan</span>
    <span class="pn-badge" id="pnBadge-tagihan" style="display:none">0</span>
  </a>
  <button type="button" class="${a('pn-item pn-more', isMoreActive())}" id="pn-more" onclick="openMoreSheet()">
    <span class="pn-icon">${SVG.lainnya}</span>
    <span class="pn-badge" id="pnBadge-more" style="display:none;top:6px;right:6px">0</span>
  </button>
</nav>
<a href="/order/baru" class="pos-fab-order" aria-label="Order Baru">${SVG.plus}</a>`;

  const moreSheetHTML = `
<div class="more-overlay" id="moreOverlay" onclick="closeMoreSheet()"></div>
<div class="more-sheet" id="moreSheet">
  <div class="more-sheet-handle"></div>
  <div class="more-sheet-title">Menu Lainnya</div>
  <div class="more-sheet-grid">
    ${MORE_ITEMS.map(it => `
      <a href="${it.href}" class="${a('more-grid-item', sbActive(it.href))}"${ownAttr(it.ownerOnly)} style="position:relative">
        <span class="mgi-tile">${it.mono}</span>
        <span class="mgi-label">${it.label}</span>
        ${it.badge ? `<span class="bn-badge" id="miBadge-${it.badge}" style="display:none;position:absolute;top:0;right:6px">0</span>` : ''}
      </a>`).join('')}
  </div>
  <div class="more-sheet-footer">
    <span class="more-sheet-user" id="moreUserName">–</span>
    <button class="more-sheet-logout" onclick="posLogout()">Keluar</button>
  </div>
</div>`;

  /* ── Inject RBAC CSS (hide owner-only sampai role diketahui) ─── */
  const rbacStyle = document.createElement('style');
  rbacStyle.textContent = `[data-owner-only="1"] { display: none !important; }`;
  document.head.appendChild(rbacStyle);

  /* ── Inject ke DOM ─────────────────────────────────────── */
  document.body.insertAdjacentHTML('afterbegin', sidebarHTML + topbarHTML);
  document.body.insertAdjacentHTML('beforeend', pillNavHTML + moreSheetHTML);

  /* ── Auto-load shared bottom sheets (lunasi + WA) ─────── */
  ['/js/lunasi-sheet.js', '/js/wa-sheet.js'].forEach(src => {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement('script');
    s.src = src;
    s.defer = false;
    document.body.appendChild(s);
  });

  // Bungkus konten halaman ke .pos-main
  const skipClasses = ['pos-sidebar','pos-topbar','pos-pill-nav','pos-fab-order','more-overlay','more-sheet'];
  const wrap = document.createElement('div');
  wrap.className = 'pos-main';
  const toWrap = Array.from(document.body.children)
    .filter(el => !skipClasses.some(c => el.classList.contains(c)));
  toWrap.forEach(el => wrap.appendChild(el));
  document.getElementById('pos-sidebar').insertAdjacentElement('afterend', wrap);

  /* ── Load user info + role ─────────────────────────────── */
  fetch('/api/v1/auth/me', { credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      const name = d?.user?.nama || '–';
      const role = d?.user?.role || 'karyawan';
      window.currentUserRole = role;
      try { localStorage.setItem('pos_user_role', role); } catch (_) {}

      ['sbUserName','tbUserName','moreUserName'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = name;
      });
      const roleEl = document.getElementById('sbUserRole');
      if (roleEl) roleEl.textContent = role === 'owner' ? 'Owner' : 'Karyawan';
      const legacy = document.getElementById('userName');
      if (legacy) legacy.textContent = name;

      document.body.classList.add(`role-${role}`);

      if (role === 'owner') {
        document.querySelectorAll('[data-owner-only="1"]').forEach(el => {
          el.removeAttribute('data-owner-only');
        });
      }

      window.dispatchEvent(new CustomEvent('pos:role-loaded', { detail: { role } }));
    })
    .catch(() => {});

  /* ── Badge tagihan belum lunas + AJ + reservasi ─────────── */
  const refreshTagihanBadge = () => {
    fetch('/api/v1/dashboard', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;

        const setBadge = (id, val) => {
          const e = document.getElementById(id);
          if (!e) return;
          if (val > 0) { e.textContent = val > 99 ? '99+' : val; e.style.display = ''; }
          else         { e.style.display = 'none'; }
        };

        const n = Number(d.tagihan_belum_lunas || 0);
        setBadge('pnBadge-tagihan', n);
        // legacy id (kalau ada halaman yg masih pakai)
        setBadge('bnBadge-tagihan', n);

        const ajCount = Number(d.antar_jemput_belum_diproses || 0);
        const bell = document.getElementById('tbAJBell');
        const bellCount = document.getElementById('tbAJBellCount');
        if (bell && bellCount) {
          if (ajCount > 0) {
            bellCount.textContent = ajCount;
            bell.title = `${ajCount} order antar jemput hari ini belum dihitung`;
            bell.style.display = 'inline-flex';
          } else {
            bell.style.display = 'none';
          }
        }

        const rj = Number(d.reservasi_jemput_hari_ini || 0);
        setBadge('miBadge-reservasi', rj);
        setBadge('pnBadge-more', rj);
        setBadge('bnBadge-more', rj);
      })
      .catch(() => {});
  };
  refreshTagihanBadge();
  setInterval(refreshTagihanBadge, 60000);
  window.posRefreshBadges = refreshTagihanBadge;

  /* ── Exposed globals ───────────────────────────────────── */
  window.posLogout = async () => {
    try { localStorage.removeItem('pos_user_role'); } catch (_) {}
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    location.href = '/login';
  };
  if (!window.logout) window.logout = window.posLogout;

  window.isOwner = function () {
    if (window.currentUserRole) return window.currentUserRole === 'owner';
    try { return localStorage.getItem('pos_user_role') === 'owner'; } catch (_) { return false; }
  };

  window.openMoreSheet = () => {
    document.getElementById('moreOverlay').classList.add('open');
    document.getElementById('moreSheet').classList.add('open');
  };

  window.closeMoreSheet = () => {
    document.getElementById('moreOverlay').classList.remove('open');
    document.getElementById('moreSheet').classList.remove('open');
  };
})();
