/**
 * Energy Nexus — reporting.
 * Report catalogue with working CSV export and print, plus the savings ledger.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};

  const REPORTS = [
    ['reports', 'Executive Energy Report', 'One-page summary for the board: spend, savings, peak, carbon and agent activity.', 'PDF · 4 pages'],
    ['analytics', 'Monthly Energy Report', 'Consumption, cost and generation broken down by site and asset class.', 'PDF · 12 pages'],
    ['optimise', 'Savings Verification', 'IPMVP-aligned measurement and verification against the agreed baseline.', 'PDF · 8 pages'],
    ['internet', 'Carbon Report', 'Scope 2 accounting, grid intensity weighting and avoided emissions.', 'PDF · 6 pages'],
    ['assets', 'Asset Performance', 'Utilisation, efficiency, degradation and maintenance signals per asset.', 'PDF · 10 pages'],
    ['flex', 'Flexibility Report', 'Certified capacity, dispatch events, delivery ratio and settlement.', 'PDF · 5 pages'],
    ['network', 'Benchmark Report', 'Site-against-site comparison on normalised energy intensity.', 'PDF · 7 pages'],
  ];

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['transactions', 'sites']).then((data) => {
      D = data;
      renderCards(); renderLedger(); renderCategories();
      document.querySelector('[data-export-ledger]').addEventListener('click', exportLedger);
      document.querySelector('[data-report-period]').addEventListener('change', (ev) => {
        ENX.ui.toast(`Reporting period: ${ev.target.value}`);
      });
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  function renderCards() {
    document.querySelector('[data-report-cards]').innerHTML = REPORTS.map((r, i) => `
      <div class="card">
        <div class="card__body">
          <div class="feature__icon">${ENX.router.iconHTML(r[0])}</div>
          <h3 style="font-size:var(--fs-md);font-weight:600;margin-bottom:var(--sp-2)">${esc(r[1])}</h3>
          <p style="font-size:var(--fs-sm);color:var(--text-secondary);line-height:var(--lh-snug);min-height:56px">${esc(r[2])}</p>
          <div class="row row--between" style="margin-top:var(--sp-4);padding-top:var(--sp-3);
               border-top:1px solid var(--border-subtle)">
            <span class="mono text-tertiary" style="font-size:var(--fs-2xs)">${esc(r[3])}</span>
            <div class="row" style="gap:var(--sp-2)">
              <button class="btn btn--sm" data-report-csv="${i}">CSV</button>
              <button class="btn btn--sm" data-report-print="${i}">Print</button>
              <button class="btn btn--sm btn--primary" data-report-open="${i}">Preview</button>
            </div>
          </div>
        </div>
      </div>`).join('');

    document.querySelectorAll('[data-report-open]').forEach((btn) => {
      btn.addEventListener('click', () => preview(REPORTS[btn.dataset.reportOpen]));
    });
    document.querySelectorAll('[data-report-csv]').forEach((btn) => {
      btn.addEventListener('click', () => exportLedger());
    });
    document.querySelectorAll('[data-report-print]').forEach((btn) => {
      btn.addEventListener('click', () => ENX.report.print());
    });
  }

  function preview(r) {
    const verified = D.transactions.entries.filter((t) => t.status === 'VERIFIED');
    const total = verified.reduce((a, t) => a + t.verifiedSavingINR, 0);
    const fee = verified.reduce((a, t) => a + t.nexusFeeINR, 0);

    ENX.ui.modal({
      eyebrow: 'Report preview',
      title: r[1],
      desc: `${r[3]} · generated from the live energy model`,
      body: `
        <div class="stack">
          <div class="callout callout--info">
            ${ENX.router.iconHTML('reports')}
            <div>This preview summarises what the full report contains. In the prototype, export
            produces CSV rather than a rendered PDF.</div>
          </div>
          <div class="metric-row"><span class="metric-row__label">Sites covered</span>
            <span class="metric-row__value">${D.sites.sites.length}</span></div>
          <div class="metric-row"><span class="metric-row__label">Verified savings</span>
            <span class="metric-row__value text-positive">${ENX.fmt.inr(total)}</span></div>
          <div class="metric-row"><span class="metric-row__label">Nexus fee</span>
            <span class="metric-row__value">${ENX.fmt.inr(fee)}</span></div>
          <div class="metric-row"><span class="metric-row__label">Customer net benefit</span>
            <span class="metric-row__value text-positive">${ENX.fmt.inr(total - fee)}</span></div>
          <div class="metric-row"><span class="metric-row__label">Settled periods</span>
            <span class="metric-row__value">${verified.length} of ${D.transactions.entries.length}</span></div>
          <p style="font-size:var(--fs-sm);color:var(--text-secondary);line-height:var(--lh-snug)">${esc(r[2])}</p>
        </div>`,
      footer: `<button class="btn" data-print>Print</button>
               <button class="btn btn--primary" data-csv>Export CSV</button>`,
      onMount: (b, backdrop) => {
        backdrop.querySelector('[data-print]').addEventListener('click', () => { ENX.ui.closeModal(); ENX.report.print(); });
        backdrop.querySelector('[data-csv]').addEventListener('click', () => { ENX.ui.closeModal(); exportLedger(); });
      },
    });
  }

  function renderLedger() {
    document.querySelector('[data-ledger-rows]').innerHTML = D.transactions.entries
      .slice().sort((a, b) => b.verifiedSavingINR - a.verifiedSavingINR)
      .map((t) => `
        <tr>
          <td class="table__primary">${esc(t.txnId)}</td>
          <td>${esc(t.siteName)}</td>
          <td class="mono" style="font-size:var(--fs-xs)">${esc(t.period)}</td>
          <td><span class="pill">${esc(t.category)}</span></td>
          <td class="table__meta">${esc(t.verificationMethod)}</td>
          <td class="num">${ENX.fmt.inr(t.grossSavingINR)}</td>
          <td class="num text-positive">${ENX.fmt.inr(t.verifiedSavingINR)}</td>
          <td class="num">${ENX.fmt.inr(t.nexusFeeINR)}</td>
          <td class="num text-positive">${ENX.fmt.inr(t.verifiedSavingINR - t.nexusFeeINR)}</td>
          <td>${ENX.ui.pill(t.status)}</td>
        </tr>`).join('');
  }

  function renderCategories() {
    const byCat = {};
    D.transactions.entries.forEach((t) => {
      byCat[t.category] = (byCat[t.category] || 0) + t.verifiedSavingINR;
    });

    const COLORS = ['var(--accent-green)', 'var(--e-solar)', 'var(--accent-blue)',
      'var(--accent-cyan)', 'var(--accent-violet)', 'var(--accent-amber)'];
    const segs = Object.keys(byCat).map((k, i) => ({
      name: k, value: byCat[k], label: ENX.fmt.inr(byCat[k]), color: COLORS[i % COLORS.length],
    })).sort((a, b) => b.value - a.value);

    const total = segs.reduce((a, s) => a + s.value, 0);

    ENX.charts.donut(document.querySelector('[data-category-donut]'), segs, {
      size: 210, thickness: 28,
      centerValue: ENX.fmt.inr(total).replace('₹', ''), centerLabel: 'verified',
      ariaLabel: 'Verified savings by category',
    });

    document.querySelector('[data-category-legend]').innerHTML = segs.map((s) => `
      <div class="row row--between" style="padding:6px 0;border-bottom:1px solid var(--border-subtle)">
        <div class="row" style="gap:8px">
          <span style="width:10px;height:10px;border-radius:2px;background:${s.color}"></span>
          <span style="font-size:var(--fs-sm)">${esc(s.name)}</span>
        </div>
        <div class="row" style="gap:var(--sp-3)">
          <span class="num text-tertiary" style="font-size:var(--fs-xs)">${((s.value / total) * 100).toFixed(1)}%</span>
          <span class="num" style="font-size:var(--fs-sm)">${esc(s.label)}</span>
        </div>
      </div>`).join('');
  }

  function exportLedger() {
    ENX.report.exportCSV('energy-nexus-savings-ledger', D.transactions.entries.map((t) => ({
      txnId: t.txnId, site: t.siteName, period: t.period, category: t.category,
      method: t.verificationMethod, grossINR: t.grossSavingINR,
      verifiedINR: t.verifiedSavingINR, nexusFeeINR: t.nexusFeeINR,
      netBenefitINR: t.verifiedSavingINR - t.nexusFeeINR, status: t.status,
    })));
  }
})();
