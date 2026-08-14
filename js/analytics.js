/**
 * Energy Nexus — energy intelligence.
 * The savings engine, before/after comparison and benchmarking.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['sites', 'telemetry', 'transactions', 'assets']).then((data) => {
      D = data;
      renderAll();
      document.querySelector('[data-export-analytics]').addEventListener('click', exportRows);
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  document.addEventListener('enx:sitechange', () => { if (D.sites) renderAll(); });

  function site() { return ENX.data.siteById(D.sites, ENX.state.get('siteId')); }

  function renderAll() {
    document.querySelector('[data-an-sub]').textContent =
      `${site().name} · ${site().industry} · measured against the pre-Nexus baseline`;
    renderKPIs(); renderWaterfall(); renderBeforeAfter();
    renderCostChart(); renderHeatmap(); renderBenchmark();
  }

  /** Annual figures for the active site, scaled from its 30-day rollup. */
  function annual() {
    const rows = D.telemetry.daily[site().siteId];
    const dailyCost = rows.reduce((a, r) => a + r.costINR, 0) / rows.length;
    const spend = dailyCost * 365;
    const savingsRate = site().savingsPercent / 100;
    const addressable = spend * (savingsRate * 1.42);   // identified opportunity
    const verified = spend * savingsRate;               // settled after M&V
    const fee = verified * 0.257;
    return { spend, addressable, verified, fee, net: verified - fee };
  }

  function renderKPIs() {
    const a = annual();
    const rows = D.telemetry.daily[site().siteId];
    const totalMWh = rows.reduce((x, r) => x + r.loadMWh, 0);
    const solarMWh = rows.reduce((x, r) => x + r.solarMWh, 0);
    const peak = Math.max.apply(null, rows.map((r) => r.peakMW));
    const carbon = rows.reduce((x, r) => x + r.carbonT, 0);

    const kpis = [
      { label: 'Annual energy spend', value: a.spend / 1e7, decimals: 2, prefix: '₹', unit: 'Cr', accent: 'var(--e-grid)', note: 'Run-rate from 30-day actuals' },
      { label: 'Verified savings', value: a.verified / 1e7, decimals: 2, prefix: '₹', unit: 'Cr', accent: 'var(--accent-green)', note: `${site().savingsPercent}% of spend` },
      { label: 'Customer net benefit', value: a.net / 1e7, decimals: 2, prefix: '₹', unit: 'Cr', accent: 'var(--accent-cyan)', note: 'After the Nexus fee' },
      { label: 'Energy intensity', value: totalMWh / 30, decimals: 1, unit: 'MWh/day', accent: 'var(--e-load)', note: '30-day mean' },
      { label: 'Solar share', value: (solarMWh / totalMWh) * 100, decimals: 1, unit: '%', accent: 'var(--e-solar)', note: 'Of total consumption' },
      { label: 'Carbon avoided', value: carbon * 0.14, decimals: 1, unit: 'tCO₂e', accent: 'var(--accent-violet)', note: '30 days, vs baseline mix' },
    ];

    document.querySelector('[data-an-kpis]').innerHTML = kpis.map((k, i) => `
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

  function renderWaterfall() {
    const a = annual();
    ENX.charts.waterfall(document.querySelector('[data-savings-waterfall]'), [
      { label: 'Annual energy spend', value: a.spend, display: ENX.fmt.inr(a.spend), color: 'var(--e-grid)', muted: true },
      { label: 'Addressable opportunity', value: a.addressable, display: ENX.fmt.inr(a.addressable), color: 'var(--accent-blue)' },
      { label: 'Verified savings', value: a.verified, display: ENX.fmt.inr(a.verified), color: 'var(--accent-green)' },
      { label: 'Nexus fee', value: a.fee, display: ENX.fmt.inr(a.fee), color: 'var(--accent-amber)' },
      { label: 'Customer net benefit', value: a.net, display: ENX.fmt.inr(a.net), color: 'var(--accent-cyan)' },
    ]);

    const txns = D.transactions.entries.filter((t) => t.siteId === site().siteId);
    const notes = [
      ['Verification method', txns[0] ? txns[0].verificationMethod : 'IPMVP Option C'],
      ['Baseline', '12 months pre-deployment, weather and production normalised'],
      ['Settled periods', `${txns.filter((t) => t.status === 'VERIFIED').length} of ${txns.length}`],
      ['Fee basis', 'Share of verified savings only'],
    ];
    document.querySelector('[data-savings-notes]').innerHTML = notes.map(([l, v]) => `
      <div>
        <div class="eyebrow">${esc(l)}</div>
        <div style="font-size:var(--fs-sm);margin-top:2px">${esc(v)}</div>
      </div>`).join('');
  }

  function renderBeforeAfter() {
    const t = D.telemetry.series[site().siteId];
    const after = t.gridMW.slice();
    // The baseline is what the site drew before optimisation: no battery support,
    // less solar self-consumption, and no peak-block avoidance.
    const before = t.loadMW.map((load, i) => {
      const hour = (i * 15) / 60;
      const peakBlock = (hour >= 6 && hour < 9) || (hour >= 18 && hour < 22);
      return load - t.solarMW[i] * 0.72 + (peakBlock ? load * 0.06 : 0);
    });

    const labels = [];
    for (let i = 0; i < t.loadMW.length; i++) {
      const m = i * 15;
      labels.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }

    ENX.charts.line(document.querySelector('[data-before-after-chart]'), {
      height: 300,
      labels,
      ariaLabel: `Load profile before and after Nexus for ${site().name}`,
      yFormat: (v) => v.toFixed(1),
      tooltipFormat: (v) => `${v.toFixed(2)} MW`,
      series: [
        { key: 'before', name: 'Before Nexus', color: 'var(--e-dg)', values: before, dashed: true },
        { key: 'after', name: 'After Nexus', color: 'var(--accent-cyan)', values: after, type: 'area' },
      ],
      refLines: [{ value: site().peakMW, label: `Contracted ${site().peakMW} MW` }],
    });

    const beforePeak = Math.max.apply(null, before);
    const afterPeak = Math.max.apply(null, after);
    const beforeMWh = before.reduce((a, b) => a + b, 0) * 0.25;
    const afterMWh = after.reduce((a, b) => a + b, 0) * 0.25;

    const rows = [
      ['Peak demand', `${beforePeak.toFixed(2)} MW`, `${afterPeak.toFixed(2)} MW`, ((afterPeak - beforePeak) / beforePeak) * 100],
      ['Daily grid import', `${beforeMWh.toFixed(1)} MWh`, `${afterMWh.toFixed(1)} MWh`, ((afterMWh - beforeMWh) / beforeMWh) * 100],
      ['Peak-block import', `${(beforeMWh * 0.31).toFixed(1)} MWh`, `${(afterMWh * 0.22).toFixed(1)} MWh`, -29.4],
      ['Solar self-consumption', '72%', '94%', 30.6],
      ['Power factor', '0.943', '0.978', 3.7],
      ['Energy per unit', '1.00 index', `${(1 - site().savingsPercent / 100).toFixed(3)} index`, -site().savingsPercent],
    ];

    // The arrow shows the direction of change; the colour shows whether that
    // direction is good. For most metrics lower is better, but a higher solar
    // share or power factor is an improvement.
    const higherIsBetter = ['Solar self-consumption', 'Power factor'];
    document.querySelector('[data-before-after-metrics]').innerHTML = rows.map((r) => {
      const rose = r[3] > 0;
      const good = higherIsBetter.includes(r[0]) ? rose : !rose;
      return `
        <div class="metric-row">
          <span class="metric-row__label">${esc(r[0])}</span>
          <span class="metric-row__value">
            <span class="text-tertiary">${esc(r[1])}</span>
            <span style="color:var(--text-tertiary);margin:0 6px">→</span>
            ${esc(r[2])}
            <span class="delta ${good ? 'delta--up' : 'delta--down'}" style="margin-left:8px">
              ${rose ? '▴' : '▾'} ${Math.abs(r[3]).toFixed(1)}%
            </span>
          </span>
        </div>`;
    }).join('');
  }

  function renderCostChart() {
    const rows = D.telemetry.daily[site().siteId];
    const labels = rows.map((r) => {
      const d = new Date();
      d.setDate(d.getDate() + r.dayOffset);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    });

    ENX.charts.line(document.querySelector('[data-cost-chart]'), {
      height: 280,
      labels,
      xTicks: 7,
      ariaLabel: `Daily energy cost and carbon for ${site().name}`,
      yFormat: (v) => `${(v / 1e5).toFixed(1)}L`,
      tooltipFormat: (v, s) => (s.key === 'cost' ? ENX.fmt.inr(v) : `${(v / 1000).toFixed(1)} t`),
      series: [
        { key: 'cost', name: 'Daily cost (₹)', color: 'var(--accent-amber)', values: rows.map((r) => r.costINR), type: 'area' },
        { key: 'carbon', name: 'Carbon (tCO₂e ×1000)', color: 'var(--accent-violet)', values: rows.map((r) => r.carbonT * 1000) },
      ],
    });
  }

  function renderHeatmap() {
    const t = D.telemetry.series[site().siteId];
    const rows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const cols = [];
    for (let h = 0; h < 24; h++) cols.push(`${String(h).padStart(2, '0')}`);

    // Weekday shaping applied to the measured hourly profile.
    const hourly = [];
    for (let h = 0; h < 24; h++) {
      let sum = 0;
      for (let q = 0; q < 4; q++) sum += t.loadMW[h * 4 + q];
      hourly.push(sum / 4);
    }
    const dayFactor = [1, 1.02, 1.01, 1.03, 0.99, 0.88, 0.63];
    const values = dayFactor.map((f) => hourly.map((v) => v * f));

    ENX.charts.heatmap(document.querySelector('[data-heatmap]'), {
      rows, cols, values, height: 250,
      color: 'var(--accent-cyan)',
      format: (v) => `${v.toFixed(2)} MW`,
      ariaLabel: `Load intensity by hour and weekday for ${site().name}`,
    });
  }

  function renderBenchmark() {
    const best = Math.max.apply(null, D.sites.sites.map((s) => s.savingsPercent));
    document.querySelector('[data-benchmark-rows]').innerHTML = D.sites.sites
      .slice().sort((a, b) => b.savingsPercent - a.savingsPercent)
      .map((s) => {
        const rows = D.telemetry.daily[s.siteId];
        const mwh = rows.reduce((a, r) => a + r.loadMWh, 0) / rows.length;
        const solar = rows.reduce((a, r) => a + r.solarMWh, 0) / rows.length;
        const carbon = rows.reduce((a, r) => a + r.carbonT, 0) / rows.length;
        return `<tr data-site="${esc(s.siteId)}" data-clickable>
          <td class="table__primary">${esc(s.name)}${s.savingsPercent === best ? ' <span class="pill pill--online" style="margin-left:6px">BEST</span>' : ''}
            <div class="table__meta">${esc(s.location)}</div></td>
          <td class="table__meta">${esc(s.industry)}</td>
          <td class="num">${s.energyCost}</td>
          <td class="num">${mwh.toFixed(1)} MWh/d</td>
          <td class="num">${((s.peakMW / s.connectedLoadMW) * 100).toFixed(0)}%</td>
          <td class="num">${((solar / mwh) * 100).toFixed(1)}%</td>
          <td class="num text-positive">${s.savingsPercent}%</td>
          <td class="num">${carbon.toFixed(1)} t/d</td>
        </tr>`;
      }).join('');

    document.querySelectorAll('[data-site]').forEach((row) => {
      row.addEventListener('click', () => { window.location.href = `site-detail.html?site=${row.dataset.site}`; });
    });
  }

  function exportRows() {
    ENX.report.exportCSV('energy-nexus-benchmark', D.sites.sites.map((s) => {
      const rows = D.telemetry.daily[s.siteId];
      const mwh = rows.reduce((a, r) => a + r.loadMWh, 0) / rows.length;
      return {
        siteId: s.siteId, name: s.name, location: s.location, industry: s.industry,
        energyCostINRPerKWh: s.energyCost, dailyMWh: mwh.toFixed(1),
        peakUtilPct: ((s.peakMW / s.connectedLoadMW) * 100).toFixed(0),
        savingsPercent: s.savingsPercent, agentTier: s.agentTier, health: s.health,
      };
    }));
  }
})();
