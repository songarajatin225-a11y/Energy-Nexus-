/**
 * Energy Nexus — application shell.
 *
 * Owns everything common to every screen: the sidebar and topbar, theme,
 * demo mode, the selected site, formatting, and the overlay primitives
 * (toast, modal, drawer). Page modules listen for `enx:ready` and render
 * into the page body the shell has already prepared.
 */
window.ENX = window.ENX || {};

/* ==========================================================================
   Formatting — one implementation, used by every screen
   ========================================================================== */
ENX.fmt = (function () {
  const nf = (d) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

  /** Indian currency with crore/lakh compaction. */
  function inr(value, opts) {
    const o = opts || {};
    const v = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (!o.exact && v >= 1e7) return `${sign}₹${nf(2).format(v / 1e7)} Cr`;
    if (!o.exact && v >= 1e5) return `${sign}₹${nf(2).format(v / 1e5)} L`;
    return `${sign}₹${nf(0).format(Math.round(v))}`;
  }

  const num = (v, d) => nf(d === undefined ? 2 : d).format(v || 0);
  const mw = (v, d) => `${nf(d === undefined ? 2 : d).format(v || 0)} MW`;
  const mwh = (v, d) => `${nf(d === undefined ? 1 : d).format(v || 0)} MWh`;
  const pct = (v, d) => `${nf(d === undefined ? 1 : d).format(v || 0)}%`;

  /** Minute-of-day → HH:MM, the canonical timestamp across the demo dataset. */
  function clock(minuteOfDay) {
    const m = ((minuteOfDay % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  /** Relative age against the current wall clock, for alert and audit lists. */
  function ago(minuteOfDay) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let diff = nowMin - minuteOfDay;
    if (diff < 0) diff += 1440;
    if (diff < 1) return 'just now';
    if (diff < 60) return `${diff}m ago`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  const tco2 = (v) => `${nf(2).format(v || 0)} tCO₂e`;

  /** Slug for CSS modifier classes, e.g. "PENDING APPROVAL" → "pending-approval". */
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return { inr, num, mw, mwh, pct, clock, ago, tco2, slug };
})();

/* ==========================================================================
   Persistent state
   ========================================================================== */
ENX.state = (function () {
  const KEY = 'enx.state.v1';
  const defaults = {
    theme: 'dark',
    demo: true,
    motion: 'on',
    siteId: 'ENX-HSR-001',
    org: 'Nexus Industrial Group',
    sidebar: 'expanded',
  };

  let state;
  try {
    state = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch (e) {
    state = Object.assign({}, defaults);
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode — session only */ }
  }

  function set(key, value) {
    if (state[key] === value) return;
    state[key] = value;
    save();
    document.dispatchEvent(new CustomEvent('enx:state', { detail: { key, value } }));
  }

  return {
    get: (k) => state[k],
    set,
    all: () => Object.assign({}, state),
  };
})();

/* ==========================================================================
   Overlay primitives
   ========================================================================== */
ENX.ui = (function () {
  /* ---- toast ---- */
  function toast(message, kind, ms) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `toast${kind ? ` toast--${kind}` : ''}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.dataset.leaving = 'true';
      setTimeout(() => el.remove(), 260);
    }, ms || 3400);
  }

  /* ---- modal ---- */
  let modalEl = null;
  let lastFocus = null;

  function modal(opts) {
    closeModal();
    lastFocus = document.activeElement;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(opts.title || 'Dialog')}">
        <div class="modal__header">
          <div>
            ${opts.eyebrow ? `<div class="eyebrow">${escapeHTML(opts.eyebrow)}</div>` : ''}
            <h2 class="card__title" style="font-size:var(--fs-lg);margin-top:2px">${escapeHTML(opts.title || '')}</h2>
            ${opts.desc ? `<p class="card__desc">${escapeHTML(opts.desc)}</p>` : ''}
          </div>
          <button class="btn btn--icon btn--ghost" data-modal-close aria-label="Close dialog">
            ${ENX.router.iconHTML('close')}
          </button>
        </div>
        <div class="modal__body">${opts.body || ''}</div>
        ${opts.footer ? `<div class="modal__footer">${opts.footer}</div>` : ''}
      </div>`;

    document.body.appendChild(backdrop);
    modalEl = backdrop;
    requestAnimationFrame(() => { backdrop.dataset.open = 'true'; });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-modal-close]')) closeModal();
    });
    trapFocus(backdrop.querySelector('.modal'));
    if (opts.onMount) opts.onMount(backdrop.querySelector('.modal__body'), backdrop);
    return backdrop;
  }

  function closeModal() {
    if (!modalEl) return;
    const el = modalEl;
    modalEl = null;
    el.dataset.open = 'false';
    setTimeout(() => el.remove(), 220);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---- drawer ---- */
  function drawer(opts) {
    let el = document.querySelector('.drawer[data-role="inspector"]');
    if (!el) {
      el = document.createElement('aside');
      el.className = 'drawer';
      el.dataset.role = 'inspector';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'false');
      document.body.appendChild(el);
    }
    el.setAttribute('aria-label', opts.title || 'Details');
    el.innerHTML = `
      <div class="drawer__header">
        <div style="min-width:0">
          ${opts.eyebrow ? `<div class="eyebrow">${escapeHTML(opts.eyebrow)}</div>` : ''}
          <h2 class="card__title" style="font-size:var(--fs-lg);margin-top:3px">${escapeHTML(opts.title || '')}</h2>
          ${opts.desc ? `<p class="card__desc">${escapeHTML(opts.desc)}</p>` : ''}
        </div>
        <button class="btn btn--icon btn--ghost" data-drawer-close aria-label="Close panel">
          ${ENX.router.iconHTML('close')}
        </button>
      </div>
      <div class="drawer__body">${opts.body || ''}</div>
      ${opts.footer ? `<div class="drawer__footer">${opts.footer}</div>` : ''}`;

    el.querySelector('[data-drawer-close]').addEventListener('click', closeDrawer);
    requestAnimationFrame(() => { el.dataset.open = 'true'; });
    if (opts.onMount) opts.onMount(el.querySelector('.drawer__body'), el);
    return el;
  }

  function closeDrawer() {
    const el = document.querySelector('.drawer[data-role="inspector"]');
    if (el) el.dataset.open = 'false';
    document.querySelectorAll('[data-selected="true"]').forEach((n) => { n.dataset.selected = 'false'; });
  }

  /* ---- focus trap for modals ---- */
  function trapFocus(container) {
    const focusables = () => Array.from(container.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'
    )).filter((el) => el.offsetParent !== null);

    const first = focusables()[0];
    if (first) first.focus();

    container.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const idx = list.indexOf(document.activeElement);
      if (e.shiftKey && idx <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
      else if (!e.shiftKey && idx === list.length - 1) { e.preventDefault(); list[0].focus(); }
    });
  }

  /* ---- animated counters ---- */
  function countUp(el, target, opts) {
    const o = opts || {};
    const dur = o.duration || 1100;
    const decimals = o.decimals === undefined ? 2 : o.decimals;
    const format = o.format || ((v) => v.toFixed(decimals));

    if (prefersReducedMotion()) { el.textContent = format(target); return; }

    const start = performance.now();
    const from = o.from || 0;
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      // easeOutExpo — fast settle, no bounce.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = format(from + (target - from) * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function prefersReducedMotion() {
    return ENX.state.get('motion') === 'off'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---- escaping ---- */
  function escapeHTML(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const escapeAttr = escapeHTML;

  /** Render a status pill from any status string. */
  function pill(status, extraClass) {
    const cls = ENX.fmt.slug(status);
    return `<span class="pill pill--${cls}${extraClass ? ` ${extraClass}` : ''}">
      <span class="pill__dot"></span>${escapeHTML(status)}</span>`;
  }

  function tierBadge(tier) {
    return `<span class="tier-badge tier-badge--${tier}">TIER ${tier}</span>`;
  }

  /* Global escape handling for every overlay. */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modalEl) { closeModal(); return; }
    const d = document.querySelector('.drawer[data-open="true"]');
    if (d) { closeDrawer(); return; }
    const app = document.querySelector('.app');
    if (app && app.dataset.mobileNav === 'open') app.dataset.mobileNav = 'closed';
  });

  return {
    toast, modal, closeModal, drawer, closeDrawer,
    countUp, prefersReducedMotion, escapeHTML, escapeAttr, pill, tierBadge,
  };
})();

/* ==========================================================================
   Auth — a DEMO GATE, not security.

   This is a static site with no backend. The check below runs entirely in the
   visitor's browser, so it can be bypassed with devtools, and every dataset in
   /data is publicly readable regardless. It exists to make the prototype feel
   like a real product, not to protect anything. A real deployment authenticates
   server-side (SSO / OIDC) and never ships a credential to the client.

   The password is stored as a SHA-256 digest only so that "view source" does
   not print it in plain text. That is obfuscation, not protection.
   ========================================================================== */
ENX.auth = (function () {
  const KEY = 'enx.session.v1';
  const PW_SHA256 = 'ff0a5f39b703f6d02441f3b42aa02af28bc400cd8193ffd8fb1f4c4d245444c5';

  // Pages reachable without a session.
  const PUBLIC = ['index', 'login', '404'];

  function session() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  const isSignedIn = () => !!session();

  async function digest(text) {
    if (!window.crypto || !crypto.subtle) {
      throw new Error('Password checking needs a secure context. Open the site over HTTPS or localhost.');
    }
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function verify(password) {
    return (await digest(password)) === PW_SHA256;
  }

  /** @param {boolean} remember persist across browser restarts rather than the tab session */
  function start(email, remember) {
    const value = JSON.stringify({
      email,
      name: nameFromEmail(email),
      since: Date.now(),
      demo: !email,
    });
    try {
      (remember ? localStorage : sessionStorage).setItem(KEY, value);
    } catch (e) { /* private mode — the guard simply won't hold */ }
  }

  function signOut() {
    try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch (e) { /* nothing stored */ }
    location.href = 'login.html';
  }

  function nameFromEmail(email) {
    if (!email) return 'Demo User';
    const local = String(email).split('@')[0].replace(/[._-]+/g, ' ');
    return local.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /** Redirect to the sign-in screen unless this page is public or a session exists. */
  function guard() {
    const page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    if (PUBLIC.includes(page) || isSignedIn()) return true;
    const back = encodeURIComponent(page);
    location.replace(`login.html?next=${back}`);
    return false;
  }

  return { isSignedIn, session, verify, digest, start, signOut, guard, PUBLIC };
})();

/* ==========================================================================
   Demo mode — a deterministic clock that advances simulated telemetry
   ========================================================================== */
ENX.demo = (function () {
  let timer = null;
  let offset = 0;          // steps advanced beyond wall clock
  let phase = 0;           // continuous phase for smooth value wobble

  function enabled() { return ENX.state.get('demo') === true; }

  function start() {
    stop();
    if (!enabled()) return;
    timer = setInterval(tick, 3000);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function tick() {
    phase += 1;
    // Advance the telemetry cursor one 15-minute step every 4 ticks (~12s),
    // so the profile visibly moves without racing through the day.
    if (phase % 4 === 0) offset += 1;
    document.dispatchEvent(new CustomEvent('enx:tick', { detail: { offset, phase } }));
  }

  /** Current telemetry index: wall clock plus any demo advance. */
  function index(intervalMinutes) {
    const base = ENX.data.currentIndex(intervalMinutes || 15);
    const steps = 1440 / (intervalMinutes || 15);
    return (base + (enabled() ? offset : 0)) % steps;
  }

  /** Small deterministic wobble so live readouts breathe without lying. */
  function wobble(seed, amplitude) {
    if (!enabled()) return 0;
    return Math.sin((phase + seed * 7.3) * 0.6) * (amplitude || 1);
  }

  return { start, stop, tick, index, enabled, wobble, get offset() { return offset; } };
})();

/* ==========================================================================
   Shell rendering
   ========================================================================== */
ENX.shell = (function () {
  const esc = (s) => ENX.ui.escapeHTML(s);

  function currentPageId() {
    const file = location.pathname.split('/').pop() || 'index.html';
    return file.replace(/\.html$/, '') || 'index';
  }

  function buildSidebar(activeId) {
    const groups = ENX.router.NAV.map((group) => `
      <div class="sidebar__group">
        <div class="sidebar__group-label">${esc(group.label)}</div>
        ${group.items.map((item) => navItem(item, activeId)).join('')}
      </div>`).join('');

    const footer = ENX.router.FOOTER.map((item) => navItem(item, activeId)).join('');

    return `
      <aside class="sidebar" id="sidebar">
        <a class="sidebar__brand" href="index.html" aria-label="Energy Nexus home">
          <img class="sidebar__mark" src="assets/logo-mark.svg" alt="" width="30" height="30">
          <span class="sidebar__wordmark">
            <strong>ENERGY NEXUS</strong>
            <span>Industrial Energy OS</span>
          </span>
        </a>
        <nav class="sidebar__nav" aria-label="Primary">
          ${groups}
        </nav>
        <div class="sidebar__footer">
          ${footer}
        </div>
      </aside>`;
  }

  function navItem(item, activeId) {
    const active = item.id === activeId;
    // data-tip surfaces the label as a hover chip once the sidebar is collapsed.
    return `
      <a class="nav-item has-tip" href="${item.href}" data-tip="${esc(item.label)}"${active ? ' aria-current="page"' : ''}>
        ${ENX.router.iconHTML(item.icon, 'nav-item__icon')}
        <span class="nav-item__label">${esc(item.label)}</span>
        ${item.badge ? `<span class="nav-item__badge${item.future ? ' nav-item__badge--future' : ''}">${esc(item.badge)}</span>` : ''}
      </a>`;
  }

  function buildTopbar(sites) {
    const siteOptions = sites
      ? sites.sites.map((s) => `<option value="${esc(s.siteId)}"${s.siteId === ENX.state.get('siteId') ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
      : '';

    return `
      <header class="topbar">
        <button class="topbar__toggle" data-action="toggle-sidebar" aria-label="Toggle navigation" aria-expanded="true">
          ${ENX.router.iconHTML('menu')}
        </button>

        <div class="row" data-topbar-optional style="gap:var(--sp-2)">
          <select class="select" style="width:auto;max-width:190px" aria-label="Organisation" data-action="org-select">
            <option>Nexus Industrial Group</option>
            <option>Southern Auto Cluster</option>
            <option>Demo Tenant</option>
          </select>
          <select class="select" style="width:auto;max-width:220px" aria-label="Active site" data-action="site-select">
            ${siteOptions}
          </select>
        </div>

        <button class="topbar__search" data-action="open-palette" aria-label="Search sites, assets and screens">
          ${ENX.router.iconHTML('search')}
          <span>Search…</span>
          <kbd class="topbar__kbd">${navigator.platform.indexOf('Mac') === 0 ? '⌘' : 'Ctrl'} K</kbd>
        </button>

        <div class="topbar__spacer"></div>

        <div class="topbar__clock" data-topbar-optional>
          <b data-clock>--:--:--</b> IST
        </div>

        <span class="pill pill--live pill--pulse has-tip" data-tip="Edge gateways connected">
          <span class="pill__dot"></span>LIVE
        </span>

        <button class="switch" data-action="toggle-demo" aria-pressed="${ENX.state.get('demo')}"
                aria-label="Toggle demo mode" title="Demo mode streams simulated telemetry">
          <span class="switch__track"><span class="switch__thumb"></span></span>
          <span class="switch__label" data-topbar-optional>Demo</span>
        </button>

        <button class="btn btn--icon btn--ghost" data-action="toggle-theme" aria-label="Toggle colour theme">
          ${ENX.router.iconHTML('sun')}
        </button>

        <button class="btn btn--icon btn--ghost" data-action="notifications" aria-label="Notifications"
                style="position:relative">
          ${ENX.router.iconHTML('bell')}
          <span data-notif-dot style="position:absolute;top:6px;right:6px;width:6px;height:6px;
                border-radius:50%;background:var(--accent-red);display:none"></span>
        </button>

        <button class="btn btn--icon btn--ghost" data-action="profile" aria-label="User profile">
          ${ENX.router.iconHTML('user')}
        </button>
      </header>`;
  }

  function demoBanner() {
    return `
      <div class="demo-banner" data-demo-banner${ENX.state.get('demo') ? '' : ' hidden'}>
        <span class="demo-banner__dot"></span>
        <span>Simulated telemetry — demonstration environment. Values are modelled, not actual customer data.</span>
      </div>`;
  }

  /** Build the shell around the page's existing <main> content. */
  function render(sites) {
    const app = document.querySelector('.app');
    if (!app) return;

    const activeId = currentPageId();
    const pageContent = app.innerHTML;

    app.innerHTML = `
      ${buildSidebar(activeId)}
      <div class="main">
        <div class="load-bar" data-load-bar aria-hidden="true"><span></span></div>
        ${buildTopbar(sites)}
        ${demoBanner()}
        ${pageContent}
      </div>`;

    app.dataset.sidebar = ENX.state.get('sidebar');
    app.dataset.mobileNav = 'closed';

    if (!document.querySelector('.scrim')) {
      const scrim = document.createElement('div');
      scrim.className = 'scrim';
      scrim.addEventListener('click', () => { app.dataset.mobileNav = 'closed'; scrim.dataset.open = 'false'; });
      document.body.appendChild(scrim);
    }

    wireTopbar(app, sites);
    startClock();
    updateThemeIcon();
    wireLoadBar();
    ENX.palette.install(sites);
  }

  /** Top progress bar, driven by in-flight dataset fetches. */
  function wireLoadBar() {
    const bar = document.querySelector('[data-load-bar]');
    if (!bar) return;
    document.addEventListener('enx:loading', (e) => {
      bar.dataset.active = String(e.detail.pending > 0);
    });
  }

  function wireTopbar(app, sites) {
    app.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'toggle-sidebar') {
        if (window.matchMedia('(max-width: 767px)').matches) {
          const open = app.dataset.mobileNav === 'open';
          app.dataset.mobileNav = open ? 'closed' : 'open';
          const scrim = document.querySelector('.scrim');
          if (scrim) scrim.dataset.open = String(!open);
          btn.setAttribute('aria-expanded', String(!open));
        } else {
          const collapsed = app.dataset.sidebar === 'collapsed';
          app.dataset.sidebar = collapsed ? 'expanded' : 'collapsed';
          ENX.state.set('sidebar', app.dataset.sidebar);
          btn.setAttribute('aria-expanded', String(collapsed));
        }
      }

      if (action === 'toggle-demo') {
        const on = ENX.state.get('demo');
        ENX.state.set('demo', !on);
        btn.setAttribute('aria-pressed', String(!on));
        const banner = document.querySelector('[data-demo-banner]');
        if (banner) banner.hidden = on;
        if (!on) { ENX.demo.start(); ENX.ui.toast('Demo mode on — streaming simulated telemetry', 'positive'); }
        else { ENX.demo.stop(); ENX.ui.toast('Demo mode off — values held at last reading'); }
      }

      if (action === 'toggle-theme') {
        const next = ENX.state.get('theme') === 'dark' ? 'light' : 'dark';
        ENX.state.set('theme', next);
        applyTheme();
        updateThemeIcon();
        document.dispatchEvent(new CustomEvent('enx:theme', { detail: { theme: next } }));
      }

      if (action === 'notifications') openNotifications();
      if (action === 'profile') openProfile();
      if (action === 'open-palette') ENX.palette.open();
    });

    const siteSelect = app.querySelector('[data-action="site-select"]');
    if (siteSelect) {
      siteSelect.addEventListener('change', (e) => {
        ENX.state.set('siteId', e.target.value);
        const site = sites.sites.find((s) => s.siteId === e.target.value);
        ENX.ui.toast(`Active site: ${site ? site.name : e.target.value}`);
        document.dispatchEvent(new CustomEvent('enx:sitechange', { detail: { siteId: e.target.value } }));
      });
    }

    const orgSelect = app.querySelector('[data-action="org-select"]');
    if (orgSelect) {
      orgSelect.addEventListener('change', (e) => {
        ENX.state.set('org', e.target.value);
        ENX.ui.toast(`Organisation: ${e.target.value}`);
      });
    }

    // "/" and ⌘K / Ctrl+K both open the command palette.
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        ENX.palette.open();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        ENX.palette.open();
      }
    });
  }

  /* ---- notifications ---- */
  function openNotifications() {
    const alerts = ENX.data.peek('alerts');
    if (!alerts) { ENX.ui.toast('Alerts still loading…'); return; }

    const list = alerts.alerts.slice().sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 12);
    ENX.ui.drawer({
      eyebrow: 'Alert centre',
      title: 'Notifications',
      desc: `${alerts.alerts.filter((a) => !a.acknowledged).length} unacknowledged across the estate`,
      body: `<div class="stack" style="gap:0">${list.map(alertRowHTML).join('')}</div>`,
      footer: `<a class="btn btn--block" href="dashboard.html#alerts">Open alert centre</a>`,
    });
  }

  function severityRank(s) {
    return { CRITICAL: 0, WARNING: 1, OPTIMISATION: 2, 'AI INSIGHT': 3 }[s] ?? 4;
  }

  function alertRowHTML(a) {
    const kind = ENX.fmt.slug(a.severity === 'AI INSIGHT' ? 'insight' : a.severity);
    return `
      <div class="alert-row alert-row--${kind}">
        <div class="alert-row__spine"></div>
        <div style="min-width:0">
          <div class="row row--between" style="align-items:flex-start">
            <div class="alert-row__title">${esc(a.title)}</div>
            <span class="pill pill--${kind}">${esc(a.severity)}</span>
          </div>
          <div class="alert-row__detail">${esc(a.detail)}</div>
          <div class="alert-row__meta">
            <span>${esc(a.siteName)}</span><span>·</span>
            <span>${esc(a.assetName)}</span><span>·</span>
            <span>${ENX.fmt.ago(a.minuteOfDay)}</span>
            ${a.financialImpactINR ? `<span>·</span><span class="text-positive">${ENX.fmt.inr(a.financialImpactINR)}</span>` : ''}
          </div>
        </div>
      </div>`;
  }

  /* ---- profile ---- */
  function openProfile() {
    const s = ENX.auth.session();
    ENX.ui.modal({
      eyebrow: s && s.demo ? 'Demo session' : 'Signed in',
      title: s ? s.name : 'Demo User',
      desc: `${s && s.email ? s.email : 'No account'} · ${ENX.state.get('org')}`,
      body: `
        <div class="stack">
          <div class="metric-row"><span class="metric-row__label">Role</span><span class="metric-row__value">Energy Manager</span></div>
          <div class="metric-row"><span class="metric-row__label">Control permission</span><span class="metric-row__value">Tier 2 approve</span></div>
          <div class="metric-row"><span class="metric-row__label">Sites in scope</span><span class="metric-row__value">8</span></div>
          <div class="metric-row"><span class="metric-row__label">Two-key authority</span><span class="metric-row__value">Customer key holder</span></div>
          <div class="callout callout--info">
            ${ENX.router.iconHTML('safety')}
            <div>Write access to any new asset needs both a Nexus commissioning engineer and a named
            customer engineer. Every write is recorded in the command audit.</div>
          </div>
        </div>`,
      footer: `<a class="btn" href="settings.html">Settings</a>
               <button class="btn btn--danger" data-sign-out>Sign out</button>
               <button class="btn btn--primary" data-modal-close>Close</button>`,
      onMount: (body, backdrop) => {
        backdrop.querySelector('[data-sign-out]').addEventListener('click', () => ENX.auth.signOut());
      },
    });
  }

  /* ---- clock ---- */
  function startClock() {
    const el = document.querySelector('[data-clock]');
    if (!el) return;
    const paint = () => {
      const d = new Date();
      el.textContent = d.toLocaleTimeString('en-GB', { hour12: false });
    };
    paint();
    setInterval(paint, 1000);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = ENX.state.get('theme');
    document.documentElement.dataset.motion = ENX.state.get('motion');
  }

  function updateThemeIcon() {
    const btn = document.querySelector('[data-action="toggle-theme"]');
    if (!btn) return;
    const dark = ENX.state.get('theme') === 'dark';
    btn.innerHTML = ENX.router.iconHTML(dark ? 'sun' : 'moon');
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  return { render, applyTheme, alertRowHTML, openNotifications, currentPageId };
})();

/* ==========================================================================
   Command palette — ⌘K / Ctrl+K / "/"
   One index over screens, sites, assets and actions, with keyboard navigation.
   ========================================================================== */
ENX.palette = (function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let el = null;
  let items = [];
  let filtered = [];
  let cursor = 0;
  let sitesRef = null;

  const ACTIONS = [
    { kind: 'Action', label: 'Toggle theme', sub: 'Switch between dark and light', run: () => {
      ENX.state.set('theme', ENX.state.get('theme') === 'dark' ? 'light' : 'dark');
      ENX.shell.applyTheme();
      document.dispatchEvent(new CustomEvent('enx:theme'));
    } },
    { kind: 'Action', label: 'Toggle demo mode', sub: 'Start or stop simulated telemetry', run: () => {
      const on = ENX.state.get('demo');
      ENX.state.set('demo', !on);
      const btn = document.querySelector('[data-action="toggle-demo"]');
      if (btn) btn.setAttribute('aria-pressed', String(!on));
      const banner = document.querySelector('[data-demo-banner]');
      if (banner) banner.hidden = on;
      if (!on) ENX.demo.start(); else ENX.demo.stop();
    } },
    { kind: 'Action', label: 'Sign out', sub: 'End this session', run: () => ENX.auth.signOut() },
  ];

  function install(sites) { sitesRef = sites; }

  function buildIndex() {
    const pages = ENX.router.allPages().map((p) => ({
      kind: 'Screen', label: p.label, sub: p.group, href: p.href,
    }));
    const siteHits = (sitesRef ? sitesRef.sites : []).map((s) => ({
      kind: 'Site', label: s.name, sub: `${s.location} · ${s.siteId}`,
      href: `site-detail.html?site=${s.siteId}`,
    }));
    const assets = ENX.data.peek('assets');
    const assetHits = (assets ? assets.assets : []).map((a) => ({
      kind: 'Asset', label: a.name, sub: `${a.siteName} · ${a.assetId}`,
      href: `assets.html?asset=${a.assetId}`,
    }));
    return [].concat(pages, siteHits, assetHits, ACTIONS);
  }

  /** Subsequence match, so "cmdc" finds "Command Center". */
  function score(item, q) {
    if (!q) return item.kind === 'Screen' ? 1 : 0.5;
    const hay = `${item.label} ${item.sub}`.toLowerCase();
    const idx = hay.indexOf(q);
    if (idx === 0) return 100;
    if (idx > 0) return 60 - Math.min(idx, 30);
    let i = 0;
    for (const ch of hay) { if (ch === q[i]) i += 1; if (i === q.length) return 20; }
    return 0;
  }

  function open() {
    if (el) { el.querySelector('[data-pal-input]').focus(); return; }
    items = buildIndex();

    el = document.createElement('div');
    el.className = 'modal-backdrop palette-backdrop';
    el.innerHTML = `
      <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="palette__search">
          ${ENX.router.iconHTML('search')}
          <input class="palette__input" data-pal-input type="text" autocomplete="off" spellcheck="false"
                 placeholder="Search screens, sites, assets or actions…" aria-label="Search"
                 aria-controls="palette-list" aria-expanded="true">
          <kbd class="topbar__kbd">esc</kbd>
        </div>
        <ul class="palette__list" id="palette-list" role="listbox" data-pal-list></ul>
        <div class="palette__foot">
          <span><kbd class="topbar__kbd">↑</kbd><kbd class="topbar__kbd">↓</kbd> navigate</span>
          <span><kbd class="topbar__kbd">↵</kbd> open</span>
          <span><kbd class="topbar__kbd">esc</kbd> close</span>
        </div>
      </div>`;

    document.body.appendChild(el);
    requestAnimationFrame(() => { el.dataset.open = 'true'; });

    const input = el.querySelector('[data-pal-input]');
    input.addEventListener('input', () => paint(input.value));
    input.addEventListener('keydown', onKey);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });

    paint('');
    input.focus();
  }

  function paint(query) {
    const q = String(query || '').trim().toLowerCase();
    filtered = items
      .map((it) => ({ it, s: score(it, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.it);
    cursor = 0;
    renderList();
  }

  function renderList() {
    const list = el.querySelector('[data-pal-list]');
    if (!filtered.length) {
      list.innerHTML = `<li class="palette__empty">No matches. Try a site name, an asset ID, or a screen.</li>`;
      return;
    }
    list.innerHTML = filtered.map((it, i) => `
      <li>
        <button class="palette__item" role="option" data-pal-index="${i}"
                aria-selected="${i === cursor}">
          <span class="palette__kind palette__kind--${ENX.fmt.slug(it.kind)}">${esc(it.kind)}</span>
          <span class="palette__text">
            <span class="palette__label">${esc(it.label)}</span>
            <span class="palette__sub">${esc(it.sub)}</span>
          </span>
        </button>
      </li>`).join('');

    list.querySelectorAll('[data-pal-index]').forEach((btn) => {
      btn.addEventListener('click', () => choose(filtered[Number(btn.dataset.palIndex)]));
      btn.addEventListener('mousemove', () => {
        cursor = Number(btn.dataset.palIndex);
        list.querySelectorAll('[data-pal-index]').forEach((b, i) =>
          b.setAttribute('aria-selected', String(i === cursor)));
      });
    });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!filtered.length) return;
      cursor = (cursor + (e.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
      const list = el.querySelector('[data-pal-list]');
      list.querySelectorAll('[data-pal-index]').forEach((b, i) =>
        b.setAttribute('aria-selected', String(i === cursor)));
      const active = list.querySelector(`[data-pal-index="${cursor}"]`);
      if (active) active.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); choose(filtered[cursor]); }
  }

  function choose(item) {
    if (!item) return;
    close();
    if (item.run) { item.run(); return; }
    location.href = item.href;
  }

  function close() {
    if (!el) return;
    const node = el;
    el = null;
    node.dataset.open = 'false';
    setTimeout(() => node.remove(), 180);
  }

  return { open, close, install };
})();

/* ==========================================================================
   Export helpers — CSV and print, used by the asset register and reports
   ========================================================================== */
ENX.report = (function () {
  /** Quote a CSV field only when it needs it, escaping embedded quotes. */
  function cell(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /**
   * Download an array of flat objects as CSV.
   * Real file download — this is a static site, not a sandboxed frame.
   */
  function exportCSV(filename, rows) {
    if (!rows || !rows.length) { ENX.ui.toast('Nothing to export for the current filters', 'warning'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(',')]
      .concat(rows.map((r) => headers.map((h) => cell(r[h])).join(',')))
      .join('\n');

    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ENX.ui.toast(`Exported ${rows.length} rows to CSV`, 'positive');
  }

  function print() {
    ENX.ui.toast('Preparing print view…');
    setTimeout(() => window.print(), 300);
  }

  return { exportCSV, print };
})();

/* ==========================================================================
   Boot
   ========================================================================== */
(function boot() {
  // Theme must apply before first paint to avoid a flash of the wrong mode.
  ENX.shell.applyTheme();

  // Demo gate: redirect before any data loads. Public pages pass straight through.
  if (!ENX.auth.guard()) return;

  document.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('.app');

    // Landing and standalone pages opt out of the shell.
    if (!app) {
      document.dispatchEvent(new CustomEvent('enx:ready', { detail: {} }));
      return;
    }

    ENX.data.load('sites')
      .then((sites) => {
        ENX.shell.render(sites);
        ENX.demo.start();
        document.dispatchEvent(new CustomEvent('enx:ready', { detail: { sites } }));
      })
      .catch((err) => {
        // Fail loudly and legibly rather than leaving an empty screen.
        ENX.shell.render(null);
        const main = document.querySelector('.page') || document.body;
        main.insertAdjacentHTML('afterbegin', `
          <div class="callout callout--warning" style="margin-bottom:var(--sp-5)">
            ${ENX.router.iconHTML('alert')}
            <div><strong>Data layer unavailable.</strong> ${ENX.ui.escapeHTML(err.message)}</div>
          </div>`);
        document.dispatchEvent(new CustomEvent('enx:ready', { detail: { error: err } }));
      });
  });
})();
