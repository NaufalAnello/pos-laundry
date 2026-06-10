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
      items: [
        { href: '/kas',          icon: '📒', label: 'Buku Kas'    },
        { href: '/deposit',      icon: '💳', label: 'Deposit'     },
        { href: '/antar-jemput', icon: '🛵', label: 'Antar Jemput' },
        { href: '/laporan',      icon: '📊', label: 'Laporan'     },
      ]
    },
    {
      group: 'Marketing',
      items: [
        { href: '/promo',     icon: '🎁', label: 'Promo'     },
        { href: '/poin',      icon: '⭐', label: 'Poin'      },
        { href: '/pelanggan', icon: '👤', label: 'Pelanggan' },
        { href: '/wa-center', icon: '💬', label: 'Pusat WA'  },
      ]
    },
    {
      group: 'Master',
      items: [
        { href: '/layanan',    icon: '🧺', label: 'Layanan'    },
        { href: '/ai-insight', icon: '🤖', label: 'AI Insight'  },
        { href: '/pengaturan', icon: '⚙️', label: 'Pengaturan' },
      ]
    }
  ];

  // Bottom nav HP — fokus operasional harian
  const BOTTOM = [
    { href: '/',           icon: '🏠', label: 'Home'    },
    { href: '/order/baru', icon: '➕', label: 'Order'   },
    { href: '/order',      icon: '📋', label: 'Antrian' },
    { href: '/tagihan',    icon: '💰', label: 'Tagihan', badge: 'tagihan' },
  ];

  const MORE_ITEMS = [
    { href: '/kas',          icon: '📒', label: 'Buku Kas'    },
    { href: '/deposit',      icon: '💳', label: 'Deposit'     },
    { href: '/antar-jemput', icon: '🛵', label: 'Antar Jemput' },
    { href: '/promo',        icon: '🎁', label: 'Promo'       },
    { href: '/poin',       icon: '⭐', label: 'Poin'       },
    { href: '/pelanggan',  icon: '👤', label: 'Pelanggan'  },
    { href: '/wa-center',  icon: '💬', label: 'Pusat WA'   },
    { href: '/laporan',    icon: '📊', label: 'Laporan'    },
    { href: '/layanan',    icon: '🧺', label: 'Layanan'    },
    { href: '/ai-insight', icon: '🤖', label: 'AI Insight'  },
    { href: '/pengaturan', icon: '⚙️', label: 'Pengaturan' },
  ];

  /* ── Page title from <title> tag ───────────────────────── */
  const pageTitle = () => {
    const t = document.title.replace(/ ?[—–-] ?POS Laundry$/, '').trim();
    return t || 'POS Laundry';
  };

  /* ── Build HTML ────────────────────────────────────────── */
  const a = (cls, active) => active ? cls + ' active' : cls;

  const sidebarHTML = `
<aside class="pos-sidebar" id="pos-sidebar">
  <div class="sb-brand">
    <span class="sb-brand-icon">🧺</span>
    <span class="sb-brand-text">POS Laundry</span>
  </div>
  <nav class="sb-nav">
    ${NAV.map(g => `
      <div class="sb-group">
        <div class="sb-group-label">${g.group}</div>
        ${g.items.map(it => `
          <a href="${it.href}" class="${a('sb-item', sbActive(it.href))}">
            <span class="sb-icon">${it.icon}</span>
            <span class="sb-lbl">${it.label}</span>
          </a>`).join('')}
      </div>`).join('')}
  </nav>
  <div class="sb-footer">
    <div class="sb-user-name" id="sbUserName">–</div>
    <button class="sb-logout" onclick="posLogout()">🚪 Keluar</button>
  </div>
</aside>`;

  const topbarHTML = `
<div class="pos-topbar">
  <span class="pos-topbar-logo">🧺</span>
  <span class="pos-topbar-page">${pageTitle()}</span>
  <a href="/" id="tbAJBell" title="Order antar jemput belum diproses"
     style="display:none;margin-left:auto;margin-right:10px;text-decoration:none;
            font-size:13px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;
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
  </button>
</nav>
<div class="more-overlay" id="moreOverlay" onclick="closeMoreSheet()"></div>
<div class="more-sheet" id="moreSheet">
  <div class="more-sheet-handle"></div>
  <div class="more-sheet-title">Menu Lainnya</div>
  <div class="more-sheet-grid">
    ${MORE_ITEMS.map(it => `
      <a href="${it.href}" class="${a('more-grid-item', sbActive(it.href))}">
        <span class="mgi-icon">${it.icon}</span>
        <span class="mgi-label">${it.label}</span>
      </a>`).join('')}
  </div>
  <div class="more-sheet-footer">
    <span class="more-sheet-user" id="moreUserName">–</span>
    <button class="more-sheet-logout" onclick="posLogout()">Keluar</button>
  </div>
</div>`;

  /* ── Inject into DOM ───────────────────────────────────── */
  document.body.insertAdjacentHTML('afterbegin', sidebarHTML + topbarHTML);
  document.body.insertAdjacentHTML('beforeend', bottomNavHTML);

  // Wrap all existing content (not pos-sidebar, topbar, bottom-nav, overlays) in .pos-main
  const skipClasses = ['pos-sidebar','pos-topbar','pos-bottom-nav','more-overlay','more-sheet'];
  const wrap = document.createElement('div');
  wrap.className = 'pos-main';
  const toWrap = Array.from(document.body.children)
    .filter(el => !skipClasses.some(c => el.classList.contains(c)));
  toWrap.forEach(el => wrap.appendChild(el));
  // Insert wrap after the sidebar
  document.getElementById('pos-sidebar').insertAdjacentElement('afterend', wrap);

  /* ── Load user info ────────────────────────────────────── */
  fetch('/api/v1/auth/me', { credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      const name = d?.user?.nama || '–';
      ['sbUserName','tbUserName','moreUserName'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = name;
      });
      // Also fill legacy #userName if pages still have it
      const legacy = document.getElementById('userName');
      if (legacy) legacy.textContent = name;
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

        // AJ bell: tampilkan jika ada order AJ hari ini yang belum diproses
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
      })
      .catch(() => {});
  };
  refreshTagihanBadge();
  // Refresh tiap 60 detik supaya bell up-to-date tanpa reload
  setInterval(refreshTagihanBadge, 60000);
  window.posRefreshBadges = refreshTagihanBadge;

  /* ── Exposed globals ───────────────────────────────────── */
  window.posLogout = async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    location.href = '/login';
  };

  // Keep backward-compat — pages still call logout() from their own code
  if (!window.logout) {
    window.logout = window.posLogout;
  }

  window.openMoreSheet = () => {
    document.getElementById('moreOverlay').classList.add('open');
    document.getElementById('moreSheet').classList.add('open');
  };

  window.closeMoreSheet = () => {
    document.getElementById('moreOverlay').classList.remove('open');
    document.getElementById('moreSheet').classList.remove('open');
  };
})();
