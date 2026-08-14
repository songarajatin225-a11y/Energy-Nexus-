/**
 * Energy Nexus — Optimisation Studio.
 *
 * Compares the measured baseline against an optimised dispatch plan. The
 * "simulation" animates the transition between the two states rather than
 * cutting to the answer, so the operator sees what moves.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};
  let objective = 'Cost';
  let applied = false;
  let animating = false;

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['sites', 'telemetry', 'optimisation', 'assets']).then((data) => {
      D = data;
      renderAll();
      wire();
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  document.addEventListener('enx:sitechange', () => { if (D.sites) { applied = false; renderAll(); } });

  function site() { return ENX.data.siteById(D.sites, ENX.state.get('siteId')); }
  function idx() { return ENX.demo.index(D.telemetry.intervalMinutes); }

  /**
   * Build the optimised plan from the live baseline.
   * Objective weights change how aggressively the battery and solar are used.
   */
  function plan() {
    const s = site();
    const t = D.telemetry.series[s.siteId];
    const i = idx();

    const weights = {
      Cost:    { grid: 0.78, solar: 1.18, bess: 1.0 },
      Peak:    { grid: 0.70, solar: 1.10, bess: 1.3 },
      Carbon:  { grid: 0.74, solar: 1.24, bess: 1.1 },
      Blended: { grid: 0.76, solar: 1.16, bess: 1.1 },
    }[objective];

    const before = {
      grid: t.gridMW[i],
      solar: t.solarMW[i],
      bess: Math.max(0, t.bessMW[i]),
      dg: t.dgMW[i],
    };

    // Solar cannot exceed installed capacity; the battery cannot exceed its rating
    // or the headroom the grid reduction actually creates.
    const solarAfter = Math.min(s.solarMW, before.solar * weights.solar);
    const gridAfter = Math.max(0, before.grid * weights.grid);
    const shortfall = (before.grid - gridAfter) - (solarAfter - before.solar);
    const bessAfter = Math.max(0, Math.min(s.bess.powerMW, shortfall * weights.bess));

    const after = { grid: gridAfter, solar: solarAfter, bess: bessAfter, dg: 0 };
    const deltaMW = before.grid - after.grid;

    return {
      before, after,
      savingINR: Math.max(0, deltaMW * 1000 * t.tariff[i] * 24 * 0.42),
      peakMW: Math.max(0, deltaMW),
      carbonT: Math.max(0, (deltaMW * 24 * t.carbon[i]) / 1e6),
      tariff: t.tariff[i],
    };
  }

  function renderAll() {
    const s = site();
    document.querySelector('[data-opt-sub]').textContent =
      `${s.name} · ${s.location} · solving the next 24 hours inside the signed constraint register`;
    renderStates(plan());
    renderChart();
    renderConstraints();
    renderActions();
    renderHistory();
  }

  function stateHTML(st, label) {
    const rows = [
      ['Grid', st.grid, 'var(--e-grid)'],
      ['Solar', st.solar, 'var(--e-solar)'],
      ['BESS', st.bess, 'var(--e-bess)'],
      ['DG', st.dg, 'var(--e-dg)'],
    ];
    return rows.map(([name, v, color]) => `
      <div class="metric-row">
        <span class="metric-row__label">
          <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:7px"></span>
          ${esc(name)}
        </span>
        <span class="metric-row__value" data-state-value="${esc(label)}-${esc(name)}">${v.toFixed(2)} MW</span>
      </div>`).join('');
  }

  function renderStates(p) {
    document.querySelector('[data-current-state]').innerHTML = stateHTML(p.before, 'before');
    document.querySelector('[data-nexus-state]').innerHTML = stateHTML(p.after, 'after');
    document.querySelector('[data-saving]').textContent = `${ENX.fmt.inr(p.savingINR)}/day`;
    document.querySelector('[data-peak-red]').textContent = `${p.peakMW.toFixed(2)} MW`;
    document.querySelector('[data-carbon-red]').textContent = `${p.carbonT.toFixed(2)} tCO₂e/day`;
  }

  /** Animate every number from the baseline to the optimised value. */
  function runSimulation() {
    if (animating) return;
    animating = true;
    const p = plan();
    const status = document.querySelector('[data-sim-status]');
    status.className = 'pill pill--warning pill--pulse';
    status.innerHTML = '<span class="pill__dot"></span>Solving';

    const btn = document.querySelector('[data-run-sim]');
    btn.setAttribute('aria-disabled', 'true');

    const names = ['Grid', 'Solar', 'BESS', 'DG'];
    const keys = ['grid', 'solar', 'bess', 'dg'];

    // Start the "after" column at the baseline, then ease each figure across.
    keys.forEach((k, n) => {
      const el = document.querySelector(`[data-state-value="after-${names[n]}"]`);
      if (el) el.textContent = `${p.before[k].toFixed(2)} MW`;
    });

    setTimeout(() => {
      keys.forEach((k, n) => {
        const el = document.querySelector(`[data-state-value="after-${names[n]}"]`);
        if (!el) return;
        ENX.ui.countUp(el, p.after[k], {
          from: p.before[k], duration: 1400, decimals: 2,
          format: (v) => `${v.toFixed(2)} MW`,
        });
      });

      ['[data-saving]', '[data-peak-red]', '[data-carbon-red]'].forEach((sel, n) => {
        const el = document.querySelector(sel);
        const targets = [p.savingINR, p.peakMW, p.carbonT];
        const formats = [
          (v) => `${ENX.fmt.inr(v)}/day`,
          (v) => `${v.toFixed(2)} MW`,
          (v) => `${v.toFixed(2)} tCO₂e/day`,
        ];
        ENX.ui.countUp(el, targets[n], { from: 0, duration: 1400, format: formats[n] });
      });

      renderChart(true);

      setTimeout(() => {
        status.className = 'pill pill--online';
        status.innerHTML = '<span class="pill__dot"></span>Solved';
        btn.removeAttribute('aria-disabled');
        animating = false;
        ENX.ui.toast(`Simulation complete — ${ENX.fmt.inr(p.savingINR)}/day at ${objective.toLowerCase()} objective`, 'positive');
      }, 1500);
    }, 700);
  }

  function renderChart(animate) {
    const s = site();
    const t = D.telemetry.series[s.siteId];
    const i = idx();
    const w = (arr) => ENX.data.window(arr, i, 24, D.telemetry.intervalMinutes);

    const baseline = w(t.gridMW);
    const solar = w(t.solarMW);
    const tariffs = w(t.tariff);

    // The optimised curve shifts import away from peak blocks into off-peak ones.
    const optimised = baseline.map((v, k) => {
      const rate = tariffs[k];
      if (rate >= 9.5) return Math.max(0, v * 0.72);
      if (rate <= 5.5) return v * 1.14;
      return v * 0.94;
    });

    const periods = [];
    let start = 0;
    for (let k = 1; k <= tariffs.length; k++) {
      if (k === tariffs.length || tariffs[k] !== tariffs[start]) {
        const rate = tariffs[start];
        periods.push({ from: start, to: k - 1, kind: rate >= 9.5 ? 'peak' : rate <= 5.5 ? 'offpeak' : 'normal' });
        start = k;
      }
    }

    ENX.charts.line(document.querySelector('[data-opt-chart]'), {
      height: 320,
      labels: ENX.data.windowLabels(i, 24, D.telemetry.intervalMinutes, baseline.length),
      periods,
      ariaLabel: `Baseline against optimised grid import for ${s.name}`,
      yFormat: (v) => v.toFixed(1),
      tooltipFormat: (v) => `${v.toFixed(2)} MW`,
      series: [
        { key: 'baseline', name: 'Baseline grid import', color: 'var(--e-grid)', values: baseline, dashed: true },
        { key: 'optimised', name: 'Optimised plan', color: 'var(--accent-cyan)', values: optimised, type: 'area' },
        { key: 'solar', name: 'Solar', color: 'var(--e-solar)', values: solar },
      ],
      refLines: [{ value: s.peakMW, label: `Contracted ${s.peakMW} MW` }],
    });
  }

  function renderConstraints() {
    const s = site();
    const items = [
      'Production schedule untouched — shifting is Tier 1',
      `Maximum demand held below ${s.peakMW} MW`,
      'Battery SoC floor of 20% reserved for backup duty',
      'Battery throughput within warranty limits',
      'Chilled-water supply held in the 6–8 °C band',
      'Compressed air maintained above 6.2 bar',
      'Setpoint changes rate-limited, no step changes',
      'DG excluded — diesel dispatch is permanently human-approved',
    ];
    document.querySelector('[data-opt-constraints]').innerHTML =
      items.map((c) => `<li>${ENX.router.iconHTML('check')}<span>${esc(c)}</span></li>`).join('');
  }

  function renderActions() {
    const p = plan();
    const s = site();
    const actions = [
      ['Charge BESS from surplus', `${Math.min(s.bess.powerMW, p.after.bess).toFixed(2)} MW`, 2],
      ['Discharge into peak block', `${p.after.bess.toFixed(2)} MW`, 2],
      ['Re-sequence chiller plant', 'Single-chiller', 2],
      ['Defer EV charging', 'To 22:15', 3],
      ['Apply HVAC night setback', '+1.5 °C', 2],
    ];
    document.querySelector('[data-opt-actions]').innerHTML = actions.map((a) => `
      <div class="metric-row">
        <span class="metric-row__label">${esc(a[0])}<br>
          <span style="font-size:10px">${ENX.ui.tierBadge(a[2])}</span></span>
        <span class="metric-row__value">${esc(a[1])}</span>
      </div>`).join('');
  }

  function renderHistory() {
    document.querySelector('[data-opt-history]').innerHTML = D.optimisation.runs
      .slice().sort((a, b) => b.savingINRPerDay - a.savingINRPerDay)
      .map((r) => `
        <tr>
          <td class="table__primary">${esc(r.runId)}<div class="table__meta">${ENX.fmt.clock(r.minuteOfDay)}</div></td>
          <td>${esc(r.siteName)}</td>
          <td><span class="pill">${esc(r.objective)}</span></td>
          <td class="num">${r.before.gridMW.toFixed(2)}</td>
          <td class="num text-active">${r.after.gridMW.toFixed(2)}</td>
          <td class="num text-positive">${ENX.fmt.inr(r.savingINRPerDay)}</td>
          <td class="num">${r.peakReductionMW.toFixed(2)} MW</td>
          <td class="num">${r.carbonReductionTCO2e.toFixed(2)} t</td>
          <td>${ENX.ui.pill(r.status)}</td>
        </tr>`).join('');
  }

  function wire() {
    document.querySelector('[data-run-sim]').addEventListener('click', runSimulation);

    document.querySelector('[data-objective]').addEventListener('change', (e) => {
      objective = e.target.value;
      renderStates(plan());
      renderActions();
      ENX.ui.toast(`Objective set to ${objective.toLowerCase()}`);
    });

    document.querySelector('[data-apply-plan]').addEventListener('click', () => {
      const p = plan();
      ENX.ui.modal({
        eyebrow: 'Confirm plan',
        title: 'Apply the Nexus plan?',
        desc: `${site().name} · ${objective} objective`,
        body: `
          <div class="stack">
            <div class="metric-row"><span class="metric-row__label">Projected saving</span>
              <span class="metric-row__value text-positive">${ENX.fmt.inr(p.savingINR)}/day</span></div>
            <div class="metric-row"><span class="metric-row__label">Peak reduction</span>
              <span class="metric-row__value">${p.peakMW.toFixed(2)} MW</span></div>
            <div class="metric-row"><span class="metric-row__label">Assets moved</span>
              <span class="metric-row__value">BESS, chiller, HVAC, EV</span></div>
            <div class="callout callout--info">
              ${ENX.router.iconHTML('safety')}
              <div>Tier 2 actions execute inside the signed envelope. Anything Tier 1 — production
              shifting and DG — is excluded from this plan and stays with a human.</div>
            </div>
          </div>`,
        footer: `<button class="btn" data-modal-close>Cancel</button>
                 <button class="btn btn--primary" data-confirm>Apply plan</button>`,
        onMount: (b, backdrop) => {
          backdrop.querySelector('[data-confirm]').addEventListener('click', () => {
            applied = true;
            ENX.ui.closeModal();
            ENX.ui.toast('Plan applied — dispatch schedule written to the edge gateway', 'positive');
            const status = document.querySelector('[data-sim-status]');
            status.className = 'pill pill--online';
            status.innerHTML = '<span class="pill__dot"></span>Applied';
          });
        },
      });
    });

    document.querySelector('[data-export-runs]').addEventListener('click', () => {
      ENX.report.exportCSV('energy-nexus-optimisation-runs', D.optimisation.runs.map((r) => ({
        runId: r.runId, site: r.siteName, objective: r.objective,
        gridBeforeMW: r.before.gridMW, gridAfterMW: r.after.gridMW,
        savingINRPerDay: r.savingINRPerDay, peakReductionMW: r.peakReductionMW,
        carbonReductionTCO2e: r.carbonReductionTCO2e, status: r.status,
      })));
    });
  }
})();
