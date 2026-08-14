/**
 * Energy Nexus — Nexus Market (simulated).
 *
 * A working market UI over simulated records. Every row states the regulatory
 * regime it would require, because the distinction between what can be built
 * today and what needs regulatory change is the whole point of this screen.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};
  let regimeFilter = 'ALL';

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['market', 'flexibility', 'sites']).then((data) => {
      D = data;
      renderKPIs(); renderBooks(); renderDepth(); renderFilters(); renderRows();
      document.querySelector('[data-export-market]').addEventListener('click', () => {
        ENX.report.exportCSV('energy-nexus-market-simulated', D.market.records.map((r) => ({
          recordId: r.recordId, side: r.side, product: r.product, mw: r.mw,
          priceINRPerKWh: r.priceINRPerKWh, durationMin: r.durationMin,
          location: r.location, settlement: r.settlement, regime: r.regime, status: r.status,
        })));
      });
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  function renderKPIs() {
    const r = D.market.records;
    const offers = r.filter((x) => x.side === 'OFFER');
    const bids = r.filter((x) => x.side === 'BID');
    const cleared = r.filter((x) => x.status === 'CLEARED' || x.status === 'SETTLED');
    const avgPrice = r.reduce((a, x) => a + x.priceINRPerKWh, 0) / (r.length || 1);
    const clearedMW = cleared.reduce((a, x) => a + x.mw, 0);
    const notional = cleared.reduce((a, x) => a + x.mw * 1000 * (x.durationMin / 60) * x.priceINRPerKWh, 0);

    const kpis = [
      { label: 'Offered capacity', value: offers.reduce((a, x) => a + x.mw, 0), decimals: 1, unit: 'MW', accent: 'var(--accent-green)', note: `${offers.length} offers` },
      { label: 'Bid capacity', value: bids.reduce((a, x) => a + x.mw, 0), decimals: 1, unit: 'MW', accent: 'var(--accent-blue)', note: `${bids.length} bids` },
      { label: 'Cleared volume', value: clearedMW, decimals: 1, unit: 'MW', accent: 'var(--accent-cyan)', note: `${cleared.length} records` },
      { label: 'Mean price', value: avgPrice, decimals: 2, prefix: '₹', unit: '/kWh', accent: 'var(--accent-amber)', note: 'Across all products' },
      { label: 'Notional value', value: notional / 1e5, decimals: 2, prefix: '₹', unit: 'L', accent: 'var(--e-solar)', note: 'Simulated, not settled' },
      { label: 'Regulation dependent', value: r.filter((x) => x.regime === 'REGULATION DEPENDENT').length, decimals: 0, accent: 'var(--accent-violet)', note: 'Records needing policy change' },
    ];

    document.querySelector('[data-market-kpis]').innerHTML = kpis.map((k, i) => `
      <div class="kpi" style="--kpi-accent:${k.accent}">
        <div class="kpi__label">${esc(k.label)}</div>
        <div class="kpi__value">
          ${k.prefix ? `<span class="kpi__unit" style="margin-right:0">${esc(k.prefix)}</span>` : ''}
          <span data-count="${i}">0</span>${k.unit ? `<span class="kpi__unit">${esc(k.unit)}</span>` : ''}
        </div>
        <div class="kpi__foot"><span class="kpi__note">${esc(k.note)}</span></div>
      </div>`).join('');

    kpis.forEach((k, i) => ENX.ui.countUp(document.querySelector(`[data-count="${i}"]`), k.value, {
      decimals: k.decimals, format: (v) => v.toFixed(k.decimals),
    }));

    document.querySelector('[data-supply-total]').textContent =
      `${offers.reduce((a, x) => a + x.mw, 0).toFixed(1)} MW offered`;
  }

  function renderBooks() {
    const supply = [
      ['Solar surplus', 'Behind-the-meter PV beyond site load', 'PILOT'],
      ['BESS discharge', 'Certified battery capacity with 2-second response', 'PILOT'],
      ['Flexible load', 'HVAC, chillers and compressors inside their envelope', 'PILOT'],
      ['Thermal capacity', 'Stored cooling and process heat', 'SIMULATION'],
      ['Open access', 'Contracted renewable supply via open access', 'REGULATION DEPENDENT'],
    ];
    const demand = [
      ['Industrial offtake', 'Plants seeking cheaper or greener supply', 'REGULATION DEPENDENT'],
      ['Flexibility buyers', 'Distribution utilities and aggregators', 'PILOT'],
      ['Storage operators', 'Arbitrage against ToD spreads', 'SIMULATION'],
      ['Energy services', 'ESCOs contracting for verified reduction', 'PILOT'],
    ];

    const rowHTML = (r) => `
      <div class="metric-row">
        <span class="metric-row__label">${esc(r[0])}<br>
          <span class="text-tertiary" style="font-size:10px">${esc(r[1])}</span></span>
        <span class="pill pill--${ENX.fmt.slug(r[2])}">${esc(r[2])}</span>
      </div>`;

    document.querySelector('[data-supply]').innerHTML = supply.map(rowHTML).join('');
    document.querySelector('[data-demand]').innerHTML = demand.map(rowHTML).join('');
  }

  /** Cumulative depth: bids sorted high→low, offers low→high, as on a real book. */
  function renderDepth() {
    const bids = D.market.records.filter((r) => r.side === 'BID')
      .sort((a, b) => b.priceINRPerKWh - a.priceINRPerKWh);
    const offers = D.market.records.filter((r) => r.side === 'OFFER')
      .sort((a, b) => a.priceINRPerKWh - b.priceINRPerKWh);

    const prices = [];
    for (let p = 3.0; p <= 8.0; p += 0.25) prices.push(Number(p.toFixed(2)));

    const bidDepth = prices.map((p) => bids.filter((r) => r.priceINRPerKWh >= p).reduce((a, r) => a + r.mw, 0));
    const offerDepth = prices.map((p) => offers.filter((r) => r.priceINRPerKWh <= p).reduce((a, r) => a + r.mw, 0));

    ENX.charts.line(document.querySelector('[data-depth-chart]'), {
      height: 280,
      labels: prices.map((p) => `₹${p.toFixed(2)}`),
      xTicks: 8,
      ariaLabel: 'Simulated order book depth by price',
      yFormat: (v) => v.toFixed(0),
      tooltipFormat: (v) => `${v.toFixed(2)} MW`,
      series: [
        { key: 'bid', name: 'Cumulative bids', color: 'var(--accent-green)', values: bidDepth, type: 'area' },
        { key: 'offer', name: 'Cumulative offers', color: 'var(--accent-blue)', values: offerDepth, type: 'area' },
      ],
    });
  }

  function renderFilters() {
    const regimes = ['ALL', 'SIMULATION', 'PILOT', 'REGULATION DEPENDENT'];
    document.querySelector('[data-market-filters]').innerHTML = regimes.map((r) => {
      const count = r === 'ALL' ? D.market.records.length
        : D.market.records.filter((x) => x.regime === r).length;
      return `<button class="chip" data-regime="${esc(r)}" aria-pressed="${r === regimeFilter}">
        ${esc(r)}<span class="chip__count">${count}</span></button>`;
    }).join('');

    document.querySelectorAll('[data-regime]').forEach((btn) => {
      btn.addEventListener('click', () => {
        regimeFilter = btn.dataset.regime;
        document.querySelectorAll('[data-regime]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b.dataset.regime === regimeFilter)));
        renderRows();
      });
    });
  }

  function renderRows() {
    const list = D.market.records.filter((r) => regimeFilter === 'ALL' || r.regime === regimeFilter);
    const host = document.querySelector('[data-market-rows]');

    if (!list.length) {
      host.innerHTML = `<tr><td colspan="10"><div class="empty-state">
        <h3>No records in this regime</h3><p>Choose another regulatory regime to see its records.</p>
      </div></td></tr>`;
      return;
    }

    host.innerHTML = list.map((r) => `
      <tr data-record="${esc(r.recordId)}" data-clickable>
        <td class="table__primary">${esc(r.recordId)}<div class="table__meta">${ENX.fmt.clock(r.minuteOfDay)}</div></td>
        <td><span class="pill pill--${r.side === 'OFFER' ? 'online' : 'info'}">${esc(r.side)}</span></td>
        <td>${esc(r.product)}</td>
        <td class="num">${r.mw.toFixed(2)}</td>
        <td class="num">₹${r.priceINRPerKWh.toFixed(2)}</td>
        <td class="num">${r.durationMin} min</td>
        <td class="table__meta">${esc(r.location)}</td>
        <td class="num table__meta">${esc(r.settlement)}</td>
        <td><span class="pill pill--${ENX.fmt.slug(r.regime)}">${esc(r.regime)}</span></td>
        <td>${ENX.ui.pill(r.status)}</td>
      </tr>`).join('');

    host.querySelectorAll('[data-record]').forEach((row) => {
      row.addEventListener('click', () => openRecord(D.market.records.find((r) => r.recordId === row.dataset.record)));
    });
  }

  function openRecord(r) {
    if (!r) return;
    const value = r.mw * 1000 * (r.durationMin / 60) * r.priceINRPerKWh;
    const REGIME_NOTE = {
      SIMULATION: 'Modelled only. No mechanism exists today to clear this product between private parties.',
      PILOT: 'Deliverable under a contracted demand-response or aggregator arrangement in some states.',
      'REGULATION DEPENDENT': 'Requires open-access approval and a licensed intermediary. Cannot be executed by the platform directly.',
    };

    ENX.ui.modal({
      eyebrow: `${r.recordId} · ${r.side}`,
      title: r.product,
      desc: `${r.mw.toFixed(2)} MW at ₹${r.priceINRPerKWh.toFixed(2)}/kWh for ${r.durationMin} minutes`,
      body: `
        <div class="stack">
          <div class="row" style="gap:var(--sp-2)">
            ${ENX.ui.pill(r.status)}
            <span class="pill pill--${ENX.fmt.slug(r.regime)}">${esc(r.regime)}</span>
          </div>
          <div class="metric-row"><span class="metric-row__label">Location</span>
            <span class="metric-row__value">${esc(r.location)}</span></div>
          <div class="metric-row"><span class="metric-row__label">Cluster</span>
            <span class="metric-row__value">${esc(r.cluster)}</span></div>
          <div class="metric-row"><span class="metric-row__label">Notional value</span>
            <span class="metric-row__value">${ENX.fmt.inr(value)}</span></div>
          <div class="metric-row"><span class="metric-row__label">Settlement</span>
            <span class="metric-row__value">${esc(r.settlement)}</span></div>
          <div class="callout callout--warning">
            ${ENX.router.iconHTML('alert')}
            <div><strong>${esc(r.regime)}.</strong> ${esc(REGIME_NOTE[r.regime])}</div>
          </div>
        </div>`,
      footer: `<button class="btn btn--primary" data-modal-close>Close</button>`,
    });
  }
})();
