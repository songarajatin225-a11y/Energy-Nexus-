/**
 * Energy Nexus — carbon and ESG.
 *
 * Scope 2 emissions, renewable share and carbon-aware scheduling, derived
 * entirely from the simulated telemetry every other screen reads. Nothing is
 * stored here that the generator did not produce.
 *
 * Method: location-based Scope 2 = metered grid import × a flat modelled grid
 * factor. The factor is the one tools/generate-data.js uses for daily carbon,
 * so the totals here reconcile to the dataset rather than to a second model.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  const FACTOR = 0.71;          // tCO₂e per MWh — must match the generator
  const WINDOW_HOURS = 4;       // length of the "cleanest window" suggestion
  let D = {};

  const nf = (d) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d) => nf(d === undefined ? 0 : d).format(v || 0);

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['sites', 'telemetry', 'optimisation']).then((data) => {
      D = data;
      document.querySelector('[data-factor]').textContent = FACTOR.toFixed(2);
      const T = totals();
      renderKPIs(T);
      renderTrend();
      renderMix(T);
      renderIntensity();
      renderRows();
      renderMethod();
      document.querySelectorAll('[data-export-brsr]').forEach((b) => b.addEventListener('click', exportBRSR));
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  document.addEventListener('enx:sitechange', () => { if (D.sites) renderIntensity(); });
  document.addEventListener('enx:tick', () => { if (D.sites) renderIntensity(); });

  /* ------------------------------------------------------------ model */
  function perSite(site) {
    const days = D.telemetry.daily[site.siteId] || [];
    const sum = (k) => days.reduce((t, d) => t + d[k], 0);
    const grid = sum('gridMWh');
    const solar = sum('solarMWh');
    const supplied = grid + solar;
    const scope2 = sum('carbonT');
    return {
      site, days, grid, solar, supplied, scope2,
      renewable: supplied ? (solar / supplied) * 100 : 0,
      intensity: supplied ? (scope2 / supplied) * 1000 : 0,   // kgCO₂e per MWh supplied
      avoided: solar * FACTOR,
    };
  }

  function totals() {
    const rows = D.sites.sites.map(perSite);
    const add = (k) => rows.reduce((t, r) => t + r[k], 0);
    const supplied = add('supplied');
    const applied = D.optimisation.runs.filter((r) => r.status === 'APPLIED');
    return {
      rows,
      grid: add('grid'), solar: add('solar'), supplied,
      scope2: add('scope2'), avoided: add('avoided'),
      renewable: supplied ? (add('solar') / supplied) * 100 : 0,
      intensity: supplied ? (add('scope2') / supplied) * 1000 : 0,
      optimisedRuns: applied.length,
      optimisedT: applied.reduce((t, r) => t + (r.carbonReductionTCO2e || 0), 0),
    };
  }

  /** Estate series by day, aligned on dayOffset. */
  function estateDaily(key) {
    const first = D.telemetry.daily[D.sites.sites[0].siteId];
    return first.map((_, i) => D.sites.sites.reduce((t, s) => t + D.telemetry.daily[s.siteId][i][key], 0));
  }

  function dayLabels() {
    const first = D.telemetry.daily[D.sites.sites[0].siteId];
    const today = new Date();
    return first.map((d) => {
      const dt = new Date(today);
      dt.setDate(today.getDate() + d.dayOffset);
      return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    });
  }

  /* -------------------------------------------------------------- KPIs */
  function renderKPIs(T) {
    const scope2Daily = estateDaily('carbonT');
    const solarDaily = estateDaily('solarMWh');
    const site = ENX.data.siteById(D.sites, ENX.state.get('siteId'));
    const kpis = [
      { label: 'Scope 2 emissions', value: T.scope2, unit: 'tCO₂e', d: 0, accent: 'var(--e-grid)', note: 'Last 30 days · 8 flagship sites', spark: scope2Daily },
      { label: 'Emissions intensity', value: T.intensity, unit: 'kg/MWh', d: 0, accent: 'var(--e-grid)', note: 'Per MWh of electricity supplied' },
      { label: 'Renewable share', value: T.renewable, unit: '%', d: 1, accent: 'var(--e-solar)', note: 'On-site solar, of 30-day supply', spark: solarDaily },
      { label: 'Avoided by solar', value: T.avoided, unit: 'tCO₂e', d: 0, accent: 'var(--e-solar)', note: 'At the same grid factor' },
      { label: 'Reduction from optimisation', value: T.optimisedT, unit: 'tCO₂e', d: 1, accent: 'var(--accent-green)', note: `As recorded by ${T.optimisedRuns} applied runs` },
      { label: 'Grid intensity now', value: liveIntensity(site), unit: 'g/kWh', d: 0, accent: 'var(--e-grid)', note: site.name, live: true },
    ];
    const strip = document.querySelector('[data-carbon-kpis]');
    strip.innerHTML = kpis.map((k, i) => `
      <div class="kpi" style="--kpi-accent:${k.accent}">
        <div class="kpi__label">${esc(k.label)}</div>
        <div class="kpi__value"><span data-count="${i}">0</span><span class="kpi__unit">${esc(k.unit)}</span></div>
        ${k.spark ? `<div class="kpi__spark" data-spark="${i}"></div>` : ''}
        <div class="kpi__foot"><span class="kpi__note"${k.live ? ' data-live-note' : ''}>${esc(k.note)}</span></div>
      </div>`).join('');
    kpis.forEach((k, i) => {
      const el = strip.querySelector(`[data-count="${i}"]`);
      if (k.live) el.dataset.liveIntensity = 'true';
      ENX.ui.countUp(el, k.value, { decimals: k.d, format: (v) => fmt(v, k.d) });
      if (k.spark) ENX.charts.sparkline(strip.querySelector(`[data-spark="${i}"]`), k.spark, { color: k.accent, height: 26 });
    });
  }

  function liveIntensity(site) {
    const s = D.telemetry.series[site.siteId];
    return s.carbon[ENX.demo.index(D.telemetry.intervalMinutes)];
  }

  /* ------------------------------------------------------------- trend */
  function renderTrend() {
    const scope2 = estateDaily('carbonT');
    const avoided = estateDaily('solarMWh').map((v) => v * FACTOR);
    ENX.charts.line(document.querySelector('[data-carbon-trend]'), {
      height: 280,
      labels: dayLabels(),
      xTicks: 6,
      ariaLabel: 'Daily Scope 2 emissions and emissions avoided by solar, last 30 days',
      yFormat: (v) => v.toFixed(0),
      tooltipFormat: (v) => `${v.toFixed(1)} tCO₂e`,
      series: [
        { key: 'scope2', name: 'Scope 2 emitted', color: 'var(--e-grid)', values: scope2, type: 'area' },
        { key: 'avoided', name: 'Avoided by solar', color: 'var(--e-solar)', values: avoided, dashed: true },
      ],
    });
  }

  /* --------------------------------------------------------------- mix */
  function renderMix(T) {
    const segs = [
      { name: 'Grid', value: T.grid, color: 'var(--e-grid)', label: `${fmt(T.grid)} MWh` },
      { name: 'On-site solar', value: T.solar, color: 'var(--e-solar)', label: `${fmt(T.solar)} MWh` },
    ];
    ENX.charts.donut(document.querySelector('[data-carbon-mix]'), segs, {
      size: 190, thickness: 26,
      centerValue: `${T.renewable.toFixed(1)}%`, centerLabel: 'renewable',
      ariaLabel: `Electricity by source: ${segs.map((s) => `${s.name} ${s.label}`).join(', ')}`,
    });
    document.querySelector('[data-carbon-mix-legend]').innerHTML = segs.map((s) => `
      <div class="row row--between" style="padding:5px 0;border-bottom:1px solid var(--border-subtle)">
        <div class="row" style="gap:7px">
          <span style="width:9px;height:9px;border-radius:2px;background:${s.color}"></span>
          <span style="font-size:var(--fs-sm)">${esc(s.name)}</span>
        </div>
        <span class="num" style="font-size:var(--fs-sm)">${esc(s.label)}</span>
      </div>`).join('');
  }

  /* --------------------------------------------- intensity + window */
  /** The lowest-average run of WINDOW_HOURS through the day. */
  function cleanestWindow(values, interval) {
    const n = Math.round((WINDOW_HOURS * 60) / interval);
    let best = { start: 0, avg: Infinity };
    for (let i = 0; i + n <= values.length; i++) {
      let sum = 0;
      for (let k = i; k < i + n; k++) sum += values[k];
      if (sum / n < best.avg) best = { start: i, avg: sum / n };
    }
    return Object.assign(best, { end: best.start + n });
  }

  function renderIntensity() {
    const site = ENX.data.siteById(D.sites, ENX.state.get('siteId'));
    const tel = D.telemetry.series[site.siteId];
    const interval = D.telemetry.intervalMinutes;
    const now = ENX.demo.index(interval);
    const values = tel.carbon;
    const labels = tel.t.map((m) => ENX.fmt.clock(m));
    const win = cleanestWindow(values, interval);
    const dayAvg = values.reduce((a, b) => a + b, 0) / values.length;
    const peak = Math.max(...values);

    document.querySelector('[data-intensity-site]').textContent = `Grid intensity today — ${site.name}`;
    ENX.charts.line(document.querySelector('[data-carbon-intensity]'), {
      height: 240,
      labels,
      nowIndex: now,
      zeroBase: false,
      bands: [],
      refLines: [{ value: dayAvg, label: `Day average ${dayAvg.toFixed(0)}` }],
      ariaLabel: `Grid carbon intensity through today at ${site.name}; cleanest window ${labels[win.start]} to ${labels[win.end % labels.length]}`,
      yFormat: (v) => v.toFixed(0),
      tooltipFormat: (v) => `${v.toFixed(0)} gCO₂/kWh`,
      series: [{ key: 'carbon', name: 'Grid intensity', color: 'var(--e-grid)', values, type: 'area' }],
    });

    // What moving one MWh of flexible load from the dirtiest hour to the window saves.
    const perMWh = (peak - win.avg) / 1000;   // tCO₂e per MWh shifted
    const inWindow = now >= win.start && now < win.end;
    const endLabel = labels[win.end % labels.length];
    document.querySelector('[data-carbon-window]').innerHTML = `
      <div>
        <div class="eyebrow">Run flexible load</div>
        <div class="ws-carbon-window">${esc(labels[win.start])} – ${esc(endLabel)}</div>
        <div class="text-secondary" style="font-size:var(--fs-sm)">Average ${win.avg.toFixed(0)} gCO₂/kWh —
          ${(((dayAvg - win.avg) / dayAvg) * 100).toFixed(0)}% below the day average.</div>
      </div>
      <div class="callout ${inWindow ? 'callout--positive' : 'callout--info'}">
        <div>${inWindow
          ? '<strong>The window is open now.</strong> Pre-cooling, thermal storage charging and batch processes run cleanest here.'
          : `<strong>${now < win.start ? `Window opens at ${esc(labels[win.start])}.` : `Window reopens tomorrow at ${esc(labels[win.start])}.`}</strong> Schedule deferrable load — pre-cooling, storage charging, batch lines — into it.`}</div>
      </div>
      <dl class="dl">
        <dt>Saving per MWh shifted</dt><dd>${perMWh.toFixed(2)} tCO₂e</dd>
        <dt>Dirtiest reading today</dt><dd>${peak.toFixed(0)} g/kWh</dd>
        <dt>Reading now</dt><dd>${values[now].toFixed(0)} g/kWh</dd>
      </dl>
      <p class="text-tertiary" style="font-size:var(--fs-xs);margin:0">Saving compares the window with the day's
        dirtiest reading. Shifting depends on process constraints in the site's constraint register.</p>`;

    const live = document.querySelector('[data-live-intensity]');
    if (live) live.textContent = fmt(liveIntensity(site), 0);
    const note = document.querySelector('[data-live-note]');
    if (note) note.textContent = site.name;
  }

  /* -------------------------------------------------------------- table */
  function renderRows() {
    const rows = D.sites.sites.map(perSite).sort((a, b) => b.scope2 - a.scope2);
    const host = document.querySelector('[data-carbon-rows]');
    host.innerHTML = rows.map((r) => `
      <tr data-site="${esc(r.site.siteId)}" data-clickable tabindex="0">
        <td class="table__primary">${esc(r.site.name)}<div class="table__meta">${esc(r.site.location)}</div></td>
        <td class="num">${fmt(r.supplied)} MWh</td>
        <td class="num">${fmt(r.grid)}</td>
        <td class="num" style="color:var(--e-solar)">${fmt(r.solar)}</td>
        <td class="num">${r.renewable.toFixed(1)}%</td>
        <td class="num">${fmt(r.scope2)} t</td>
        <td class="num">${fmt(r.intensity)} kg/MWh</td>
        <td class="num text-positive">${fmt(r.avoided)} t</td>
      </tr>`).join('');
    const open = (row) => { location.href = `site-detail.html?site=${encodeURIComponent(row.dataset.site)}`; };
    host.querySelectorAll('[data-site]').forEach((row) => {
      row.addEventListener('click', () => open(row));
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(row); });
    });
  }

  function renderMethod() {
    const first = D.telemetry.daily[D.sites.sites[0].siteId];
    const labels = dayLabels();
    const items = [
      ['Scope', 'Scope 2, purchased electricity'],
      ['Method', 'Location-based'],
      ['Grid factor', `${FACTOR.toFixed(2)} tCO₂e / MWh (modelled, flat)`],
      ['Boundary', `${D.sites.sites.length} flagship sites of ${D.sites.estate.totalSites}`],
      ['Period', `${labels[0]} – ${labels[first.length - 1]} (${first.length} days)`],
      ['Renewable basis', 'On-site solar generation'],
      ['Not included', 'Scope 1 (diesel generation), Scope 3'],
      ['Data status', 'Simulated — not assured'],
    ];
    document.querySelector('[data-carbon-method]').innerHTML = items
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  }

  /* ------------------------------------------------------------- export */
  function exportBRSR() {
    const T = totals();
    const labels = dayLabels();
    const period = `${labels[0]} – ${labels[labels.length - 1]}`;
    const row = (name, id, r) => ({
      entity: name,
      siteId: id,
      period,
      electricityTotalMWh: r.supplied.toFixed(1),
      electricityRenewableMWh: r.solar.toFixed(1),
      electricityNonRenewableMWh: r.grid.toFixed(1),
      renewableSharePct: r.renewable.toFixed(1),
      scope2TCO2e: r.scope2.toFixed(1),
      intensityTCO2ePerMWh: (r.intensity / 1000).toFixed(3),
      gridFactorTCO2ePerMWh: FACTOR.toFixed(2),
      method: 'Location-based',
      dataStatus: 'SIMULATED — not assured',
    });
    const rows = T.rows.map((r) => row(r.site.name, r.site.siteId, r));
    rows.push(row('Estate total (flagship sites)', 'ALL', T));
    ENX.report.exportCSV('energy-nexus-brsr-scope2', rows);
  }
})();
