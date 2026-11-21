/**
 * Energy Nexus — site network.
 * Card and table views over the same filtered model, with live demand.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};
  let view = 'cards';
  let query = '';
  let cluster = 'ALL';
  let sortBy = 'demand';
  let comparing = false;          // compare mode: clicks select instead of navigating
  let picked = [];                // site ids chosen for comparison, in pick order
  const MAX_COMPARE = 3;
  const SORTS = ['demand', 'load', 'savings', 'health', 'name'];

  /* Filters live in the URL, so a filtered view can be shared or bookmarked. */
  function readURL() {
    const P = ENX.workspace.readParam;
    if (P('view') === 'table') view = 'table';
    if (P('q')) query = P('q');
    if (P('cluster')) cluster = P('cluster');
    if (SORTS.includes(P('sort'))) sortBy = P('sort');
    const c = (P('compare') || '').split(',').filter((id) => D.sites.sites.some((x) => x.siteId === id));
    picked = c.slice(0, MAX_COMPARE);
  }

  function writeURL() {
    ENX.workspace.writeParams({
      view: view === 'table' ? 'table' : '',
      q: query,
      cluster: cluster === 'ALL' ? '' : cluster,
      sort: sortBy === 'demand' ? '' : sortBy,
      compare: picked.length ? picked.join(',') : '',
    });
  }

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['sites', 'telemetry', 'assets', 'alerts']).then((data) => {
      D = data;
      readURL();
      if (!D.sites.sites.some((x) => x.cluster === cluster)) cluster = 'ALL';
      renderFilters();
      syncControls();
      render();
      wire();
      // A shared comparison link reopens the comparison it was copied from.
      if (picked.length) setComparing(true, true);
      if (picked.length >= 2) openCompare();
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  document.addEventListener('enx:tick', () => { if (D.sites) render(); });

  function idx() { return ENX.demo.index(D.telemetry.intervalMinutes); }

  function live(site) {
    const s = D.telemetry.series[site.siteId];
    const i = idx();
    return { demand: s.loadMW[i], solar: s.solarMW[i], grid: s.gridMW[i], soc: s.socPct[i], tariff: s.tariff[i] };
  }

  function filtered() {
    const q = query.toLowerCase();
    let list = D.sites.sites.filter((s) =>
      (cluster === 'ALL' || s.cluster === cluster) &&
      (!q || s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q) || s.industry.toLowerCase().includes(q)));

    const sorters = {
      demand: (a, b) => live(b).demand - live(a).demand,
      load: (a, b) => b.connectedLoadMW - a.connectedLoadMW,
      savings: (a, b) => b.savingsPercent - a.savingsPercent,
      health: (a, b) => b.health - a.health,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(sorters[sortBy]);
  }

  function renderFilters() {
    const clusters = ['ALL'].concat(Array.from(new Set(D.sites.sites.map((s) => s.cluster))));
    document.querySelector('[data-cluster-filters]').innerHTML = clusters.map((c) => {
      const count = c === 'ALL' ? D.sites.sites.length : D.sites.sites.filter((s) => s.cluster === c).length;
      return `<button class="chip" data-cluster="${esc(c)}" aria-pressed="${c === cluster}">
        ${esc(c)}<span class="chip__count">${count}</span></button>`;
    }).join('');

    document.querySelectorAll('[data-cluster]').forEach((btn) => {
      btn.addEventListener('click', () => {
        cluster = btn.dataset.cluster;
        document.querySelectorAll('[data-cluster]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b.dataset.cluster === cluster)));
        render();
        writeURL();
      });
    });
  }

  function render() {
    const host = document.querySelector('[data-sites-view]');
    const list = filtered();

    if (!list.length) {
      host.innerHTML = `<div class="empty-state"><p class="empty-state__title">No sites match</p>
        <p>Clear the search or choose a different cluster.</p>
        <button class="btn" data-clear>Clear filters</button></div>`;
      host.querySelector('[data-clear]').addEventListener('click', () => {
        query = ''; cluster = 'ALL';
        document.querySelector('[data-site-search]').value = '';
        renderFilters(); render(); writeURL();
      });
      return;
    }

    host.innerHTML = view === 'cards' ? cardsHTML(list) : tableHTML(list);

    if (view === 'cards') {
      list.forEach((s) => {
        const el = host.querySelector(`[data-spark="${s.siteId}"]`);
        if (el) ENX.charts.sparkline(el, D.telemetry.series[s.siteId].loadMW, { color: 'var(--e-load)', height: 30 });
      });
    }

    host.querySelectorAll('[data-site]').forEach((el) => {
      el.addEventListener('click', () => {
        if (comparing) { togglePick(el.dataset.site); return; }
        window.location.href = `site-detail.html?site=${el.dataset.site}`;
      });
    });
    syncPicks();
  }

  /* ---------------------------------------------------------- compare */
  function setComparing(on, quiet) {
    comparing = on;
    if (!on) picked = [];
    const btn = document.querySelector('[data-compare-mode]');
    btn.setAttribute('aria-pressed', String(on));
    document.querySelector('[data-sites-view]').dataset.comparing = String(on);
    syncPicks();
    writeURL();
    if (on && !quiet) ENX.ui.toast(`Choose up to ${MAX_COMPARE} sites to compare`);
  }

  function togglePick(id) {
    if (picked.includes(id)) picked = picked.filter((p) => p !== id);
    else if (picked.length >= MAX_COMPARE) { ENX.ui.toast(`Compare up to ${MAX_COMPARE} sites at a time`, 'warning'); return; }
    else picked = picked.concat(id);
    syncPicks();
    writeURL();
  }

  /** Reflect the selection on cards and rows, and in the floating compare bar. */
  function syncPicks() {
    document.querySelectorAll('[data-site]').forEach((el) => {
      const on = picked.includes(el.dataset.site);
      if (comparing) el.setAttribute('aria-pressed', String(on));
      else el.removeAttribute('aria-pressed');
      el.dataset.picked = String(on);
    });

    let bar = document.querySelector('.ws-compare-bar');
    if (!comparing) { if (bar) bar.dataset.open = 'false'; return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'ws-compare-bar';
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', 'Site comparison');
      document.body.appendChild(bar);
      bar.addEventListener('click', (e) => {
        if (e.target.closest('[data-cmp-go]')) openCompare();
        if (e.target.closest('[data-cmp-cancel]')) setComparing(false);
        const rm = e.target.closest('[data-cmp-remove]');
        if (rm) togglePick(rm.dataset.cmpRemove);
      });
    }
    const names = picked.map((id) => D.sites.sites.find((x) => x.siteId === id));
    bar.innerHTML = `
      <div class="ws-compare-bar__picks">
        <span class="ws-compare-bar__count">${picked.length} of ${MAX_COMPARE}</span>
        ${names.length ? names.map((x) => `<span class="chip ws-compare-bar__chip">${esc(x.name)}
          <button data-cmp-remove="${esc(x.siteId)}" aria-label="Remove ${esc(x.name)} from comparison">×</button></span>`).join('')
          : '<span class="text-tertiary">Select sites below</span>'}
      </div>
      <div class="ws-compare-bar__actions">
        <button class="btn btn--sm" data-cmp-cancel>Cancel</button>
        <button class="btn btn--sm btn--primary" data-cmp-go${picked.length < 2 ? ' disabled' : ''}>Compare ${picked.length > 1 ? picked.length : ''} sites</button>
      </div>`;
    requestAnimationFrame(() => { bar.dataset.open = 'true'; });
  }

  function openCompare() {
    const list = picked.map((id) => D.sites.sites.find((x) => x.siteId === id)).filter(Boolean);
    if (list.length < 2) return;
    const lv = list.map(live);
    const daily = (s) => D.telemetry.daily[s.siteId];
    const avg = (arr, k) => arr.reduce((t, d) => t + d[k], 0) / arr.length;

    /* Each row knows which way is better, so the best value can be marked. */
    const ROWS = [
      ['Location', (s) => s.location],
      ['Industry', (s) => s.industry],
      ['Connected load', (s) => s.connectedLoadMW, 'MW', 1, null],
      ['Contract peak', (s) => s.peakMW, 'MW', 1, null],
      ['Demand now', (s, l) => l.demand, 'MW', 2, null],
      ['Utilisation now', (s, l) => (l.demand / s.connectedLoadMW) * 100, '%', 0, null],
      ['Solar capacity', (s) => s.solarMW, 'MW', 1, 'high'],
      ['Battery', (s) => `${s.bess.powerMW} MW / ${s.bess.capacityMWh} MWh`],
      ['Battery SoC now', (s, l) => l.soc, '%', 0, null],
      ['Energy cost', (s) => s.energyCost, '₹/kWh', 2, 'low'],
      ['Savings with Nexus', (s) => s.savingsPercent, '%', 1, 'high'],
      ['Grid carbon intensity now', (s) => s.carbonIntensity, 'gCO₂/kWh', 0, 'low'],
      ['Avg daily energy (30 d)', (s) => avg(daily(s), 'loadMWh'), 'MWh', 0, null],
      ['Avg daily cost (30 d)', (s) => avg(daily(s), 'costINR') / 1e5, '₹ lakh', 2, 'low'],
      ['Avg daily Scope 2 (30 d)', (s) => avg(daily(s), 'carbonT'), 'tCO₂e', 1, 'low'],
      ['Agent tier', (s) => `Tier ${s.agentTier}`],
      ['Asset health', (s) => s.health, '%', 1, 'high'],
    ];

    const rowHTML = ([label, get, unit, d, better]) => {
      const vals = list.map((s, i) => get(s, lv[i]));
      const numeric = typeof vals[0] === 'number';
      let best = -1;
      if (numeric && better) {
        const target = better === 'high' ? Math.max(...vals) : Math.min(...vals);
        if (vals.filter((v) => v === target).length === 1) best = vals.indexOf(target);
      }
      return `<tr><th scope="row">${esc(label)}</th>${vals.map((v, i) => `
        <td class="${numeric ? 'mono' : ''}${i === best ? ' ws-cmp-best' : ''}">${numeric ? `${v.toFixed(d)}${unit ? ` <span class="text-tertiary">${esc(unit)}</span>` : ''}` : esc(v)}${i === best ? '<span class="ws-cmp-best__tag">Best</span>' : ''}</td>`).join('')}</tr>`;
    };

    const STYLES = [{}, { dashed: true }, { thin: true }];
    ENX.ui.modal({
      eyebrow: 'Site comparison',
      title: list.map((s) => s.name.split(' ')[0]).join(' vs '),
      desc: 'Live readings at the current demo time, with 30-day averages. "Best" marks the stronger value where one direction is clearly better.',
      body: `
        <div class="ws-cmp">
          <div class="ws-cmp__chart" data-cmp-chart></div>
          <div class="table-wrap"><table class="table ws-cmp__table" data-nosort>
            <thead><tr><th scope="col">Metric</th>${list.map((s) => `<th scope="col">${esc(s.name)}</th>`).join('')}</tr></thead>
            <tbody>${ROWS.map(rowHTML).join('')}</tbody>
          </table></div>
        </div>`,
      footer: `<button class="btn" data-cmp-copy>Copy link</button>
               <button class="btn btn--primary" data-modal-close>Done</button>`,
      onMount: (body, backdrop) => {
        backdrop.querySelector('.modal').classList.add('modal--wide');
        const i = idx();
        const interval = D.telemetry.intervalMinutes;
        const series = list.map((s, k) => Object.assign({
          key: s.siteId, name: s.name, color: 'var(--e-load)',
          values: ENX.data.window(D.telemetry.series[s.siteId].loadMW, i, 24, interval),
        }, STYLES[k]));
        ENX.charts.line(body.querySelector('[data-cmp-chart]'), {
          height: 220,
          labels: ENX.data.windowLabels(i, 24, interval, series[0].values.length),
          zeroBase: false,
          ariaLabel: `24-hour site demand for ${list.map((s) => s.name).join(', ')}`,
          yFormat: (v) => v.toFixed(0),
          tooltipFormat: (v) => `${v.toFixed(2)} MW`,
          series,
        });
        backdrop.querySelector('[data-cmp-copy]').addEventListener('click', ENX.workspace.copyLink);
      },
    });
  }

  function syncControls() {
    document.querySelectorAll('[data-view]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    document.querySelector('[data-site-search]').value = query;
    document.querySelector('[data-sort]').value = sortBy;
  }

  function cardsHTML(list) {
    return `<div class="grid grid--3">${list.map((s) => {
      const l = live(s);
      const util = (l.demand / s.connectedLoadMW) * 100;
      return `
        <button class="card card--interactive" data-site="${esc(s.siteId)}">
          <div class="card__body">
            <div class="site-card__head">
              <div style="min-width:0">
                <div class="site-card__name">${esc(s.name)}</div>
                <div class="site-card__loc">${esc(s.location)} · ${esc(s.industry)}</div>
              </div>
              ${ENX.ui.tierBadge(s.agentTier)}
            </div>

            <div class="util-bar">
              <div class="bar"><div class="bar__fill${util > 88 ? ' bar__fill--warning' : ''}" style="width:${Math.min(100, util)}%"></div></div>
              <span class="util-bar__pct">${util.toFixed(0)}%</span>
            </div>

            <div class="site-card__metrics">
              <div class="site-card__metric">
                <div class="site-card__metric-label">Demand</div>
                <div class="site-card__metric-value">${l.demand.toFixed(2)}<span style="font-size:10px;color:var(--text-tertiary)"> MW</span></div>
              </div>
              <div class="site-card__metric">
                <div class="site-card__metric-label">Solar</div>
                <div class="site-card__metric-value" style="color:var(--e-solar)">${l.solar.toFixed(2)}<span style="font-size:10px;color:var(--text-tertiary)"> MW</span></div>
              </div>
              <div class="site-card__metric">
                <div class="site-card__metric-label">BESS SoC</div>
                <div class="site-card__metric-value" style="color:var(--e-bess)">${l.soc.toFixed(0)}<span style="font-size:10px;color:var(--text-tertiary)">%</span></div>
              </div>
            </div>

            <div style="height:30px;margin-bottom:var(--sp-3)" data-spark="${esc(s.siteId)}"></div>

            <div class="site-card__foot">
              <div class="row" style="gap:var(--sp-2)">
                <span class="pill pill--online"><span class="pill__dot"></span>${s.health}%</span>
                <span class="num text-positive" style="font-size:var(--fs-xs)">${s.savingsPercent}% saved</span>
              </div>
              <span class="num text-tertiary" style="font-size:var(--fs-xs)">₹${s.energyCost}/kWh</span>
            </div>
          </div>
        </button>`;
    }).join('')}</div>`;
  }

  function tableHTML(list) {
    return `
      <div class="card"><div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Site</th><th>Location</th><th class="num">Connected</th><th class="num">Demand</th>
          <th class="num">Solar</th><th>BESS</th><th class="num">₹/kWh</th><th class="num">Savings</th>
          <th>Tier</th><th class="num">Health</th>
        </tr></thead>
        <tbody>${list.map((s) => {
          const l = live(s);
          return `<tr data-site="${esc(s.siteId)}" data-clickable>
            <td class="table__primary">${esc(s.name)}<div class="table__meta">${esc(s.siteId)}</div></td>
            <td>${esc(s.location)}<div class="table__meta">${esc(s.industry)}</div></td>
            <td class="num">${s.connectedLoadMW}</td>
            <td class="num">${l.demand.toFixed(2)}</td>
            <td class="num" style="color:var(--e-solar)">${l.solar.toFixed(2)}</td>
            <td class="num">${s.bess.powerMW}/${s.bess.capacityMWh}<div class="table__meta">${l.soc.toFixed(0)}% SoC</div></td>
            <td class="num">${s.energyCost}</td>
            <td class="num text-positive">${s.savingsPercent}%</td>
            <td>${ENX.ui.tierBadge(s.agentTier)}</td>
            <td class="num">${s.health}%</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div></div>`;
  }

  function wire() {
    document.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        view = btn.dataset.view;
        document.querySelectorAll('[data-view]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b.dataset.view === view)));
        render();
        writeURL();
      });
    });

    document.querySelector('[data-site-search]').addEventListener('input', (e) => {
      query = e.target.value; render(); writeURL();
    });

    document.querySelector('[data-sort]').addEventListener('change', (e) => {
      sortBy = e.target.value; render(); writeURL();
    });

    document.querySelector('[data-compare-mode]').addEventListener('click', () => setComparing(!comparing));
  }
})();
