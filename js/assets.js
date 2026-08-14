/**
 * Energy Nexus — asset centre.
 * Estate-wide asset register with category, site and status filtering.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};
  let query = '', typeFilter = 'ALL', siteFilter = 'ALL', statusFilter = 'ALL';

  const TYPES = ['ALL', 'grid', 'solar', 'bess', 'dg', 'chiller', 'hvac', 'compressor', 'ev', 'production', 'thermal', 'meter'];

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['sites', 'assets', 'telemetry', 'alerts', 'agents']).then((data) => {
      D = data;
      // Deep link from global search: assets.html?asset=ID
      const params = new URLSearchParams(location.search);
      if (params.get('asset')) query = params.get('asset');
      const search = document.querySelector('[data-asset-search]');
      if (query) search.value = query;

      renderKPIs();
      renderFilters();
      renderRows();
      wire();
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  function filtered() {
    const q = query.toLowerCase();
    return D.assets.assets.filter((a) =>
      (typeFilter === 'ALL' || a.type === typeFilter) &&
      (siteFilter === 'ALL' || a.siteId === siteFilter) &&
      (statusFilter === 'ALL' || a.status === statusFilter) &&
      (!q || a.name.toLowerCase().includes(q) || a.assetId.toLowerCase().includes(q) || a.siteName.toLowerCase().includes(q)));
  }

  function renderKPIs() {
    const all = D.assets.assets;
    const controllable = all.filter((a) => a.controllable);
    const kpis = [
      { label: 'Connected assets', value: all.length, accent: 'var(--accent-cyan)', note: `${D.sites.sites.length} sites` },
      { label: 'Under control', value: controllable.length, accent: 'var(--accent-green)', note: 'Tier 2 or above' },
      { label: 'Online', value: all.filter((a) => a.status === 'ONLINE').length, accent: 'var(--accent-blue)', note: 'Reporting normally' },
      { label: 'Warning', value: all.filter((a) => a.status === 'WARNING').length, accent: 'var(--accent-amber)', note: 'Needs attention' },
      { label: 'Offline', value: all.filter((a) => a.status === 'OFFLINE').length, accent: 'var(--accent-red)', note: 'No telemetry' },
      { label: 'Rated capacity', value: all.reduce((s, a) => s + (a.ratedMW || 0), 0), decimals: 1, unit: 'MW', accent: 'var(--e-solar)', note: 'Sum of nameplate' },
    ];
    document.querySelector('[data-asset-kpis]').innerHTML = kpis.map((k, i) => `
      <div class="kpi" style="--kpi-accent:${k.accent}">
        <div class="kpi__label">${esc(k.label)}</div>
        <div class="kpi__value"><span data-count="${i}">0</span>${k.unit ? `<span class="kpi__unit">${esc(k.unit)}</span>` : ''}</div>
        <div class="kpi__foot"><span class="kpi__note">${esc(k.note)}</span></div>
      </div>`).join('');

    kpis.forEach((k, i) => {
      ENX.ui.countUp(document.querySelector(`[data-count="${i}"]`), k.value, {
        decimals: k.decimals || 0,
        format: (v) => v.toFixed(k.decimals || 0),
      });
    });
  }

  function renderFilters() {
    const counts = {};
    D.assets.assets.forEach((a) => { counts[a.type] = (counts[a.type] || 0) + 1; });
    counts.ALL = D.assets.assets.length;

    document.querySelector('[data-type-filters]').innerHTML = TYPES.map((t) => `
      <button class="chip" data-type="${t}" aria-pressed="${t === typeFilter}">
        ${esc(t === 'ALL' ? 'All types' : t.toUpperCase())}<span class="chip__count">${counts[t] || 0}</span>
      </button>`).join('');

    document.querySelector('[data-site-filter]').innerHTML =
      '<option value="ALL">All sites</option>' +
      D.sites.sites.map((s) => `<option value="${esc(s.siteId)}">${esc(s.name)}</option>`).join('');

    document.querySelectorAll('[data-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        typeFilter = btn.dataset.type;
        document.querySelectorAll('[data-type]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b.dataset.type === typeFilter)));
        renderRows();
      });
    });
  }

  function renderRows() {
    const list = filtered();
    const host = document.querySelector('[data-asset-rows]');

    if (!list.length) {
      host.innerHTML = `<tr><td colspan="9">
        <div class="empty-state"><h3>No assets match</h3>
        <p>Adjust the filters or clear the search to see the full register.</p></div></td></tr>`;
      return;
    }

    host.innerHTML = list.map((a) => {
      const tel = a.telemetry || {};
      const first = Object.keys(tel)[0];
      return `
        <tr data-asset="${esc(a.assetId)}" data-clickable>
          <td class="table__primary">${esc(a.name)}<div class="table__meta">${esc(a.assetId)}</div></td>
          <td>${esc(a.siteName)}</td>
          <td><span class="pill">${esc(a.type.toUpperCase())}</span></td>
          <td class="num">${a.ratedMW} MW</td>
          <td class="num">${a.utilisationPct}%</td>
          <td class="num ${a.health < 97 ? 'text-warning' : ''}">${a.health}%</td>
          <td class="table__meta mono">${first ? `${esc(humanise(first))}: ${esc(tel[first])}` : '—'}</td>
          <td>${a.controllable ? ENX.ui.tierBadge(a.tier) : '<span class="pill">MONITOR</span>'}</td>
          <td>${ENX.ui.pill(a.status)}</td>
        </tr>`;
    }).join('');

    host.querySelectorAll('[data-asset]').forEach((row) => {
      row.addEventListener('click', () => openAsset(row.dataset.asset));
    });
  }

  function openAsset(assetId) {
    const a = D.assets.assets.find((x) => x.assetId === assetId);
    if (!a) return;
    const site = D.sites.sites.find((s) => s.siteId === a.siteId);
    const m = ENX.twin.model(site, D.assets, D.telemetry, ENX.demo.index(D.telemetry.intervalMinutes));
    const node = m.sources.concat(m.loads).find((x) => x.type === a.type)
      || { type: a.type, power: 0, status: a.status.toLowerCase() };
    ENX.twin.openInspector(Object.assign({}, node, { assetId: a.assetId }), m);
  }

  function humanise(k) {
    return k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  }

  function wire() {
    document.querySelector('[data-asset-search]').addEventListener('input', (e) => {
      query = e.target.value; renderRows();
    });
    document.querySelector('[data-site-filter]').addEventListener('change', (e) => {
      siteFilter = e.target.value; renderRows();
    });
    document.querySelector('[data-status-filter]').addEventListener('change', (e) => {
      statusFilter = e.target.value; renderRows();
    });
    document.querySelector('[data-export-assets]').addEventListener('click', () => {
      ENX.report.exportCSV('energy-nexus-assets', filtered().map((a) => ({
        assetId: a.assetId, name: a.name, site: a.siteName, type: a.type,
        ratedMW: a.ratedMW, utilisationPct: a.utilisationPct, health: a.health,
        controllable: a.controllable, tier: a.tier, status: a.status,
      })));
    });
  }
})();
