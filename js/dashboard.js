/**
 * Energy Nexus — Command Center.
 *
 * Estate KPIs, live site topology, the energy profile chart, the agent panel
 * and the alert centre. Everything re-renders on demo ticks and site changes.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};               // loaded datasets
  let range = '24H';
  let topo = null;
  let alertFilter = 'ALL';

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['sites', 'assets', 'telemetry', 'alerts', 'agents', 'forecasts', 'flexibility'])
      .then((data) => {
        D = data;
        renderKPIs();
        renderTopology();
        renderProfile();
        renderAgent();
        renderAutonomy();
        renderQuestions();
        renderAlerts();
        wire();
      })
      .catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  document.addEventListener('enx:tick', () => {
    if (!D.telemetry) return;
    renderTopology();
    renderRibbon();
    if (range === '1H' || range === '6H' || range === '24H') renderProfile();
  });

  document.addEventListener('enx:sitechange', () => {
    if (!D.telemetry) return;
    renderTopology();
    renderProfile();
    renderAgent();
    renderAutonomy();
  });

  function site() { return ENX.data.siteById(D.sites, ENX.state.get('siteId')); }
  function idx() { return ENX.demo.index(D.telemetry.intervalMinutes); }

  /* ---------------------------------------------------------------- KPIs */
  function renderKPIs() {
    const est = D.sites.estate;
    const s = D.telemetry.series;

    // Sparkline context comes from the aggregate estate profile.
    const estateLoad = [];
    for (let i = 0; i < D.telemetry.steps; i++) {
      estateLoad.push(D.sites.sites.reduce((a, x) => a + s[x.siteId].loadMW[i], 0));
    }
    const estateSolar = [];
    for (let i = 0; i < D.telemetry.steps; i++) {
      estateSolar.push(D.sites.sites.reduce((a, x) => a + s[x.siteId].solarMW[i], 0));
    }

    const kpis = [
      { label: 'Energy under management', value: est.euMW / 1000, unit: 'GW', decimals: 2, accent: 'var(--accent-cyan)', note: `${est.totalSites} sites connected`, spark: estateLoad },
      { label: 'Live sites', value: est.totalSites, unit: '', decimals: 0, accent: 'var(--accent-blue)', note: '10 industrial clusters', spark: estateLoad.map((v, i) => v * (0.9 + i / 400)) },
      { label: 'Energy managed', value: est.managedTWh, unit: 'TWh', decimals: 1, accent: 'var(--e-load)', note: 'Trailing twelve months', spark: estateLoad },
      { label: 'Verified savings', value: est.verifiedSavingsCr, prefix: '₹', unit: 'Cr', decimals: 0, accent: 'var(--accent-green)', note: 'M&V settled, customer benefit', spark: estateLoad.map((v) => v * 0.9) },
      { label: 'Flexibility', value: est.flexibilityMW, unit: 'MW', decimals: 0, accent: 'var(--accent-amber)', note: '42 MW available now', spark: estateSolar },
      { label: 'Renewable capacity', value: est.renewableMW, unit: 'MW', decimals: 0, accent: 'var(--e-solar)', note: 'Solar under management', spark: estateSolar },
    ];

    const strip = document.querySelector('[data-kpi-strip]');
    strip.innerHTML = kpis.map((k, i) => `
      <div class="kpi" style="--kpi-accent:${k.accent}">
        <div class="kpi__label">${esc(k.label)}</div>
        <div class="kpi__value">
          ${k.prefix ? `<span class="kpi__unit" style="margin-right:0">${esc(k.prefix)}</span>` : ''}
          <span data-count="${i}">0</span>${k.unit ? `<span class="kpi__unit">${esc(k.unit)}</span>` : ''}
        </div>
        <div class="kpi__spark" data-spark="${i}"></div>
        <div class="kpi__foot"><span class="kpi__note">${esc(k.note)}</span></div>
      </div>`).join('');

    kpis.forEach((k, i) => {
      const el = strip.querySelector(`[data-count="${i}"]`);
      ENX.ui.countUp(el, k.value, {
        decimals: k.decimals,
        format: (v) => new Intl.NumberFormat('en-IN', {
          minimumFractionDigits: k.decimals, maximumFractionDigits: k.decimals,
        }).format(v),
      });
      ENX.charts.sparkline(strip.querySelector(`[data-spark="${i}"]`), k.spark, { color: k.accent, height: 26 });
    });
  }

  /* ------------------------------------------------------------ topology */
  function renderTopology() {
    const container = document.querySelector('[data-topology]');
    const m = ENX.twin.model(site(), D.assets, D.telemetry, idx());

    document.querySelector('[data-flow-site]').textContent =
      `${site().name} · ${site().location} · live single-line`;

    if (topo) topo.redraw(m);
    else topo = ENX.twin.render(container, m, { compact: false });

    renderRibbon(m);
  }

  function renderRibbon(m) {
    const el = document.querySelector('[data-ribbon]');
    if (!el) return;
    const s = D.telemetry.series[site().siteId];
    const i = idx();
    const t = m ? m.totals : { load: s.loadMW[i], solar: s.solarMW[i], grid: s.gridMW[i], soc: s.socPct[i] };

    const items = [
      ['Demand', `${t.load.toFixed(2)} MW`],
      ['Grid import', `${t.grid.toFixed(2)} MW`],
      ['Solar', `${t.solar.toFixed(2)} MW`],
      ['BESS SoC', `${s.socPct[i].toFixed(0)}%`],
      ['Voltage', `${s.voltage[i].toFixed(2)} kV`],
      ['Frequency', `${s.freq[i].toFixed(2)} Hz`],
      ['Power factor', s.pf[i].toFixed(3)],
      ['Tariff', `₹${s.tariff[i].toFixed(2)}/kWh`],
      ['Carbon', `${s.carbon[i]} g/kWh`],
      ['Run rate', ENX.fmt.inr(t.grid * 1000 * s.tariff[i])],
    ];

    el.innerHTML = items.map(([label, value]) => `
      <div class="telemetry-ribbon__item">
        <span class="telemetry-ribbon__label">${esc(label)}</span>
        <span class="telemetry-ribbon__value">${esc(value)}</span>
      </div>`).join('');
  }

  /* ------------------------------------------------------------- profile */
  function renderProfile() {
    const host = document.querySelector('[data-profile-chart]');
    const s = D.telemetry.series[site().siteId];
    const interval = D.telemetry.intervalMinutes;
    const i = idx();

    if (range === '7D' || range === '30D') { renderDailyProfile(host); return; }

    const hours = range === '1H' ? 1 : range === '6H' ? 6 : 24;
    const w = (arr) => ENX.data.window(arr, i, hours, interval);
    const load = w(s.loadMW);
    const labels = ENX.data.windowLabels(i, hours, interval, load.length);

    // Tariff blocks shade the plot so cost context is never a separate lookup.
    const tariffs = w(s.tariff);
    const periods = [];
    let start = 0;
    for (let k = 1; k <= tariffs.length; k++) {
      if (k === tariffs.length || tariffs[k] !== tariffs[start]) {
        const rate = tariffs[start];
        periods.push({ from: start, to: k - 1, kind: rate >= 9.5 ? 'peak' : rate <= 5.5 ? 'offpeak' : 'normal' });
        start = k;
      }
    }

    ENX.charts.line(host, {
      height: 320,
      labels,
      periods,
      ariaLabel: `Energy profile for ${site().name} over the last ${hours} hours`,
      yFormat: (v) => `${v.toFixed(1)}`,
      series: [
        { key: 'load', name: 'Site load', color: 'var(--e-load)', values: load, type: 'area' },
        { key: 'grid', name: 'Grid import', color: 'var(--e-grid)', values: w(s.gridMW) },
        { key: 'solar', name: 'Solar', color: 'var(--e-solar)', values: w(s.solarMW), type: 'area' },
        { key: 'bess', name: 'BESS (+ discharge)', color: 'var(--e-bess)', values: w(s.bessMW) },
      ],
      refLines: [{ value: site().peakMW, label: `Contracted ${site().peakMW} MW` }],
      zeroBase: false,
      tooltipFormat: (v) => `${v.toFixed(2)} MW`,
      tooltipExtra: (k) => `
        <div class="chart-tooltip__row" style="border-top:1px solid var(--border-subtle);margin-top:6px;padding-top:6px">
          <span class="chart-tooltip__name">Tariff</span>
          <span class="chart-tooltip__value">₹${tariffs[k].toFixed(2)}</span>
        </div>`,
    });
  }

  function renderDailyProfile(host) {
    const rows = D.telemetry.daily[site().siteId];
    const days = range === '7D' ? rows.slice(-7) : rows;
    const labels = days.map((d) => {
      const date = new Date();
      date.setDate(date.getDate() + d.dayOffset);
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    });

    ENX.charts.bars(host, {
      height: 320,
      labels,
      stacked: true,
      ariaLabel: `Daily energy for ${site().name} over ${days.length} days`,
      yFormat: (v) => `${v.toFixed(0)}`,
      series: [
        { key: 'grid', name: 'Grid (MWh)', color: 'var(--e-grid)', values: days.map((d) => d.gridMWh) },
        { key: 'solar', name: 'Solar (MWh)', color: 'var(--e-solar)', values: days.map((d) => d.solarMWh) },
      ],
    });
  }

  /* --------------------------------------------------------------- agent */
  function renderAgent() {
    const panel = document.querySelector('[data-agent-panel]');
    const s = D.telemetry.series[site().siteId];
    const i = idx();

    // Surface the highest-value decision that still needs a human, else the top executed one.
    const pool = D.agents.decisions.filter((d) => d.siteId === site().siteId);
    const decision = pool.find((d) => d.status === 'PENDING APPROVAL')
      || pool.sort((a, b) => b.expectedValueINR - a.expectedValueINR)[0]
      || D.agents.decisions[0];

    const peakRisk = Math.min(97, Math.round((s.loadMW[i] / site().peakMW) * 100));

    panel.innerHTML = `
      <div class="agent-panel__header">
        <div class="agent-orb" aria-hidden="true"></div>
        <div style="min-width:0;flex:1">
          <div class="row" style="gap:var(--sp-2)">
            <strong style="font-size:var(--fs-sm)">NEXUS AGENT</strong>
            <span class="pill pill--active pill--pulse"><span class="pill__dot"></span>ACTIVE</span>
          </div>
          <div class="card__desc">AI-native energy decision engine · ${esc(site().name)}</div>
        </div>
        ${ENX.ui.tierBadge(site().agentTier)}
      </div>

      <div class="agent-insight">
        <strong>${esc(decision.title)}.</strong>
        <span style="display:block;font-size:var(--fs-sm);color:var(--text-secondary);margin-top:var(--sp-2);line-height:var(--lh-snug)">
          ${esc(decision.why)}
        </span>
      </div>

      <div class="agent-metrics">
        <div class="agent-metric">
          <div class="agent-metric__label">Expected value</div>
          <div class="agent-metric__value text-positive">${ENX.fmt.inr(decision.expectedValueINR)}</div>
        </div>
        <div class="agent-metric">
          <div class="agent-metric__label">Confidence</div>
          <div class="agent-metric__value">${decision.confidencePct}%</div>
        </div>
        <div class="agent-metric">
          <div class="agent-metric__label">Peak risk</div>
          <div class="agent-metric__value ${peakRisk > 85 ? 'text-critical' : peakRisk > 70 ? 'text-warning' : ''}">${peakRisk}%</div>
        </div>
        <div class="agent-metric">
          <div class="agent-metric__label">Battery SoC</div>
          <div class="agent-metric__value">${s.socPct[i].toFixed(0)}%</div>
        </div>
      </div>

      <div class="agent-actions">
        <button class="btn btn--positive" data-agent="approve">Approve</button>
        <button class="btn btn--danger" data-agent="reject">Reject</button>
        <button class="btn" data-agent="simulate">Simulate</button>
        <button class="btn" data-agent="explain">Explain</button>
      </div>`;

    panel.querySelectorAll('[data-agent]').forEach((btn) => {
      btn.addEventListener('click', () => agentAction(btn.dataset.agent, decision));
    });
  }

  function agentAction(action, d) {
    if (action === 'approve') {
      if (d.tier === 1) {
        ENX.ui.toast(`Approved — ${d.title}. Two-key write recorded in the audit trail.`, 'positive');
      } else {
        ENX.ui.toast(`Executed within signed envelope — ${d.title}`, 'positive');
      }
      return;
    }
    if (action === 'reject') {
      ENX.ui.toast(`Rejected — ${d.title}. Agent holds the current plan.`, 'warning');
      return;
    }
    if (action === 'simulate') { window.location.href = 'optimisation.html'; return; }
    explain(d);
  }

  function explain(d) {
    ENX.ui.modal({
      eyebrow: `${d.decisionId} · Tier ${d.tier}`,
      title: d.title,
      desc: `${d.siteName} · confidence ${d.confidencePct}%`,
      body: `
        <div class="explain-grid">
          <div class="explain-item">
            <div class="explain-item__q">Why?</div>
            <div class="explain-item__a">${esc(d.why)}</div>
          </div>
          <div class="explain-item">
            <div class="explain-item__q">What will happen?</div>
            <div class="explain-item__a">${esc(d.whatHappens)}</div>
          </div>
          <div class="explain-item">
            <div class="explain-item__q">What will it save?</div>
            <div class="explain-item__a">
              <strong class="text-positive">${ENX.fmt.inr(d.expectedValueINR)}</strong>
              ${d.expectedValueINR ? ' expected value from this action.' : ' — declining to act is the correct outcome.'}
            </div>
          </div>
          <div class="explain-item">
            <div class="explain-item__q">What constraints were considered?</div>
            <ul class="constraint-list" style="margin-top:var(--sp-2)">
              ${d.constraints.map((c) => `<li>${ENX.router.iconHTML('check')}<span>${esc(c)}</span></li>`).join('')}
            </ul>
          </div>
          <div class="explain-item explain-item--counterfactual">
            <div class="explain-item__q">What if we do nothing?</div>
            <div class="explain-item__a">${esc(d.counterfactual)}</div>
          </div>
        </div>`,
      footer: `<a class="btn" href="safety.html">View audit trail</a>
               <button class="btn btn--primary" data-modal-close>Close</button>`,
    });
  }

  /* ----------------------------------------------------------- autonomy */
  function renderAutonomy() {
    const el = document.querySelector('[data-autonomy-summary]');
    const tier = site().agentTier;
    const names = { 1: 'Human in the loop', 2: 'Semi-autonomous', 3: 'Fully autonomous' };
    const controllable = D.assets.assets.filter((a) => a.siteId === site().siteId && a.controllable);

    el.innerHTML = `
      <div class="row row--between" style="margin-bottom:var(--sp-3)">
        <div>
          <div class="eyebrow">Current tier</div>
          <div style="font-size:var(--fs-md);font-weight:600;margin-top:2px">${esc(names[tier])}</div>
        </div>
        ${ENX.ui.tierBadge(tier)}
      </div>
      <div class="metric-row">
        <span class="metric-row__label">Assets under control</span>
        <span class="metric-row__value">${controllable.length}</span>
      </div>
      <div class="metric-row">
        <span class="metric-row__label">Approval</span>
        <span class="metric-row__value">${tier === 1 ? 'Per action' : tier === 2 ? 'Signed envelope' : 'Standing'}</span>
      </div>
      <div class="metric-row">
        <span class="metric-row__label">Fallback</span>
        <span class="metric-row__value text-positive">Armed</span>
      </div>
      <div class="metric-row">
        <span class="metric-row__label">Last action</span>
        <span class="metric-row__value">${ENX.fmt.ago(D.agents.decisions[0].minuteOfDay)}</span>
      </div>`;
  }

  /* ---------------------------------------------------------- questions */
  function renderQuestions() {
    const s = D.telemetry.series[site().siteId];
    const i = idx();
    const items = [
      ['01', 'What is happening?', `${s.loadMW[i].toFixed(2)} MW demand, ${s.solarMW[i].toFixed(2)} MW solar`, 'digital-twin.html'],
      ['02', 'Why is it happening?', 'Evening shift ramp coinciding with the peak tariff block', 'agent.html'],
      ['03', 'What should happen next?', 'Discharge BESS 1.8 MW, hold MD below the ceiling', 'optimisation.html'],
      ['04', 'What is the value?', `${ENX.fmt.inr(D.sites.estate.verifiedSavingsCr * 1e7)} verified to date`, 'analytics.html'],
      ['05', 'Is it safe?', 'All envelopes signed, kill switch armed, edge enforcing', 'safety.html'],
    ];
    document.querySelector('[data-questions]').innerHTML = items.map(([n, q, a, href]) => `
      <a class="question" href="${href}">
        <div class="question__num">${n}</div>
        <div class="question__q">${esc(q)}</div>
        <div class="question__a">${esc(a)}</div>
      </a>`).join('');
  }

  /* ------------------------------------------------------------- alerts */
  function renderAlerts() {
    const counts = { ALL: D.alerts.alerts.length };
    D.alerts.alerts.forEach((a) => { counts[a.severity] = (counts[a.severity] || 0) + 1; });

    const filters = ['ALL', 'CRITICAL', 'WARNING', 'OPTIMISATION', 'AI INSIGHT'];
    document.querySelector('[data-alert-filters]').innerHTML = filters.map((f) => `
      <button class="chip" data-alert-filter="${esc(f)}" aria-pressed="${f === alertFilter}">
        ${esc(f)}<span class="chip__count">${counts[f] || 0}</span>
      </button>`).join('');

    paintAlertList();

    document.querySelectorAll('[data-alert-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        alertFilter = btn.dataset.alertFilter;
        document.querySelectorAll('[data-alert-filter]').forEach((b) => {
          b.setAttribute('aria-pressed', String(b.dataset.alertFilter === alertFilter));
        });
        paintAlertList();
      });
    });
  }

  function paintAlertList() {
    const rank = { CRITICAL: 0, WARNING: 1, OPTIMISATION: 2, 'AI INSIGHT': 3 };
    const list = D.alerts.alerts
      .filter((a) => alertFilter === 'ALL' || a.severity === alertFilter)
      .sort((a, b) => (rank[a.severity] - rank[b.severity]) || (b.financialImpactINR - a.financialImpactINR));

    const host = document.querySelector('[data-alert-list]');
    if (!list.length) {
      host.innerHTML = `<div class="empty-state"><h3>Nothing in this category</h3>
        <p>No ${esc(alertFilter.toLowerCase())} alerts are currently open across the estate.</p></div>`;
      return;
    }

    host.innerHTML = list.map((a) => {
      const kind = ENX.fmt.slug(a.severity === 'AI INSIGHT' ? 'insight' : a.severity);
      return `
        <button class="alert-row alert-row--${kind}" data-alert="${esc(a.alertId)}">
          <div class="alert-row__spine"></div>
          <div style="min-width:0">
            <div class="row row--between" style="align-items:flex-start;gap:var(--sp-3)">
              <div class="alert-row__title">${esc(a.title)}</div>
              <div class="row" style="gap:var(--sp-2);flex-shrink:0">
                ${a.financialImpactINR ? `<span class="num text-positive" style="font-size:var(--fs-xs)">${ENX.fmt.inr(a.financialImpactINR)}</span>` : ''}
                <span class="pill pill--${kind}">${esc(a.severity)}</span>
              </div>
            </div>
            <div class="alert-row__detail">${esc(a.detail)}</div>
            <div class="alert-row__meta">
              <span>${esc(a.siteName)}</span><span>·</span>
              <span>${esc(a.assetName)}</span><span>·</span>
              <span>${ENX.fmt.clock(a.minuteOfDay)}</span><span>·</span>
              <span>${ENX.fmt.ago(a.minuteOfDay)}</span>
              ${a.acknowledged ? '<span>·</span><span class="text-positive">Acknowledged</span>' : ''}
            </div>
          </div>
        </button>`;
    }).join('');

    host.querySelectorAll('[data-alert]').forEach((btn) => {
      btn.addEventListener('click', () => openAlert(D.alerts.alerts.find((a) => a.alertId === btn.dataset.alert)));
    });
  }

  function openAlert(a) {
    if (!a) return;
    const kind = ENX.fmt.slug(a.severity === 'AI INSIGHT' ? 'insight' : a.severity);
    ENX.ui.modal({
      eyebrow: `${a.alertId} · ${a.severity}`,
      title: a.title,
      desc: `${a.siteName} · ${a.assetName} · ${ENX.fmt.clock(a.minuteOfDay)}`,
      body: `
        <div class="stack">
          <div class="row" style="gap:var(--sp-2)">
            <span class="pill pill--${kind}">${esc(a.severity)}</span>
            ${a.acknowledged ? '<span class="pill pill--online">ACKNOWLEDGED</span>' : '<span class="pill pill--warning">UNACKNOWLEDGED</span>'}
          </div>
          <div class="explain-item">
            <div class="explain-item__q">What was detected</div>
            <div class="explain-item__a">${esc(a.detail)}</div>
          </div>
          <div class="explain-item">
            <div class="explain-item__q">Recommendation</div>
            <div class="explain-item__a">${esc(a.recommendation)}</div>
          </div>
          ${a.financialImpactINR ? `
            <div class="explain-item">
              <div class="explain-item__q">Financial impact</div>
              <div class="explain-item__a"><strong class="text-positive">${ENX.fmt.inr(a.financialImpactINR)}</strong> exposure or opportunity.</div>
            </div>` : ''}
        </div>`,
      footer: `
        <button class="btn" data-modal-close>Dismiss</button>
        <button class="btn btn--primary" data-ack>${esc(a.action)}</button>`,
      onMount: (body, backdrop) => {
        backdrop.querySelector('[data-ack]').addEventListener('click', () => {
          a.acknowledged = true;
          ENX.ui.closeModal();
          ENX.ui.toast(`${a.alertId} acknowledged and assigned`, 'positive');
          paintAlertList();
        });
      },
    });
  }

  /* --------------------------------------------------------------- wire */
  function wire() {
    document.querySelectorAll('[data-range-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        range = btn.dataset.rangeBtn;
        document.querySelectorAll('[data-range-btn]').forEach((b) => {
          b.setAttribute('aria-pressed', String(b.dataset.rangeBtn === range));
        });
        renderProfile();
      });
    });
  }
})();
