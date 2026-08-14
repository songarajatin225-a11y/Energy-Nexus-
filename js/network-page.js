/**
 * Energy Nexus — network screen.
 * Cluster map, ranking and per-cluster detail.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};
  let map = null;

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['network', 'sites']).then((data) => {
      D = data;
      renderKPIs(); renderLegend(); renderMap(); renderRationale(); renderRows();
      document.querySelector('[data-export-network]').addEventListener('click', () => {
        ENX.report.exportCSV('energy-nexus-clusters', D.network.nodes.map((n) => ({
          priority: n.priority, cluster: n.name, state: n.state, industries: n.industries,
          sites: n.sites, euMW: n.euMW, flexMW: n.flexMW, status: n.status,
        })));
      });
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  function renderKPIs() {
    const t = D.network.totals;
    const live = D.network.nodes.filter((n) => n.status === 'LIVE');
    const kpis = [
      { label: 'Sites', value: t.sites, decimals: 0, accent: 'var(--accent-cyan)', note: `${D.network.nodes.length} clusters` },
      { label: 'Energy under management', value: t.euMW / 1000, decimals: 2, unit: 'GW', accent: 'var(--accent-blue)', note: 'Aggregate connected load' },
      { label: 'Flexibility', value: t.flexMW, decimals: 1, unit: 'MW', accent: 'var(--accent-amber)', note: 'Certified across the network' },
      { label: 'Energy managed', value: 5.2, decimals: 1, unit: 'TWh', accent: 'var(--e-load)', note: 'Trailing twelve months' },
      { label: 'Live clusters', value: live.length, decimals: 0, accent: 'var(--accent-green)', note: `${live.reduce((a, n) => a + n.sites, 0)} sites operating` },
      { label: 'Renewable capacity', value: 560, decimals: 0, unit: 'MW', accent: 'var(--e-solar)', note: 'Solar under management' },
    ];

    document.querySelector('[data-network-kpis]').innerHTML = kpis.map((k, i) => `
      <div class="kpi" style="--kpi-accent:${k.accent}">
        <div class="kpi__label">${esc(k.label)}</div>
        <div class="kpi__value"><span data-count="${i}">0</span>${k.unit ? `<span class="kpi__unit">${esc(k.unit)}</span>` : ''}</div>
        <div class="kpi__foot"><span class="kpi__note">${esc(k.note)}</span></div>
      </div>`).join('');

    kpis.forEach((k, i) => ENX.ui.countUp(document.querySelector(`[data-count="${i}"]`), k.value, {
      decimals: k.decimals, format: (v) => v.toFixed(k.decimals),
    }));
  }

  function renderLegend() {
    const items = [['LIVE', 'var(--accent-cyan)'], ['RAMPING', 'var(--accent-amber)'], ['PILOT', 'var(--accent-violet)']];
    document.querySelector('[data-map-legend]').innerHTML = items.map(([label, c]) => `
      <span class="row" style="gap:5px">
        <span style="width:8px;height:8px;border-radius:50%;background:${c}"></span>
        <span class="eyebrow">${esc(label)}</span>
      </span>`).join('');
  }

  function renderMap() {
    map = ENX.network.renderMap(document.querySelector('[data-network-map]'), {
      nodes: D.network.nodes,
      links: D.network.links,
      height: 640,
      onSelect: showCluster,
    });
  }

  function showCluster(n) {
    const sites = D.sites.sites.filter((s) => s.clusterId === n.nodeId);
    const panel = document.querySelector('[data-cluster-panel]');
    panel.innerHTML = `
      <div class="card__header">
        <div>
          <div class="eyebrow">Priority ${n.priority}</div>
          <div class="card__title" style="margin-top:2px">${esc(n.name)}</div>
          <div class="card__desc">${esc(n.state)}</div>
        </div>
        ${ENX.ui.pill(n.status)}
      </div>
      <div class="card__body card__body--tight">
        <div class="metric-row"><span class="metric-row__label">Sites</span>
          <span class="metric-row__value">${n.sites}</span></div>
        <div class="metric-row"><span class="metric-row__label">Energy under management</span>
          <span class="metric-row__value">${n.euMW} MW</span></div>
        <div class="metric-row"><span class="metric-row__label">Flexibility</span>
          <span class="metric-row__value">${n.flexMW} MW</span></div>
        <div class="metric-row"><span class="metric-row__label">Share of network</span>
          <span class="metric-row__value">${((n.euMW / D.network.totals.euMW) * 100).toFixed(1)}%</span></div>
        <div style="margin-top:var(--sp-4)">
          <div class="eyebrow">Dominant industries</div>
          <p style="font-size:var(--fs-sm);color:var(--text-secondary);margin-top:var(--sp-2)">${esc(n.industries)}</p>
        </div>
        ${sites.length ? `
          <div style="margin-top:var(--sp-4)">
            <div class="eyebrow">Sites in the demo dataset</div>
            <div class="stack" style="gap:var(--sp-1);margin-top:var(--sp-2)">
              ${sites.map((s) => `<a href="site-detail.html?site=${esc(s.siteId)}"
                style="font-size:var(--fs-sm)">${esc(s.name)} · ${s.connectedLoadMW} MW</a>`).join('')}
            </div>
          </div>` : ''}
      </div>`;
  }

  function renderRationale() {
    const items = [
      'A 2–50 MW industrial site has the load density that makes optimisation worth the integration cost',
      'Plants inside a 15 km radius can share flexibility, storage and eventually physical routing',
      'One reference customer in a cluster reaches every other plant in that cluster',
      'State policy applies cluster-wide — one regulatory analysis serves many sites',
      'Multi-plant groups buy once and deploy across their whole portfolio',
      'Aggregated capacity clears the minimum bid size that a single site cannot reach alone',
    ];
    document.querySelector('[data-cluster-rationale]').innerHTML =
      items.map((i) => `<li>${ENX.router.iconHTML('check')}<span>${esc(i)}</span></li>`).join('');
  }

  function renderRows() {
    document.querySelector('[data-network-rows]').innerHTML = D.network.nodes
      .slice().sort((a, b) => a.priority - b.priority)
      .map((n) => `
        <tr data-node="${esc(n.nodeId)}" data-clickable>
          <td class="num table__primary">${n.priority}</td>
          <td class="table__primary">${esc(n.name)}</td>
          <td>${esc(n.state)}</td>
          <td class="text-secondary" style="font-size:var(--fs-xs)">${esc(n.industries)}</td>
          <td class="num">${n.sites}</td>
          <td class="num">${n.euMW} MW</td>
          <td class="num">${n.flexMW} MW</td>
          <td>${ENX.ui.pill(n.status)}</td>
        </tr>`).join('');

    document.querySelectorAll('[data-node]').forEach((row) => {
      row.addEventListener('click', () => {
        const n = D.network.nodes.find((x) => x.nodeId === row.dataset.node);
        showCluster(n);
        document.querySelector('[data-network-map]').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }
})();
