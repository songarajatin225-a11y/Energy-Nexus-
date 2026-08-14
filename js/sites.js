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

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['sites', 'telemetry', 'assets', 'alerts']).then((data) => {
      D = data;
      renderFilters();
      render();
      wire();
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
      });
    });
  }

  function render() {
    const host = document.querySelector('[data-sites-view]');
    const list = filtered();

    if (!list.length) {
      host.innerHTML = `<div class="empty-state"><h3>No sites match</h3>
        <p>Clear the search or choose a different cluster.</p>
        <button class="btn" data-clear>Clear filters</button></div>`;
      host.querySelector('[data-clear]').addEventListener('click', () => {
        query = ''; cluster = 'ALL';
        document.querySelector('[data-site-search]').value = '';
        renderFilters(); render();
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
      el.addEventListener('click', () => { window.location.href = `site-detail.html?site=${el.dataset.site}`; });
    });
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
      });
    });

    document.querySelector('[data-site-search]').addEventListener('input', (e) => {
      query = e.target.value; render();
    });

    document.querySelector('[data-sort]').addEventListener('change', (e) => {
      sortBy = e.target.value; render();
    });
  }
})();
