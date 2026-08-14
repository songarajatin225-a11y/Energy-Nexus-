/**
 * Energy Nexus — single site deep dive.
 * Reads ?site=ID, falls back to the globally selected site.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};
  let siteId = null;

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    const params = new URLSearchParams(location.search);
    siteId = params.get('site') || ENX.state.get('siteId');

    ENX.data.loadAll(['sites', 'assets', 'telemetry', 'alerts', 'agents', 'transactions']).then((data) => {
      D = data;
      if (!D.sites.sites.some((s) => s.siteId === siteId)) siteId = D.sites.sites[0].siteId;
      // Opening a site makes it the active context everywhere else.
      ENX.state.set('siteId', siteId);
      const sel = document.querySelector('[data-action="site-select"]');
      if (sel) sel.value = siteId;
      renderAll();
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  document.addEventListener('enx:tick', () => { if (D.sites) { renderKPIs(); renderChart(); renderBess(); } });
  document.addEventListener('enx:sitechange', (e) => {
    siteId = e.detail.siteId;
    if (D.sites) renderAll();
  });

  function site() { return D.sites.sites.find((s) => s.siteId === siteId); }
  function idx() { return ENX.demo.index(D.telemetry.intervalMinutes); }

  function renderAll() {
    const s = site();
    document.title = `${s.name} · Energy Nexus`;
    document.querySelector('[data-site-id]').textContent = s.siteId;
    document.querySelector('[data-site-name]').textContent = s.name;
    document.querySelector('[data-site-meta]').textContent =
      `${s.location} · ${s.industry} · ${s.shifts}-shift · ${s.connectedLoadMW} MW connected load · ${s.cluster} cluster`;
    document.querySelector('[data-site-tier]').innerHTML = ENX.ui.tierBadge(s.agentTier);

    renderKPIs(); renderChart(); renderBess(); renderSavings();
    renderDecisions(); renderAlerts(); renderAssets();
  }

  function renderKPIs() {
    const s = site();
    const t = D.telemetry.series[siteId];
    const i = idx();
    const daily = D.telemetry.daily[siteId];
    const today = daily[daily.length - 1];

    const kpis = [
      { label: 'Current demand', value: t.loadMW[i], decimals: 2, unit: 'MW', accent: 'var(--e-load)', note: `${((t.loadMW[i] / s.connectedLoadMW) * 100).toFixed(0)}% of connected load` },
      { label: 'Grid import', value: t.gridMW[i], decimals: 2, unit: 'MW', accent: 'var(--e-grid)', note: `₹${t.tariff[i].toFixed(2)}/kWh now` },
      { label: 'Solar', value: t.solarMW[i], decimals: 2, unit: 'MW', accent: 'var(--e-solar)', note: `${s.solarMW} MW installed` },
      { label: 'Energy today', value: today.loadMWh, decimals: 1, unit: 'MWh', accent: 'var(--accent-cyan)', note: `${today.solarMWh} MWh from solar` },
      { label: 'Cost today', value: today.costINR / 1e5, decimals: 2, prefix: '₹', unit: 'L', accent: 'var(--accent-amber)', note: 'Grid import at ToD rates' },
      { label: 'Savings rate', value: s.savingsPercent, decimals: 1, unit: '%', accent: 'var(--accent-green)', note: 'Verified against baseline' },
    ];

    document.querySelector('[data-site-kpis]').innerHTML = kpis.map((k, n) => `
      <div class="kpi" style="--kpi-accent:${k.accent}">
        <div class="kpi__label">${esc(k.label)}</div>
        <div class="kpi__value">
          ${k.prefix ? `<span class="kpi__unit" style="margin-right:0">${esc(k.prefix)}</span>` : ''}
          <span data-count="${n}">0</span><span class="kpi__unit">${esc(k.unit)}</span>
        </div>
        <div class="kpi__foot"><span class="kpi__note">${esc(k.note)}</span></div>
      </div>`).join('');

    kpis.forEach((k, n) => {
      ENX.ui.countUp(document.querySelector(`[data-count="${n}"]`), k.value, {
        decimals: k.decimals, format: (v) => v.toFixed(k.decimals),
      });
    });
  }

  function renderChart() {
    const t = D.telemetry.series[siteId];
    const i = idx();
    const w = (arr) => ENX.data.window(arr, i, 24, D.telemetry.intervalMinutes);
    const load = w(t.loadMW);
    const tariffs = w(t.tariff);

    const periods = [];
    let start = 0;
    for (let k = 1; k <= tariffs.length; k++) {
      if (k === tariffs.length || tariffs[k] !== tariffs[start]) {
        const rate = tariffs[start];
        periods.push({ from: start, to: k - 1, kind: rate >= 9.5 ? 'peak' : rate <= 5.5 ? 'offpeak' : 'normal' });
        start = k;
      }
    }

    ENX.charts.line(document.querySelector('[data-site-chart]'), {
      height: 300,
      labels: ENX.data.windowLabels(i, 24, D.telemetry.intervalMinutes, load.length),
      periods,
      zeroBase: false,
      ariaLabel: `24-hour energy profile for ${site().name}`,
      yFormat: (v) => v.toFixed(1),
      tooltipFormat: (v) => `${v.toFixed(2)} MW`,
      series: [
        { key: 'load', name: 'Load', color: 'var(--e-load)', values: load, type: 'area' },
        { key: 'grid', name: 'Grid', color: 'var(--e-grid)', values: w(t.gridMW) },
        { key: 'solar', name: 'Solar', color: 'var(--e-solar)', values: w(t.solarMW), type: 'area' },
        { key: 'bess', name: 'BESS', color: 'var(--e-bess)', values: w(t.bessMW) },
      ],
      refLines: [{ value: site().peakMW, label: `Contracted ${site().peakMW} MW` }],
    });
  }

  function renderBess() {
    const s = site();
    const t = D.telemetry.series[siteId];
    const i = idx();
    const soc = t.socPct[i];
    const power = t.bessMW[i];

    ENX.charts.gauge(document.querySelector('[data-soc-gauge]'), soc, {
      size: 128, thickness: 10, max: 100,
      color: soc < 25 ? 'var(--accent-amber)' : 'var(--accent-green)',
      display: `${soc.toFixed(0)}%`, sub: 'State of charge',
      label: 'Battery state of charge',
    });

    const bess = D.assets.assets.find((a) => a.siteId === siteId && a.type === 'bess');
    document.querySelector('[data-bess-detail]').innerHTML = `
      <div class="metric-row">
        <span class="metric-row__label">Mode</span>
        <span class="metric-row__value ${power > 0.02 ? 'text-positive' : power < -0.02 ? 'text-active' : ''}">
          ${power > 0.02 ? 'Discharging' : power < -0.02 ? 'Charging' : 'Idle'}</span>
      </div>
      <div class="metric-row"><span class="metric-row__label">Power</span>
        <span class="metric-row__value">${Math.abs(power).toFixed(2)} MW</span></div>
      <div class="metric-row"><span class="metric-row__label">Capacity</span>
        <span class="metric-row__value">${s.bess.powerMW} MW / ${s.bess.capacityMWh} MWh</span></div>
      <div class="metric-row"><span class="metric-row__label">Cycles</span>
        <span class="metric-row__value">${bess ? bess.telemetry.cycles : '—'}</span></div>
      <div class="metric-row"><span class="metric-row__label">State of health</span>
        <span class="metric-row__value">${bess ? bess.telemetry.sohPct : '—'}%</span></div>`;
  }

  function renderSavings() {
    const txns = D.transactions.entries.filter((t) => t.siteId === siteId);
    const verified = txns.filter((t) => t.status === 'VERIFIED');
    const total = verified.reduce((a, t) => a + t.verifiedSavingINR, 0);
    const fee = verified.reduce((a, t) => a + t.nexusFeeINR, 0);

    document.querySelector('[data-site-savings]').innerHTML = `
      <div class="metric-row"><span class="metric-row__label">Verified to date</span>
        <span class="metric-row__value text-positive">${ENX.fmt.inr(total)}</span></div>
      <div class="metric-row"><span class="metric-row__label">Nexus fee</span>
        <span class="metric-row__value">${ENX.fmt.inr(fee)}</span></div>
      <div class="metric-row"><span class="metric-row__label">Net customer benefit</span>
        <span class="metric-row__value text-positive">${ENX.fmt.inr(total - fee)}</span></div>
      <div class="metric-row"><span class="metric-row__label">Pending M&amp;V</span>
        <span class="metric-row__value">${txns.length - verified.length} periods</span></div>
      <div class="metric-row"><span class="metric-row__label">Method</span>
        <span class="metric-row__value">${esc(txns[0] ? txns[0].verificationMethod : 'IPMVP Option C')}</span></div>`;
  }

  function renderDecisions() {
    const list = D.agents.decisions.filter((d) => d.siteId === siteId);
    const host = document.querySelector('[data-site-decisions]');
    if (!list.length) {
      host.innerHTML = `<div class="empty-state"><h3>No agent activity yet</h3>
        <p>This site is in monitoring mode. Decisions appear once the agent is commissioned.</p></div>`;
      return;
    }
    host.innerHTML = list.map((d) => `
      <div class="alert-row alert-row--${d.status === 'PENDING APPROVAL' ? 'warning' : 'optimisation'}">
        <div class="alert-row__spine"></div>
        <div style="min-width:0">
          <div class="row row--between" style="align-items:flex-start;gap:var(--sp-3)">
            <div class="alert-row__title">${esc(d.title)}</div>
            ${ENX.ui.pill(d.status)}
          </div>
          <div class="alert-row__detail">${esc(d.whatHappens)}</div>
          <div class="alert-row__meta">
            ${ENX.ui.tierBadge(d.tier)}<span>·</span>
            <span class="text-positive">${ENX.fmt.inr(d.expectedValueINR)}</span><span>·</span>
            <span>${d.confidencePct}% confidence</span><span>·</span>
            <span>${ENX.fmt.ago(d.minuteOfDay)}</span>
          </div>
        </div>
      </div>`).join('');
  }

  function renderAlerts() {
    const list = D.alerts.alerts.filter((a) => a.siteId === siteId);
    const host = document.querySelector('[data-site-alerts]');
    if (!list.length) {
      host.innerHTML = `<div class="empty-state"><h3>No open alerts</h3>
        <p>Everything at this site is inside its normal operating band.</p></div>`;
      return;
    }
    host.innerHTML = list.map(ENX.shell.alertRowHTML).join('');
  }

  function renderAssets() {
    const list = D.assets.assets.filter((a) => a.siteId === siteId);
    document.querySelector('[data-site-assets]').innerHTML = list.map((a) => `
      <tr data-asset="${esc(a.assetId)}" data-clickable>
        <td class="table__primary">${esc(a.name)}<div class="table__meta">${esc(a.assetId)}</div></td>
        <td><span class="pill">${esc(a.type.toUpperCase())}</span></td>
        <td class="num">${a.ratedMW} MW</td>
        <td class="num">${a.utilisationPct}%</td>
        <td class="num">${a.health}%</td>
        <td>${a.controllable ? ENX.ui.tierBadge(a.tier) : '<span class="pill">MONITOR</span>'}</td>
        <td>${ENX.ui.pill(a.status)}</td>
      </tr>`).join('');

    document.querySelectorAll('[data-asset]').forEach((row) => {
      row.addEventListener('click', () => {
        const asset = D.assets.assets.find((a) => a.assetId === row.dataset.asset);
        const m = ENX.twin.model(site(), D.assets, D.telemetry, idx());
        const node = m.sources.concat(m.loads).find((x) => x.type === asset.type)
          || { type: asset.type, power: 0, status: asset.status.toLowerCase() };
        ENX.twin.openInspector(Object.assign({}, node, { assetId: asset.assetId }), m);
      });
    });
  }
})();
