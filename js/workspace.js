/**
 * Energy Nexus — workspace layer.
 *
 * Cross-screen conveniences that sit on top of the shell in app.js: pinned
 * screens, recently viewed, density, shareable links, keyboard navigation,
 * the notification feed, user-defined alert rules and the guided tour.
 *
 * Everything persists through ENX.state, so it survives reloads and follows
 * the visitor across screens. Nothing here invents data: alert rules are
 * evaluated against the same simulated telemetry every chart reads.
 */
window.ENX = window.ENX || {};

/* ==========================================================================
   Workspace — pins, recents, density, share links, keyboard navigation
   ========================================================================== */
ENX.workspace = (function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  const here = () => ENX.shell.currentPageId();
  const MAX_RECENTS = 8;

  /* ---- pins ---- */
  const pins = () => ENX.state.get('pins') || [];
  const isPinned = (id) => pins().includes(id);

  function togglePin(id) {
    const pageId = id || here();
    const page = ENX.router.page(pageId);
    if (!page) return;
    const next = isPinned(pageId) ? pins().filter((p) => p !== pageId) : pins().concat(pageId);
    ENX.state.set('pins', next);
    ENX.shell.refreshNav();
    syncPinButton();
    ENX.ui.toast(isPinned(pageId) ? `${page.label} pinned to the sidebar` : `${page.label} unpinned`);
  }

  function syncPinButton() {
    const btn = document.querySelector('[data-ws-pin]');
    if (!btn) return;
    const on = isPinned(here());
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Unpin this screen from the sidebar' : 'Pin this screen to the sidebar');
    btn.dataset.tip = on ? 'Unpin screen (P)' : 'Pin screen (P)';
  }

  /* ---- recents ---- */
  function recordVisit() {
    const id = here();
    if (!ENX.router.page(id)) return;
    const next = [id].concat((ENX.state.get('recents') || []).filter((r) => r !== id)).slice(0, MAX_RECENTS);
    ENX.state.set('recents', next);
  }

  /* ---- density ---- */
  function setDensity(value) {
    const next = value || (ENX.state.get('density') === 'compact' ? 'comfortable' : 'compact');
    ENX.state.set('density', next);
    ENX.shell.applyTheme();
    document.dispatchEvent(new CustomEvent('enx:density', { detail: { density: next } }));
    ENX.ui.toast(next === 'compact' ? 'Compact density — more data per screen' : 'Comfortable density');
  }

  /* ---- share ---- */
  /** Copy the current URL, which carries any filters a screen has written into it. */
  function copyLink() {
    const url = location.href;
    const done = () => ENX.ui.toast('Link to this view copied', 'positive');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(done, () => fallbackCopy(url, done));
    } else {
      fallbackCopy(url, done);
    }
  }

  function fallbackCopy(text, done) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    area.remove();
    if (ok) { done(); return; }
    // Last resort: show the link so it can be copied by hand.
    ENX.ui.modal({
      eyebrow: 'Share',
      title: 'Copy this link',
      body: `<input class="input" readonly value="${ENX.ui.escapeAttr(text)}" aria-label="Link to this view" data-ws-share-field>`,
      footer: '<button class="btn btn--primary" data-modal-close>Done</button>',
      onMount: (body) => { const f = body.querySelector('[data-ws-share-field]'); f.focus(); f.select(); },
    });
  }

  /**
   * Screens keep their filters in the query string so a view can be shared or
   * bookmarked. replaceState, never pushState: filtering is not navigation.
   */
  function writeParams(params) {
    const url = new URL(location.href);
    Object.keys(params).forEach((k) => {
      const v = params[k];
      if (v === undefined || v === null || v === '' || v === 'all') url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    });
    history.replaceState(history.state, '', url.pathname.split('/').pop() + url.search + url.hash);
  }

  const readParam = (k) => new URLSearchParams(location.search).get(k);

  /* ---- page header controls ---- */
  function headerControls() {
    const header = document.querySelector('.page-header');
    if (!header || !ENX.router.page(here())) return;
    let actions = header.querySelector('.page-header__actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'page-header__actions';
      header.appendChild(actions);
    }
    const group = document.createElement('div');
    group.className = 'ws-header-tools';
    group.innerHTML = `
      <button class="btn btn--icon has-tip has-tip--end" data-ws-share data-tip="Copy link to this view"
              aria-label="Copy link to this view">${ENX.router.iconHTML('link')}</button>
      <button class="btn btn--icon has-tip has-tip--end ws-pin" data-ws-pin aria-pressed="false"
              aria-label="Pin this screen to the sidebar">${ENX.router.iconHTML('star')}</button>`;
    actions.insertBefore(group, actions.firstChild);
    group.querySelector('[data-ws-share]').addEventListener('click', copyLink);
    group.querySelector('[data-ws-pin]').addEventListener('click', () => togglePin());
    syncPinButton();
  }

  /* ---- keyboard ---- */
  const GENERAL = [
    ['⌘K  Ctrl K  /', 'Command palette'],
    ['?', 'This list of shortcuts'],
    ['G then a letter', 'Go to a screen'],
    ['[', 'Collapse or expand the sidebar'],
    ['P', 'Pin or unpin this screen'],
    ['N', 'Open notifications'],
    ['Esc', 'Close any panel or dialog'],
  ];

  function keyLabel(k) { return k === ',' ? ',' : k.toUpperCase(); }

  function openShortcuts() {
    const nav = ENX.router.allPages().filter((p) => p.key);
    ENX.ui.modal({
      eyebrow: 'Keyboard',
      title: 'Keyboard shortcuts',
      desc: 'Shortcuts work anywhere except while typing in a field.',
      body: `
        <div class="ws-keys">
          <section>
            <h3 class="ws-keys__head">General</h3>
            <dl class="ws-keys__list">
              ${GENERAL.map(([k, v]) => `<div><dt>${k.split('  ').map((part) => `<kbd class="topbar__kbd">${esc(part)}</kbd>`).join(' ')}</dt><dd>${esc(v)}</dd></div>`).join('')}
            </dl>
          </section>
          <section>
            <h3 class="ws-keys__head">Go to</h3>
            <dl class="ws-keys__list">
              ${nav.map((p) => `<div><dt><kbd class="topbar__kbd">G</kbd> <kbd class="topbar__kbd">${esc(keyLabel(p.key))}</kbd></dt><dd>${esc(p.label)}</dd></div>`).join('')}
            </dl>
          </section>
        </div>`,
      footer: '<button class="btn btn--primary" data-modal-close>Close</button>',
    });
  }

  let goArmed = 0;

  function overlayOpen() {
    return !!document.querySelector('.modal-backdrop[data-open="true"], .ws-tour');
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    if (overlayOpen()) return;

    if (goArmed && Date.now() - goArmed < 1500) {
      goArmed = 0;
      const dest = ENX.router.allPages().find((p) => p.key === e.key.toLowerCase());
      if (dest) { e.preventDefault(); location.href = dest.href; }
      hideGoHint();
      return;
    }
    goArmed = 0;

    switch (e.key) {
      case '?': e.preventDefault(); openShortcuts(); break;
      case 'g': case 'G': goArmed = Date.now(); showGoHint(); break;
      case '[': {
        const toggle = document.querySelector('[data-action="toggle-sidebar"]');
        if (toggle) { e.preventDefault(); toggle.click(); }
        break;
      }
      case 'p': case 'P': if (ENX.router.page(here())) { e.preventDefault(); togglePin(); } break;
      case 'n': case 'N': if (ENX.notify) { e.preventDefault(); ENX.notify.open(); } break;
      default: break;
    }
  }

  /* A small chip confirms the first half of a "G" chord was heard. */
  let hintTimer = null;
  function showGoHint() {
    let hint = document.querySelector('.ws-go-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'ws-go-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.innerHTML = '<kbd class="topbar__kbd">G</kbd><span>then a screen key — <kbd class="topbar__kbd">?</kbd> for the list</span>';
      document.body.appendChild(hint);
    }
    hint.dataset.show = 'true';
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideGoHint, 1500);
  }
  function hideGoHint() {
    const hint = document.querySelector('.ws-go-hint');
    if (hint) hint.dataset.show = 'false';
  }

  function init() {
    recordVisit();
    headerControls();
    document.addEventListener('keydown', onKey);

    ENX.palette.register([
      { label: 'Keyboard shortcuts', sub: 'Every shortcut, including G-key navigation', run: openShortcuts },
      { label: 'Pin or unpin this screen', sub: 'Keep it at the top of the sidebar', run: () => togglePin() },
      { label: 'Copy link to this view', sub: 'Includes the filters you have applied', run: copyLink },
      { label: 'Toggle compact density', sub: 'Fit more rows and cards on screen', run: () => setDensity() },
    ]);
  }

  return { init, togglePin, isPinned, setDensity, copyLink, writeParams, readParam, openShortcuts };
})();

/* ==========================================================================
   Notifications — the activity feed behind the bell
   Rule breaches, agent decisions and recoveries land here and persist, so a
   breach seen on one screen is still waiting on the next.
   ========================================================================== */
ENX.notify = (function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  const MAX = 40;
  let tab = 'activity';

  const items = () => ENX.state.get('notifications') || [];
  const unread = () => items().filter((n) => !n.read).length;

  /**
   * @param {{severity?:string,title:string,detail?:string,href?:string,source?:string}} n
   */
  function push(n) {
    const entry = Object.assign({ severity: 'info', source: 'System', detail: '' }, n, {
      id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
      read: false,
    });
    ENX.state.set('notifications', [entry].concat(items()).slice(0, MAX));
    syncBell();
    refreshOpen();
    return entry;
  }

  function markRead(id) {
    ENX.state.set('notifications', items().map((n) => (n.id === id ? Object.assign({}, n, { read: true }) : n)));
    syncBell();
  }

  function markAllRead() {
    ENX.state.set('notifications', items().map((n) => Object.assign({}, n, { read: true })));
    syncBell();
    refreshOpen();
  }

  function clear() {
    ENX.state.set('notifications', []);
    syncBell();
    refreshOpen();
  }

  function syncBell() {
    const btn = document.querySelector('[data-action="notifications"]');
    if (!btn) return;
    const n = unread();
    const dot = btn.querySelector('[data-notif-dot]');
    if (dot) dot.style.display = n ? 'block' : 'none';
    btn.setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications');
  }

  function ago(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function activityHTML() {
    const list = items();
    if (!list.length) {
      return `<div class="empty-state" style="padding:var(--sp-10) var(--sp-4)">
        <p class="empty-state__title">Nothing new</p>
        <p>Alert-rule breaches and agent decisions appear here as they happen.</p>
        <a class="btn btn--sm" href="settings.html#rules">Set up alert rules</a>
      </div>`;
    }
    return `<ul class="ws-feed">${list.map((n) => `
      <li>
        <button class="ws-feed__item ws-feed__item--${esc(n.severity)}" data-feed-id="${esc(n.id)}"
                data-read="${n.read}"${n.href ? ` data-href="${esc(n.href)}"` : ''}>
          <span class="ws-feed__spine" aria-hidden="true"></span>
          <span class="ws-feed__body">
            <span class="ws-feed__title">${n.read ? '' : '<span class="ws-feed__unread">Unread · </span>'}${esc(n.title)}</span>
            ${n.detail ? `<span class="ws-feed__detail">${esc(n.detail)}</span>` : ''}
            <span class="ws-feed__meta">${esc(n.source)} · ${ago(n.at)}</span>
          </span>
        </button>
      </li>`).join('')}</ul>`;
  }

  function alertsHTML() {
    const alerts = ENX.data.peek('alerts');
    if (!alerts) return '<div class="empty-state"><p class="empty-state__title">Loading estate alerts…</p></div>';
    const rank = (s) => ({ CRITICAL: 0, WARNING: 1, OPTIMISATION: 2, 'AI INSIGHT': 3 }[s] ?? 4);
    return `<div class="stack" style="gap:0">${alerts.alerts.slice()
      .sort((a, b) => rank(a.severity) - rank(b.severity)).slice(0, 12)
      .map(ENX.shell.alertRowHTML).join('')}</div>`;
  }

  function bodyHTML() {
    const n = unread();
    return `
      <div class="tabs ws-feed-tabs" role="tablist" aria-label="Notification type">
        <button class="tab" role="tab" aria-selected="${tab === 'activity'}" data-feed-tab="activity">
          Activity${n ? ` <span class="ws-count">${n}</span>` : ''}</button>
        <button class="tab" role="tab" aria-selected="${tab === 'alerts'}" data-feed-tab="alerts">Estate alerts</button>
      </div>
      <div data-feed-panel>${tab === 'activity' ? activityHTML() : alertsHTML()}</div>`;
  }

  function footerHTML() {
    return tab === 'activity'
      ? `<a class="btn" href="settings.html#rules">Alert rules</a>
         <button class="btn" data-feed-clear${items().length ? '' : ' disabled'}>Clear</button>
         <button class="btn btn--primary" data-feed-readall${unread() ? '' : ' disabled'}>Mark all read</button>`
      : '<a class="btn btn--block" href="dashboard.html#alerts">Open alert centre</a>';
  }

  function isOpen() {
    const d = document.querySelector('.drawer[data-role="inspector"][data-open="true"]');
    return d && d.querySelector('[data-feed-panel]') ? d : null;
  }

  function refreshOpen() {
    const d = isOpen();
    if (!d) return;
    d.querySelector('.drawer__body').innerHTML = bodyHTML();
    d.querySelector('.drawer__footer').innerHTML = footerHTML();
    wire(d);
  }

  function wire(d) {
    d.querySelectorAll('[data-feed-tab]').forEach((t) => t.addEventListener('click', () => {
      tab = t.dataset.feedTab;
      if (tab === 'alerts') ENX.data.load('alerts').then(refreshOpen, refreshOpen);
      refreshOpen();
    }));
    d.querySelectorAll('[data-feed-id]').forEach((b) => b.addEventListener('click', () => {
      markRead(b.dataset.feedId);
      if (b.dataset.href) { location.href = b.dataset.href; return; }
      refreshOpen();
    }));
    const all = d.querySelector('[data-feed-readall]');
    if (all) all.addEventListener('click', markAllRead);
    const clr = d.querySelector('[data-feed-clear]');
    if (clr) clr.addEventListener('click', clear);
  }

  function open() {
    if (unread()) tab = 'activity';
    const d = ENX.ui.drawer({
      eyebrow: 'Notifications',
      title: 'What needs attention',
      desc: 'Your alert-rule breaches and decisions, plus the estate alert log.',
      body: bodyHTML(),
      footer: footerHTML(),
    });
    wire(d);
  }

  function init() {
    syncBell();
    ENX.palette.register([{ label: 'Open notifications', sub: 'Activity feed and estate alerts', run: open }]);
  }

  return { init, push, open, unread, markAllRead };
})();

/* ==========================================================================
   Alert rules — thresholds the user sets, evaluated on every demo tick
   Edge-triggered: a rule notifies when a site crosses into breach, and again
   when it recovers. Breach state persists, so moving between screens never
   re-announces a breach that is already known.
   ========================================================================== */
ENX.rules = (function () {
  const esc = (s) => ENX.ui.escapeHTML(s);

  const METRICS = {
    load:   { label: 'Site demand', series: 'loadMW', unit: 'MW', d: 2, step: 0.1 },
    grid:   { label: 'Grid import', series: 'gridMW', unit: 'MW', d: 2, step: 0.1 },
    soc:    { label: 'Battery state of charge', series: 'socPct', unit: '%', d: 1, step: 1 },
    pf:     { label: 'Power factor', series: 'pf', unit: '', d: 3, step: 0.005 },
    carbon: { label: 'Grid carbon intensity', series: 'carbon', unit: 'gCO₂/kWh', d: 0, step: 10 },
    tariff: { label: 'Tariff', series: 'tariff', unit: '₹/kWh', d: 2, step: 0.1 },
  };

  /* Seeded against the simulated ranges, so each one behaves believably:
     power factor never drops under 0.952, grid import peaks near 14.7 MW. */
  const DEFAULTS = [
    { id: 'r-pf', metric: 'pf', op: '<', value: 0.96, scope: 'all', severity: 'warning', enabled: true },
    { id: 'r-grid', metric: 'grid', op: '>', value: 12, scope: 'all', severity: 'critical', enabled: true },
    { id: 'r-soc', metric: 'soc', op: '<', value: 23, scope: 'active', severity: 'warning', enabled: false },
  ];

  function list() {
    let r = ENX.state.get('rules');
    if (!Array.isArray(r)) { r = DEFAULTS.map((x) => Object.assign({}, x)); ENX.state.set('rules', r); }
    return r;
  }

  function save(next) { ENX.state.set('rules', next); }

  function fmt(metric, v) {
    const m = METRICS[metric];
    const n = Number(v).toFixed(m.d);
    return m.unit ? `${n} ${m.unit}` : n;
  }

  function describe(rule) {
    const m = METRICS[rule.metric];
    return `${m.label} ${rule.op === '>' ? 'above' : 'below'} ${fmt(rule.metric, rule.value)}`;
  }

  /** Forget breach state for a rule, so a changed rule is judged afresh. */
  function resetState(ruleId) {
    const st = Object.assign({}, ENX.state.get('ruleState') || {});
    Object.keys(st).forEach((k) => { if (k.startsWith(`${ruleId}|`)) delete st[k]; });
    ENX.state.set('ruleState', st);
  }

  function add(rule) {
    const entry = Object.assign({ enabled: true }, rule, { id: `r-${Date.now().toString(36)}` });
    save(list().concat(entry));
    evaluate();
    return entry;
  }

  function remove(id) { save(list().filter((r) => r.id !== id)); resetState(id); }

  function toggle(id, on) {
    save(list().map((r) => (r.id === id ? Object.assign({}, r, { enabled: on }) : r)));
    resetState(id);
    if (on) evaluate();
  }

  function scopeSites(rule, sites) {
    return rule.scope === 'all' ? sites.sites : [ENX.data.siteById(sites, ENX.state.get('siteId'))];
  }

  /** The sites breaching a rule right now, with the value that breached it. */
  function breaches(rule) {
    const tel = ENX.data.peek('telemetry');
    const sites = ENX.data.peek('sites');
    if (!tel || !sites) return [];
    const idx = ENX.demo.index(tel.intervalMinutes);
    const m = METRICS[rule.metric];
    return scopeSites(rule, sites).map((site) => {
      const series = tel.series[site.siteId];
      const v = series ? series[m.series][idx] : undefined;
      const hit = v !== undefined && (rule.op === '>' ? v > rule.value : v < rule.value);
      return { site, value: v, hit };
    });
  }

  function evaluate() {
    const tel = ENX.data.peek('telemetry');
    const sites = ENX.data.peek('sites');
    if (!tel || !sites) return;
    const st = Object.assign({}, ENX.state.get('ruleState') || {});
    const fresh = [];
    let changed = false;

    list().filter((r) => r.enabled).forEach((rule) => {
      breaches(rule).forEach(({ site, value, hit }) => {
        const key = `${rule.id}|${site.siteId}`;
        if (hit === !!st[key]) return;
        st[key] = hit;
        changed = true;
        const href = `site-detail.html?site=${encodeURIComponent(site.siteId)}`;
        if (hit) {
          fresh.push(ENX.notify.push({
            severity: rule.severity,
            source: 'Alert rule',
            title: `${describe(rule)} — ${site.name}`,
            detail: `Reading ${fmt(rule.metric, value)} at ${ENX.fmt.clock(ENX.demo.index(tel.intervalMinutes) * tel.intervalMinutes)}.`,
            href,
          }));
        } else {
          ENX.notify.push({
            severity: 'positive',
            source: 'Alert rule',
            title: `Recovered: ${METRICS[rule.metric].label.toLowerCase()} at ${site.name}`,
            detail: `Back within ${describe(rule).toLowerCase()} — now ${fmt(rule.metric, value)}.`,
            href,
          });
        }
      });
    });

    if (changed) ENX.state.set('ruleState', st);
    // One toast per evaluation, however many sites crossed at once.
    if (fresh.length === 1) {
      ENX.ui.toast(fresh[0].title, fresh[0].severity === 'critical' ? 'critical' : 'warning', 6000,
        { label: 'View', run: () => ENX.notify.open() });
    } else if (fresh.length > 1) {
      ENX.ui.toast(`${fresh.length} new alert-rule breaches across the estate`, 'warning', 6000,
        { label: 'View', run: () => ENX.notify.open() });
    }
    paintMount();
  }

  /* ---- the rules editor, mounted wherever [data-rules-mount] exists ---- */
  function statusHTML(rule) {
    // Disabled is a choice, not a fault — neutral, never the critical red.
    if (!rule.enabled) return '<span class="pill">OFF</span>';
    const hits = breaches(rule).filter((b) => b.hit);
    return hits.length
      ? `<span class="pill pill--${rule.severity === 'critical' ? 'critical' : 'warning'}"><span class="pill__dot"></span>${hits.length} BREACHING</span>`
      : '<span class="pill pill--online"><span class="pill__dot"></span>WITHIN LIMIT</span>';
  }

  function paintMount() {
    const mount = document.querySelector('[data-rules-mount]');
    if (!mount) return;
    const rules = list();
    mount.querySelector('[data-rules-list]').innerHTML = rules.length ? rules.map((r) => `
      <li class="ws-rule" data-rule="${esc(r.id)}">
        <label class="switch ws-rule__switch">
          <input type="checkbox" class="sr-only" data-rule-toggle${r.enabled ? ' checked' : ''} aria-label="Enable rule: ${esc(describe(r))}">
          <span class="switch__track"><span class="switch__thumb"></span></span>
        </label>
        <div class="ws-rule__text">
          <span class="ws-rule__name">${esc(describe(r))}</span>
          <span class="ws-rule__meta">${r.scope === 'all' ? 'All flagship sites' : 'Active site only'} · ${r.severity === 'critical' ? 'Critical' : 'Warning'}</span>
        </div>
        <span data-rule-status>${statusHTML(r)}</span>
        <button class="btn btn--icon btn--ghost" data-rule-delete aria-label="Delete rule: ${esc(describe(r))}">${ENX.router.iconHTML('close')}</button>
      </li>`).join('') : '<li class="ws-rule ws-rule--empty">No rules yet. Add one below.</li>';
  }

  function mount() {
    const el = document.querySelector('[data-rules-mount]');
    if (!el) return;
    el.innerHTML = `
      <ul class="ws-rules" data-rules-list></ul>
      <form class="ws-rule-form" data-rule-form novalidate>
        <div class="field">
          <label class="field__label" for="rule-metric">Metric</label>
          <select class="select" id="rule-metric" data-rf-metric>
            ${Object.keys(METRICS).map((k) => `<option value="${k}">${esc(METRICS[k].label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="rule-op">Condition</label>
          <select class="select" id="rule-op" data-rf-op>
            <option value=">">Above</option>
            <option value="<">Below</option>
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="rule-value">Threshold <span data-rf-unit class="text-tertiary"></span></label>
          <input class="input" id="rule-value" type="number" inputmode="decimal" required data-rf-value>
        </div>
        <div class="field">
          <label class="field__label" for="rule-scope">Sites</label>
          <select class="select" id="rule-scope" data-rf-scope>
            <option value="all">All flagship sites</option>
            <option value="active">Active site only</option>
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="rule-sev">Severity</label>
          <select class="select" id="rule-sev" data-rf-sev>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <button class="btn btn--primary ws-rule-form__submit" type="submit">Add rule</button>
        <p class="field__hint ws-rule-form__hint" data-rf-hint role="status"></p>
      </form>`;

    const form = el.querySelector('[data-rule-form]');
    const metricSel = form.querySelector('[data-rf-metric]');
    const valueIn = form.querySelector('[data-rf-value]');
    const hint = form.querySelector('[data-rf-hint]');

    // Suggest a threshold from what the active site is reading now.
    const syncMetric = () => {
      const m = METRICS[metricSel.value];
      form.querySelector('[data-rf-unit]').textContent = m.unit ? `(${m.unit})` : '';
      valueIn.step = m.step;
      const tel = ENX.data.peek('telemetry');
      const series = tel && tel.series[ENX.state.get('siteId')];
      if (series) {
        const now = series[m.series][ENX.demo.index(tel.intervalMinutes)];
        valueIn.placeholder = `Now ${now.toFixed(m.d)}`;
        hint.textContent = `The active site reads ${fmt(metricSel.value, now)} right now.`;
      }
    };
    metricSel.addEventListener('change', syncMetric);
    ENX.data.load('telemetry').then(syncMetric, () => {});

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = parseFloat(valueIn.value);
      if (!Number.isFinite(value)) {
        valueIn.setAttribute('aria-invalid', 'true');
        hint.textContent = 'Enter a number for the threshold.';
        valueIn.focus();
        return;
      }
      valueIn.removeAttribute('aria-invalid');
      const rule = add({
        metric: metricSel.value,
        op: form.querySelector('[data-rf-op]').value,
        value,
        scope: form.querySelector('[data-rf-scope]').value,
        severity: form.querySelector('[data-rf-sev]').value,
      });
      valueIn.value = '';
      ENX.ui.toast(`Rule added: ${describe(rule)}`, 'positive');
      paintMount();
    });

    el.querySelector('[data-rules-list]').addEventListener('change', (e) => {
      const t = e.target.closest('[data-rule-toggle]');
      if (!t) return;
      toggle(t.closest('[data-rule]').dataset.rule, t.checked);
      paintMount();
    });
    el.querySelector('[data-rules-list]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rule-delete]');
      if (!b) return;
      const id = b.closest('[data-rule]').dataset.rule;
      const removed = list().find((r) => r.id === id);
      const at = list().indexOf(removed);
      remove(id);
      paintMount();
      ENX.ui.toast(`Rule deleted: ${describe(removed)}`, null, 6000, {
        label: 'Undo',
        run: () => { const next = list().slice(); next.splice(at, 0, removed); save(next); evaluate(); paintMount(); },
      });
    });

    paintMount();
  }

  function init() {
    list();
    mount();
    ENX.data.loadAll(['telemetry', 'sites']).then(evaluate, () => {});
    document.addEventListener('enx:tick', evaluate);
    document.addEventListener('enx:sitechange', () => {
      // "Active site" rules now watch a different site; judge that site afresh.
      list().filter((r) => r.scope === 'active').forEach((r) => resetState(r.id));
      evaluate();
    });
  }

  return { init, list, add, remove, toggle, evaluate, breaches, describe, METRICS };
})();

/* ==========================================================================
   Guided tour — a short spotlight walk through the Command Center
   Offered once on a first visit, never forced; replayable from Help and the
   palette. Steps whose target is hidden at the current width are skipped.
   ========================================================================== */
ENX.tour = (function () {
  const STEPS = [
    { sel: '[data-kpi-strip]', title: 'The estate at a glance',
      text: 'Six numbers that matter across every connected site. Each sparkline is the last 24 hours.' },
    { sel: '[data-topology]', title: 'Real-time energy flow',
      text: 'The live single-line diagram for the active site. Select any node to inspect the asset behind it.' },
    { sel: '[data-action="site-select"]', title: 'Every screen follows one site',
      text: 'Switch the active site here and the twin, forecasts, agent and reports all follow it.' },
    { sel: '#alerts', title: 'Alert centre',
      text: 'Faults, warnings and optimisation opportunities, ranked by severity and rupee impact.' },
    { sel: '[data-action="notifications"]', title: 'Your own alert rules',
      text: 'Set thresholds in Settings — demand, power factor, battery charge. Breaches land here, once.' },
    { sel: '[data-ws-pin]', title: 'Make the OS yours',
      text: 'Pin a screen to the top of the sidebar, or copy a link that keeps your filters.' },
    { sel: '[data-action="open-palette"]', title: 'Find anything',
      text: 'Press ⌘K or / to search screens, sites and assets. Press ? for every keyboard shortcut.' },
  ];

  let el = null;
  let steps = [];
  let at = 0;
  let lastFocus = null;

  function visible(node) {
    if (!node) return false;
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden';
  }

  function start() {
    if (ENX.shell.currentPageId() !== 'dashboard') { location.href = 'dashboard.html?tour=1'; return; }
    steps = STEPS.filter((s) => visible(document.querySelector(s.sel)));
    if (!steps.length) return;
    end(true);
    lastFocus = document.activeElement;
    at = 0;

    el = document.createElement('div');
    el.className = 'ws-tour';
    el.innerHTML = `
      <div class="ws-tour__hole" aria-hidden="true"></div>
      <div class="ws-tour__card" role="dialog" aria-modal="true" aria-labelledby="ws-tour-title" aria-describedby="ws-tour-text" tabindex="-1">
        <div class="ws-tour__count" data-tour-count></div>
        <h2 class="ws-tour__title" id="ws-tour-title"></h2>
        <p class="ws-tour__text" id="ws-tour-text"></p>
        <div class="ws-tour__actions">
          <button class="btn btn--ghost btn--sm" data-tour-end>End tour</button>
          <span class="spacer"></span>
          <button class="btn btn--sm" data-tour-back>Back</button>
          <button class="btn btn--sm btn--primary" data-tour-next>Next</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('[data-tour-end]').addEventListener('click', () => end());
    el.querySelector('[data-tour-back]').addEventListener('click', () => go(at - 1));
    el.querySelector('[data-tour-next]').addEventListener('click', () => (at === steps.length - 1 ? end() : go(at + 1)));
    // A click on the dimmed page ends the tour rather than reaching what is underneath.
    el.addEventListener('click', (e) => { if (e.target === el) end(); });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    go(0);
  }

  function go(i) {
    if (!el || i < 0 || i >= steps.length) return;
    at = i;
    const step = steps[at];
    const target = document.querySelector(step.sel);
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
    el.querySelector('[data-tour-count]').textContent = `${at + 1} of ${steps.length}`;
    el.querySelector('#ws-tour-title').textContent = step.title;
    el.querySelector('#ws-tour-text').textContent = step.text;
    el.querySelector('[data-tour-back]').disabled = at === 0;
    el.querySelector('[data-tour-next]').textContent = at === steps.length - 1 ? 'Finish' : 'Next';
    place();
    el.querySelector('.ws-tour__card').focus();
  }

  /** Position the spotlight over the target and the card beside it, inside the viewport. */
  function place() {
    if (!el) return;
    const target = document.querySelector(steps[at].sel);
    if (!target) return;
    const r = target.getBoundingClientRect();
    const pad = 6;
    const hole = el.querySelector('.ws-tour__hole');
    Object.assign(hole.style, {
      top: `${r.top - pad}px`, left: `${r.left - pad}px`,
      width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
    });
    const card = el.querySelector('.ws-tour__card');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = Math.min(340, vw - 32);
    const ch = card.offsetHeight || 170;
    const below = r.bottom + pad + 12;
    const above = r.top - pad - 12 - ch;
    let top = below + ch <= vh - 16 ? below : above >= 16 ? above : Math.max(16, vh - ch - 16);
    let left = Math.min(Math.max(16, r.left), vw - cw - 16);
    card.style.width = `${cw}px`;
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  function onKey(e) {
    if (!el) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); return; }
    if (e.key === 'Tab') {
      // Keep focus inside the card while the page is dimmed.
      const f = Array.from(el.querySelectorAll('button:not([disabled])'));
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }

  function end(silent) {
    if (!el) return;
    el.remove();
    el = null;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    ENX.state.set('tourDone', true);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    if (!silent) ENX.ui.toast('Tour ended — replay it any time from Help or the palette');
  }

  /** Offer once on a first visit to the Command Center, or start when linked with ?tour=1. */
  function maybeOffer() {
    if (ENX.shell.currentPageId() !== 'dashboard') return;
    if (ENX.workspace.readParam('tour') === '1') {
      ENX.workspace.writeParams({ tour: '' });
      setTimeout(start, 600);   // let the KPIs and topology render first
      return;
    }
    if (ENX.state.get('tourDone')) return;
    ENX.state.set('tourDone', true);  // offered once; never nag
    setTimeout(() => ENX.ui.toast('New to Energy Nexus? Take the 60-second tour.', null, 10000,
      { label: 'Start tour', run: start }), 1200);
  }

  function init() {
    ENX.palette.register([{ label: 'Start product tour', sub: 'A 60-second walk through the Command Center', run: start }]);
    maybeOffer();
  }

  return { init, start, end, isOpen: () => !!el };
})();

/* ==========================================================================
   Boot — after the shell exists, so the header and nav are there to extend.
   ========================================================================== */
document.addEventListener('enx:ready', () => {
  if (!document.querySelector('.app')) return;
  ENX.workspace.init();
  ENX.notify.init();
  ENX.rules.init();
  ENX.tour.init();
});
