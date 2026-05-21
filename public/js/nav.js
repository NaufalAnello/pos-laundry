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
    if (href === '/order') return p === '/order' || p === '/order/baru';
    return p === href;
  };

  const isMoreActive = () => {
    const main = ['/', '/order', '/order/baru', '/wa-center', '/pelanggan'];
    return !main.includes(p);
  };

  /* ── Nav data ──────────────────────────────────────────── */
  const NAV = [
    {
      group: 'Operasional',
      items: [
        { href: '/',          icon: '🏠', label: 'Dashboard'   },
        { href: '/order/baru', icon: '➕', label: 'Order Baru'  },
        { href: '/order',      icon: '📋', label: 'Kelola Order' },
      ]
    },
    {
      group: 'Keuangan',
      items: [
        { href: '/kas',     icon: '💰', label: 'Buku Kas' },
        { href: '/deposit', icon: '💳', label: 'Deposit'  },
        { href: '/laporan', icon: '📊', label: 'Laporan'  },
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
        { href: '/pengaturan', icon: '⚙️', label: 'Pengaturan' },
      ]
    }
  ];

  const BOTTOM = [
    { href: '/',          icon: '🏠', label: 'Home'     },
    { href: '/order',     icon: '📋', label: 'Order'    },
    { href: '/wa-center', icon: '💬', label: 'WhatsApp' },
    { href: '/pelanggan', icon: '👤', label: 'Pelanggan'},
  ];

  const MORE_ITEMS = [
    { href: '/order/baru', icon: '➕', label: 'Order Baru' },
    { href: '/kas',        icon: '💰', label: 'Buku Kas'   },
    { href: '/deposit',    icon: '💳', label: 'Deposit'    },
    { href: '/promo',      icon: '🎁', label: 'Promo'      },
    { href: '/poin',       icon: '⭐', label: 'Poin'       },
    { href: '/laporan',    icon: '📊', label: 'Laporan'    },
    { href: '/layanan',    icon: '🧺', label: 'Layanan'    },
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
  <span class="pos-topbar-user" id="tbUserName">–</span>
</div>`;

  const bottomNavHTML = `
<nav class="pos-bottom-nav" id="pos-bottom-nav">
  ${BOTTOM.map(it => `
    <a href="${it.href}" class="${a('bn-item', bnActive(it.href))}">
      <span class="bn-icon">${it.icon}</span>
      <span class="bn-label">${it.label}</span>
    </a>`).join('')}
  <button class="${a('bn-item', isMoreActive())}" id="bn-more" onclick="openMoreSheet()" style="cursor:pointer">
    <span class="bn-icon">⋯</span>
    <span class="bn-label">More</span>
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
