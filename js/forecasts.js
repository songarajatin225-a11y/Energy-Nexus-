/**
 * Energy Nexus — forecast centre.
 * Load, solar and price forecasts with confidence bands, plus measured accuracy.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};
  let horizon = 72;

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['sites', 'forecasts', 'telemetry']).then((data) => {
      D = data;
      renderAll();
      wire();
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  document.addEventListener('enx:sitechange', () => { if (D.sites) renderAll(); });

  function site() { return ENX.data.siteById(D.sites, ENX.state.get('siteId')); }

  /** Hour labels across the horizon, marked with the day when it rolls over. */
  function labels(n) {
    const out = [];
    const now = new Date();
    for (let h = 0; h < n; h++) {
      const d = new Date(now.getTime() + h * 3600000);
      out.push(h % 24 === 0 || h === 0
        ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
        : `${String(d.getHours()).padStart(2, '0')}:00`);
    }
    return out;
  }

  function renderAll() {
    const s = site();
    document.querySelector('[data-fc-sub]').textContent =
      `${s.name} · ${s.location} · P10–P90 confidence bands, widening with horizon`;
    renderKPIs();
    renderLoad();
    renderSolar();
    renderPrice();
    renderAccuracy();
    renderHorizons();
  }

  function renderKPIs() {
    const f = D.forecasts.series[site().siteId];
    const n = horizon;
    const load = f.load.slice(0, n);
    const solar = f.solar.slice(0, n);
    const peak = Math.max.apply(null, load);
    const peakHour = load.indexOf(peak);
    const solarTotal = solar.reduce((a, b) => a + b, 0);
    const cost = load.reduce((a, v, i) => a + v * 1000 * f.price[i], 0);

    const kpis = [
      { label: 'Forecast peak', value: peak, decimals: 2, unit: 'MW', accent: 'var(--accent-red)', note: `in ${peakHour} h · ${((peak / site().peakMW) * 100).toFixed(0)}% of contracted` },
      { label: 'Forecast energy', value: load.reduce((a, b) => a + b, 0), decimals: 0, unit: 'MWh', accent: 'var(--e-load)', note: `over ${n} hours` },
      { label: 'Solar yield', value: solarTotal, decimals: 0, unit: 'MWh', accent: 'var(--e-solar)', note: `${((solarTotal / load.reduce((a, b) => a + b, 0)) * 100).toFixed(0)}% of demand` },
      { label: 'Forecast cost', value: cost / 1e5, decimals: 1, prefix: '₹', unit: 'L', accent: 'var(--accent-amber)', note: 'at published ToD rates' },
      { label: 'Load MAPE', value: f.accuracy.loadMapePct, decimals: 1, unit: '%', accent: 'var(--accent-green)', note: 'rolling 30-day' },
      { label: 'Peak hit rate', value: f.accuracy.peakHitRatePct, decimals: 1, unit: '%', accent: 'var(--accent-cyan)', note: 'excursions predicted' },
    ];

    document.querySelector('[data-fc-kpis]').innerHTML = kpis.map((k, i) => `
      <div class="kpi" style="--kpi-accent:${k.accent}">
        <div class="kpi__label">${esc(k.label)}</div>
        <div class="kpi__value">
          ${k.prefix ? `<span class="kpi__unit" style="margin-right:0">${esc(k.prefix)}</span>` : ''}
          <span data-count="${i}">0</span><span class="kpi__unit">${esc(k.unit)}</span>
        </div>
        <div class="kpi__foot"><span class="kpi__note">${esc(k.note)}</span></div>
      </div>`).join('');

    kpis.forEach((k, i) => ENX.ui.countUp(document.querySelector(`[data-count="${i}"]`), k.value, {
      decimals: k.decimals, format: (v) => v.toFixed(k.decimals),
    }));
  }

  function renderLoad() {
    const f = D.forecasts.series[site().siteId];
    const t = D.telemetry.series[site().siteId];
    const n = horizon;

    // Show the last 12 hours of measured load before the forecast begins.
    const HIST = 12;
    const i = ENX.demo.index(D.telemetry.intervalMinutes);
    const hist = [];
    for (let h = HIST; h > 0; h--) {
      let k = (i - h * 4) % t.loadMW.length;
      if (k < 0) k += t.loadMW.length;
      hist.push(t.loadMW[k]);
    }

    const measured = hist.concat(new Array(n).fill(null));
    const p50 = new Array(HIST).fill(null).concat(f.load.slice(0, n));
    const lower = new Array(HIST).fill(hist[HIST - 1]).concat(f.loadP10.slice(0, n));
    const upper = new Array(HIST).fill(hist[HIST - 1]).concat(f.loadP90.slice(0, n));

    const histLabels = [];
    for (let h = HIST; h > 0; h--) {
      const d = new Date(Date.now() - h * 3600000);
      histLabels.push(`${String(d.getHours()).padStart(2, '0')}:00`);
    }

    ENX.charts.line(document.querySelector('[data-load-forecast]'), {
      height: 330,
      labels: histLabels.concat(labels(n)),
      nowIndex: HIST,
      ariaLabel: `Load forecast for ${site().name}`,
      yFormat: (v) => v.toFixed(1),
      tooltipFormat: (v) => `${v.toFixed(2)} MW`,
      bands: [{ key: 'band', name: 'P10–P90 band', color: 'var(--e-load)', lower, upper }],
      series: [
        { key: 'measured', name: 'Measured', color: 'var(--accent-cyan)', values: measured },
        { key: 'p50', name: 'Forecast P50', color: 'var(--e-load)', values: p50, dashed: true },
      ],
      refLines: [{ value: site().peakMW, label: `Contracted ${site().peakMW} MW` }],
    });
  }

  function renderSolar() {
    const f = D.forecasts.series[site().siteId];
    const n = horizon;
    ENX.charts.line(document.querySelector('[data-solar-forecast]'), {
      height: 260,
      labels: labels(n),
      ariaLabel: `Solar forecast for ${site().name}`,
      yFormat: (v) => v.toFixed(1),
      tooltipFormat: (v) => `${v.toFixed(2)} MW`,
      bands: [{ key: 'band', name: 'P10–P90', color: 'var(--e-solar)', lower: f.solarP10.slice(0, n), upper: f.solarP90.slice(0, n) }],
      series: [{ key: 'solar', name: 'Solar P50', color: 'var(--e-solar)', values: f.solar.slice(0, n), type: 'area' }],
    });
  }

  function renderPrice() {
    const f = D.forecasts.series[site().siteId];
    const n = horizon;
    ENX.charts.line(document.querySelector('[data-price-forecast]'), {
      height: 260,
      labels: labels(n),
      ariaLabel: `Tariff and planned battery state of charge for ${site().name}`,
      yFormat: (v) => v.toFixed(0),
      tooltipFormat: (v, s) => (s.key === 'price' ? `₹${v.toFixed(2)}/kWh` : `${v.toFixed(0)}%`),
      series: [
        { key: 'soc', name: 'Planned SoC (%)', color: 'var(--e-bess)', values: f.soc.slice(0, n), type: 'area' },
        { key: 'price', name: 'Tariff (₹/kWh)', color: 'var(--accent-amber)', values: f.price.slice(0, n) },
      ],
    });
  }

  function renderAccuracy() {
    document.querySelector('[data-accuracy-rows]').innerHTML = D.sites.sites.map((s) => {
      const a = D.forecasts.series[s.siteId].accuracy;
      const quality = a.loadMapePct < 5 ? 'ONLINE' : a.loadMapePct < 6.5 ? 'WARNING' : 'OFFLINE';
      const label = a.loadMapePct < 5 ? 'EXCELLENT' : a.loadMapePct < 6.5 ? 'ACCEPTABLE' : 'REVIEW';
      return `<tr>
        <td class="table__primary">${esc(s.name)}<div class="table__meta">${esc(s.siteId)}</div></td>
        <td class="num">${a.loadMapePct}%</td>
        <td class="num">${a.solarMapePct}%</td>
        <td class="num">${a.peakHitRatePct}%</td>
        <td><span class="pill pill--${ENX.fmt.slug(quality)}">${esc(label)}</span></td>
      </tr>`;
    }).join('');
  }

  function renderHorizons() {
    const rows = [
      ['Intraday', '0–6 h', 'Dispatch and peak avoidance'],
      ['Day-ahead', '6–36 h', 'Battery plan, open-access nomination'],
      ['Week-ahead', '1–7 d', 'Flexibility commitment, maintenance windows'],
      ['Seasonal', '1–12 m', 'Contract demand, capacity planning'],
    ];
    document.querySelector('[data-fc-horizons]').innerHTML = rows.map((r) => `
      <div class="metric-row">
        <span class="metric-row__label">${esc(r[0])}<br>
          <span class="text-tertiary" style="font-size:10px">${esc(r[2])}</span></span>
        <span class="metric-row__value">${esc(r[1])}</span>
      </div>`).join('');
  }

  function wire() {
    document.querySelectorAll('[data-horizon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        horizon = parseInt(btn.dataset.horizon, 10);
        document.querySelectorAll('[data-horizon]').forEach((b) =>
          b.setAttribute('aria-pressed', String(parseInt(b.dataset.horizon, 10) === horizon)));
        renderKPIs(); renderLoad(); renderSolar(); renderPrice();
      });
    });
  }
})();
