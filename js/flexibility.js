/**
 * Energy Nexus — flexibility command.
 * Aggregates idle capability into a virtual resource and simulates dispatch.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};

  const SOURCE_COLOR = {
    BESS: 'var(--e-bess)', HVAC: 'var(--e-hvac)', Chiller: 'var(--accent-cyan)',
    Compressor: 'var(--e-load)', 'EV charging': 'var(--e-ev)',
    'Thermal storage': 'var(--e-thermal)', Production: 'var(--e-grid)',
  };

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['flexibility', 'sites']).then((data) => {
      D = data;
      renderHero(); renderReadiness(); renderRows(); renderDonut(); renderEvents();
      document.querySelector('[data-dispatch]').addEventListener('click', simulateDispatch);
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  function renderHero() {
    const f = D.flexibility;
    ENX.ui.countUp(document.querySelector('[data-flex-total]'), f.totalMW, {
      decimals: 0, format: (v) => v.toFixed(0),
    });

    const segs = [
      ['Available', f.availableMW, 'var(--accent-green)'],
      ['Committed', f.committedMW, 'var(--accent-blue)'],
      ['Reserved', f.reservedMW, 'var(--accent-amber)'],
    ];
    document.querySelector('[data-flex-bar]').innerHTML = segs.map(([name, mw, c]) =>
      `<div class="stack-bar__seg" style="width:${(mw / f.totalMW) * 100}%;background:${c}"
        title="${esc(name)}: ${mw} MW"></div>`).join('');

    document.querySelector('[data-flex-legend]').innerHTML = segs.map(([name, mw, c]) => `
      <div>
        <div class="row" style="gap:6px">
          <span style="width:9px;height:9px;border-radius:2px;background:${c}"></span>
          <span class="eyebrow" style="color:var(--text-secondary)">${esc(name)}</span>
        </div>
        <div class="num" style="font-size:var(--fs-lg);font-weight:550;margin-top:2px">${mw} MW</div>
      </div>`).join('');
  }

  function renderReadiness() {
    const f = D.flexibility;
    const firm = f.breakdown.filter((b) => b.certainty === 'FIRM').reduce((a, b) => a + b.mw, 0);
    const fast = f.breakdown.filter((b) => b.responseSeconds <= 120).reduce((a, b) => a + b.mw, 0);

    document.querySelector('[data-flex-readiness]').innerHTML = `
      <div class="metric-row"><span class="metric-row__label">Firm capacity</span>
        <span class="metric-row__value text-positive">${firm.toFixed(1)} MW</span></div>
      <div class="metric-row"><span class="metric-row__label">Responds within 2 min</span>
        <span class="metric-row__value">${fast.toFixed(1)} MW</span></div>
      <div class="metric-row"><span class="metric-row__label">Requires human approval</span>
        <span class="metric-row__value">${f.breakdown.filter((b) => b.tier === 1).reduce((a, b) => a + b.mw, 0).toFixed(1)} MW</span></div>
      <div class="metric-row"><span class="metric-row__label">Events delivered</span>
        <span class="metric-row__value">${f.events.filter((e) => e.status === 'DELIVERED').length} of ${f.events.length}</span></div>
      <div class="metric-row"><span class="metric-row__label">Mean delivery ratio</span>
        <span class="metric-row__value text-positive">${meanDelivery().toFixed(1)}%</span></div>`;
  }

  function meanDelivery() {
    const done = D.flexibility.events.filter((e) => e.status !== 'SCHEDULED');
    if (!done.length) return 0;
    return (done.reduce((a, e) => a + (e.deliveredMW / e.requestedMW), 0) / done.length) * 100;
  }

  function renderRows() {
    document.querySelector('[data-flex-rows]').innerHTML = D.flexibility.breakdown.map((b) => `
      <tr>
        <td class="table__primary">
          <span style="display:inline-block;width:8px;height:8px;border-radius:2px;
                background:${SOURCE_COLOR[b.source] || 'var(--accent-cyan)'};margin-right:8px"></span>
          ${esc(b.source)}
        </td>
        <td class="num">${b.mw} MW</td>
        <td class="num">${b.responseSeconds < 60 ? `${b.responseSeconds} s` : `${Math.round(b.responseSeconds / 60)} min`}</td>
        <td class="num">${b.durationMin} min</td>
        <td>${ENX.ui.pill(b.certainty)}</td>
        <td>${ENX.ui.tierBadge(b.tier)}</td>
      </tr>`).join('');
  }

  function renderDonut() {
    const segs = D.flexibility.breakdown.map((b) => ({
      name: b.source, value: b.mw, label: `${b.mw} MW`,
      color: SOURCE_COLOR[b.source] || 'var(--accent-cyan)',
    }));

    ENX.charts.donut(document.querySelector('[data-flex-donut]'), segs, {
      size: 200, thickness: 26,
      centerValue: `${D.flexibility.totalMW}`, centerLabel: 'MW total',
      ariaLabel: 'Flexibility capacity by source',
    });

    document.querySelector('[data-flex-donut-legend]').innerHTML = segs.map((s) => `
      <div class="row row--between" style="padding:5px 0;border-bottom:1px solid var(--border-subtle)">
        <div class="row" style="gap:7px">
          <span style="width:9px;height:9px;border-radius:2px;background:${s.color}"></span>
          <span style="font-size:var(--fs-sm)">${esc(s.name)}</span>
        </div>
        <span class="num" style="font-size:var(--fs-sm)">${esc(s.label)}</span>
      </div>`).join('');
  }

  function renderEvents() {
    document.querySelector('[data-flex-events]').innerHTML = D.flexibility.events.map((e) => {
      const ratio = (e.deliveredMW / e.requestedMW) * 100;
      const value = e.deliveredMW * 1000 * (e.durationMin / 60) * e.priceINRPerKWh;
      return `<tr>
        <td class="table__primary">${esc(e.eventId)}</td>
        <td>${ENX.fmt.clock(e.minuteOfDay)}–${ENX.fmt.clock(e.minuteOfDay + e.durationMin)}
          <div class="table__meta">${e.durationMin} min</div></td>
        <td class="num">${e.requestedMW.toFixed(2)} MW</td>
        <td class="num">${e.status === 'SCHEDULED' ? '—' : `${e.deliveredMW.toFixed(2)} MW`}</td>
        <td class="num ${ratio >= 95 ? 'text-positive' : ratio >= 85 ? 'text-warning' : 'text-critical'}">
          ${e.status === 'SCHEDULED' ? '—' : `${ratio.toFixed(0)}%`}</td>
        <td class="num">₹${e.priceINRPerKWh.toFixed(2)}</td>
        <td class="num text-positive">${e.status === 'SCHEDULED' ? '—' : ENX.fmt.inr(value)}</td>
        <td>${ENX.ui.pill(e.status)}</td>
      </tr>`;
    }).join('');
  }

  function simulateDispatch() {
    const f = D.flexibility;
    const requested = 3.2;
    // Dispatch the fastest firm sources first; production is excluded (Tier 1).
    const stack = f.breakdown
      .filter((b) => b.tier > 1)
      .sort((a, b) => a.responseSeconds - b.responseSeconds);

    let remaining = requested;
    const used = [];
    stack.forEach((b) => {
      if (remaining <= 0) return;
      const take = Math.min(remaining, b.mw * 0.12); // per-site share of estate capacity
      used.push({ source: b.source, mw: take, response: b.responseSeconds });
      remaining -= take;
    });

    ENX.ui.modal({
      eyebrow: 'Dispatch simulation',
      title: `${requested.toFixed(1)} MW flexibility event`,
      desc: '120-minute window · ₹4.10/kWh · simulated',
      body: `
        <div class="stack">
          <div class="callout callout--info">
            ${ENX.router.iconHTML('flex')}
            <div>The stack fills from the fastest firm sources first. Production is excluded —
            load shifting is Tier 1 and never dispatches automatically.</div>
          </div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Source</th><th class="num">Contribution</th><th class="num">Response</th></tr></thead>
            <tbody>${used.map((u) => `<tr>
              <td class="table__primary">${esc(u.source)}</td>
              <td class="num">${u.mw.toFixed(2)} MW</td>
              <td class="num">${u.response < 60 ? `${u.response} s` : `${Math.round(u.response / 60)} min`}</td>
            </tr>`).join('')}</tbody>
          </table></div>
          <div class="metric-row"><span class="metric-row__label">Total dispatched</span>
            <span class="metric-row__value text-positive">${(requested - Math.max(0, remaining)).toFixed(2)} MW</span></div>
          <div class="metric-row"><span class="metric-row__label">Event value</span>
            <span class="metric-row__value text-positive">${ENX.fmt.inr(requested * 1000 * 2 * 4.1)}</span></div>
          <div class="metric-row"><span class="metric-row__label">Recovery time</span>
            <span class="metric-row__value">25 min</span></div>
        </div>`,
      footer: `<button class="btn" data-modal-close>Close</button>
               <button class="btn btn--primary" data-commit>Commit capacity</button>`,
      onMount: (b, backdrop) => {
        backdrop.querySelector('[data-commit]').addEventListener('click', () => {
          ENX.ui.closeModal();
          ENX.ui.toast('Capacity committed — envelope checked, edge gateway notified', 'positive');
        });
      },
    });
  }
})();
