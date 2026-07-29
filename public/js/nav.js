/* ════════════════════════════════════════════════════════════
   POS Laundry — Shared Navigation (sidebar + bottom nav)
   Injected into every page via <script src="/js/nav.js">
   ════════════════════════════════════════════════════════════ */
(function () {
  const p = location.pathname;

  /* ── Active state helpers ──────────────────────────────── */
  const sbActive = (href) => {
    if (href === '/') return p === '/';
    return p === href;
  };

  const bnActive = (href) => {
    if (href === '/') return p === '/';
    if (href === '/order/baru') return p === '/order/baru';
    if (href === '/order') return p === '/order';
    if (href === '/tagihan') return p === '/tagihan';
    return p === href;
  };

  const isMoreActive = () => {
    const main = ['/', '/order', '/order/baru', '/tagihan'];
    return !main.includes(p);
  };

  /* ── Nav data ──────────────────────────────────────────── */
  // ownerOnly: true → hanya tampil untuk role 'owner' (RBAC)
  const NAV = [
    {
      group: 'Operasional',
      items: [
        { href: '/',          icon: '🏠', label: 'Dashboard'   },
        { href: '/order/baru', icon: '➕', label: 'Order Baru'  },
        { href: '/order',      icon: '📋', label: 'Antrian'    },
        { href: '/tagihan',    icon: '💰', label: 'Tagihan'    },
      ]
    },
    {
      group: 'Keuangan',
      // Grup tetap terlihat karyawan (untuk Deposit + AJ + Jadwal Jemput);
      // item Buku Kas & Laporan yang owner-only.
      items: [
        { href: '/kas',          icon: '📒', label: 'Buku Kas',    ownerOnly: true },
        { href: '/deposit',      icon: '💳', label: 'Deposit'     },
        { href: '/antar-jemput', icon: '🛵', label: 'Antar Jemput' },
        { href: '/reservasi-jemput', icon: '📅', label: 'Jadwal Jemput' },
        { href: '/laporan',      icon: '📊', label: 'Laporan', ownerOnly: true },
      ]
    },
    {
      group: 'Marketing',
      items: [
        { href: '/promo',     icon: '🎁', label: 'Promo', ownerOnly: true },
        { href: '/poin',      icon: '⭐', label: 'Poin',  ownerOnly: true },
        { href: '/pelanggan', icon: '👤', label: 'Pelanggan' },
        { href: '/wa-center', icon: '💬', label: 'Pusat WA'  },
      ]
    },
    {
      group: 'Master',
      items: [
        { href: '/layanan',    icon: '🧺', label: 'Layanan', ownerOnly: true },
        { href: '/stok-bahan', icon: '📦', label: 'Stok Bahan' },
        { href: '/ai-insight', icon: '🤖', label: 'AI Insight', ownerOnly: true },
        { href: '/pengaturan', icon: '⚙️', label: 'Pengaturan', ownerOnly: true },
      ]
    }
  ];

  // Bottom nav HP — fokus operasional harian
  const BOTTOM = [
    { href: '/',           icon: '🏠', label: 'Home'    },
    { href: '/order',      icon: '📋', label: 'Antrian' },
    { href: '/order/baru', icon: '<span style="color:white;font-size:24px;font-weight:700;line-height:1">+</span>', label: 'Order', primary: true },
    { href: '/tagihan',    icon: '💰', label: 'Tagihan', badge: 'tagihan' },
  ];

  const MORE_ITEMS = [
    { href: '/kas',          icon: '📒', label: 'Buku Kas', ownerOnly: true },
    { href: '/deposit',      icon: '💳', label: 'Deposit'     },
    { href: '/antar-jemput', icon: '🛵', label: 'Antar Jemput' },
    { href: '/reservasi-jemput', icon: '📅', label: 'Jadwal Jemput', badge: 'reservasi' },
    { href: '/promo',        icon: '🎁', label: 'Promo', ownerOnly: true },
    { href: '/poin',       icon: '⭐', label: 'Poin', ownerOnly: true },
    { href: '/pelanggan',  icon: '👤', label: 'Pelanggan'  },
    { href: '/wa-center',  icon: '💬', label: 'Pusat WA'   },
    { href: '/laporan',    icon: '📊', label: 'Laporan', ownerOnly: true },
    { href: '/layanan',    icon: '🧺', label: 'Layanan', ownerOnly: true },
    { href: '/stok-bahan', icon: '📦', label: 'Stok Bahan' },
    { href: '/ai-insight', icon: '🤖', label: 'AI Insight', ownerOnly: true },
    { href: '/pengaturan', icon: '⚙️', label: 'Pengaturan', ownerOnly: true },
  ];

  /* ── Page title from <title> tag ───────────────────────── */
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
    <span class="sb-brand-icon">🧺</span>
    <span class="sb-brand-text">POS Laundry</span>
  </div>
  <nav class="sb-nav">
    ${NAV.map(g => `
      <div class="sb-group"${ownAttr(g.ownerOnly)}>
        <div class="sb-group-label">${g.group}</div>
        ${g.items.map(it => `
          <a href="${it.href}" class="${a('sb-item', sbActive(it.href))}"${ownAttr(it.ownerOnly)}>
            <span class="sb-icon">${it.icon}</span>
            <span class="sb-lbl">${it.label}</span>
          </a>`).join('')}
      </div>`).join('')}
  </nav>
  <div class="sb-footer">
    <div class="sb-user-name" id="sbUserName">–</div>
    <div class="sb-user-role" id="sbUserRole" style="font-size:11px;color:var(--gray-5);margin-top:2px"></div>
    <button class="sb-logout" onclick="posLogout()">🚪 Keluar</button>
  </div>
</aside>`;

  const topbarHTML = `
<div class="pos-topbar">
  <span class="pos-topbar-logo">🧺</span>
  <span class="pos-topbar-page">${pageTitle()}</span>
  <a href="/" id="tbAJBell" title="Order antar jemput belum diproses"
     style="display:none;margin-left:auto;margin-right:10px;text-decoration:none;
            font-size:13px;color:#B45309;background:#FFFBEB;border:1px solid #FDE68A;
            padding:4px 10px;border-radius:999px;font-weight:700">
    🛵 <span id="tbAJBellCount">0</span>
  </a>
  <span class="pos-topbar-user" id="tbUserName">–</span>
</div>`;

  const bottomNavHTML = `
<nav class="pos-bottom-nav" id="pos-bottom-nav">
  ${BOTTOM.map(it => `
    <a href="${it.href}" class="${a('bn-item', bnActive(it.href))}">
      <span class="bn-icon">${it.icon}</span>
      <span class="bn-label">${it.label}</span>
      ${it.badge ? `<span class="bn-badge" id="bnBadge-${it.badge}" style="display:none">0</span>` : ''}
    </a>`).join('')}
  <button class="${a('bn-item', isMoreActive())}" id="bn-more" onclick="openMoreSheet()" style="cursor:pointer">
    <span class="bn-icon">⋯</span>
    <span class="bn-label">Lainnya</span>
    <span class="bn-badge" id="bnBadge-more" style="display:none">0</span>
  </button>
</nav>
<div class="more-overlay" id="moreOverlay" onclick="closeMoreSheet()"></div>
<div class="more-sheet" id="moreSheet">
  <div class="more-sheet-handle"></div>
  <div class="more-sheet-title">Menu Lainnya</div>
  <div class="more-sheet-grid">
    ${MORE_ITEMS.map(it => `
      <a href="${it.href}" class="${a('more-grid-item', sbActive(it.href))}"${ownAttr(it.ownerOnly)} style="position:relative">
        <span class="mgi-icon">${it.icon}</span>
        <span class="mgi-label">${it.label}</span>
        ${it.badge ? `<span class="bn-badge" id="miBadge-${it.badge}" style="display:none;position:absolute;top:4px;right:4px">0</span>` : ''}
      </a>`).join('')}
  </div>
  <div class="more-sheet-footer">
    <span class="more-sheet-user" id="moreUserName">–</span>
    <button class="more-sheet-logout" onclick="posLogout()">Keluar</button>
  </div>
</div>`;

  /* ── Inject RBAC CSS (hide owner-only items sampai role diketahui) ─── */
  // Sembunyikan sebelum role tahu — hindari flicker "menu owner terlihat
  // sekilas" ke karyawan. Setelah role load, JS akan menghapus attribut
  // data-owner-only dari elemen kalau user = owner → elemen jadi normal.
  const rbacStyle = document.createElement('style');
  rbacStyle.textContent = `[data-owner-only="1"] { display: none !important; }`;
  document.head.appendChild(rbacStyle);

  /* ── Inject into DOM ───────────────────────────────────── */
  document.body.insertAdjacentHTML('afterbegin', sidebarHTML + topbarHTML);
  document.body.insertAdjacentHTML('beforeend', bottomNavHTML);

  /* ── Auto-load shared bottom sheets (lunasi + WA) ─────── */
  ['/js/lunasi-sheet.js', '/js/wa-sheet.js'].forEach(src => {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement('script');
    s.src = src;
    s.defer = false;
    document.body.appendChild(s);
  });

  // Wrap all existing content in .pos-main
  const skipClasses = ['pos-sidebar','pos-topbar','pos-bottom-nav','more-overlay','more-sheet'];
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
      // Cache di localStorage untuk akses cepat (fallback)
      try { localStorage.setItem('pos_user_role', role); } catch (_) {}

      ['sbUserName','tbUserName','moreUserName'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = name;
      });
      const roleEl = document.getElementById('sbUserRole');
      if (roleEl) roleEl.textContent = role === 'owner' ? '👑 Owner' : '👥 Karyawan';
      const legacy = document.getElementById('userName');
      if (legacy) legacy.textContent = name;

      // Tandai body sesuai role
      document.body.classList.add(`role-${role}`);

      // Owner: hilangkan attribut data-owner-only supaya elemen visible normal
      if (role === 'owner') {
        document.querySelectorAll('[data-owner-only="1"]').forEach(el => {
          el.removeAttribute('data-owner-only');
        });
      }

      // Dispatch event supaya halaman-halaman bisa react (mis. hide tombol)
      window.dispatchEvent(new CustomEvent('pos:role-loaded', { detail: { role } }));
    })
    .catch(() => {});

  /* ── Load badge: tagihan belum lunas + AJ belum diproses ── */
  const refreshTagihanBadge = () => {
    fetch('/api/v1/dashboard', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const n = Number(d.tagihan_belum_lunas || 0);
        const el = document.getElementById('bnBadge-tagihan');
        if (el) {
          if (n > 0) {
            el.textContent = n > 99 ? '99+' : n;
            el.style.display = '';
          } else {
            el.style.display = 'none';
          }
        }

        const ajCount = Number(d.antar_jemput_belum_diproses || 0);
        const bell = document.getElementById('tbAJBell');
        const bellCount = document.getElementById('tbAJBellCount');
        if (bell && bellCount) {
          if (ajCount > 0) {
            bellCount.textContent = ajCount;
            bell.title = `🛵 ${ajCount} order antar jemput hari ini belum dihitung`;
            bell.style.display = '';
          } else {
            bell.style.display = 'none';
          }
        }

        const rj = Number(d.reservasi_jemput_hari_ini || 0);
        const setBadge = (id, val) => {
          const e = document.getElementById(id);
          if (!e) return;
          if (val > 0) { e.textContent = val > 99 ? '99+' : val; e.style.display = ''; }
          else         { e.style.display = 'none'; }
        };
        setBadge('miBadge-reservasi', rj);
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

  // Helper untuk halaman lain: cek apakah user saat ini owner.
  // Sinkron: pakai window.currentUserRole (sudah di-set setelah role load)
  // atau fallback ke localStorage. Halaman yang butuh nunggu bisa listen
  // event 'pos:role-loaded'.
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
