/**
 * Energy Nexus — Nexus Intelligence.
 * The agent's decision queue, explainability and autonomy model.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};
  let filter = 'ALL';

  /* Decision classes and tiers, per the product's autonomy model. */
  const MATRIX = [
    ['Should the battery charge?', 'Solar surplus forecast, ToD block, MD headroom, SoC target for the evening peak, degradation cost per cycle', 2],
    ['Should the battery discharge?', 'Predicted MD excursion, peak tariff block, SoC reserve for backup duty, warranty throughput', 2],
    ['Consume or export solar?', 'Self-consumption value against net-billing settlement, RPO and carbon value, banking rules', 2],
    ['Should production be shifted?', 'Order-book slack, changeover cost, labour and shift constraints, ToD delta, MD impact', 1],
    ['Should EV charging be deferred?', 'Departure times, SoC required, MD headroom, ToD block', 3],
    ['Should thermal storage be charged?', 'Cooling load forecast, chiller CoP at ambient, solar surplus, ToD', 2],
    ['Should flexible loads be reduced?', 'Process criticality, thermal and pressure margin, recovery time, event value', 2],
    ['Should backup generation run?', 'Marginal ₹/kWh against grid and battery, emission consent conditions, statutory run-hour limits', 1],
    ['Should the site offer flexibility?', 'Certified available MW, duration, response time, penalty risk, opportunity cost', 2],
    ['Should energy be bought or sold?', 'Only through permitted mechanisms: open-access scheduling, exchange participation via a licensed intermediary, contracted DR', 1],
  ];

  const TIERS = [
    {
      n: 1, name: 'Human in the loop',
      desc: 'Recommends actions with rationale and quantified value; a human executes.',
      entry: 'Month 1 of every deployment', assets: 'All assets',
      approval: 'Per action', reversion: '—', realisation: '40–60%',
    },
    {
      n: 2, name: 'Semi-autonomous',
      desc: 'Executes within a signed envelope and escalates anything outside it.',
      entry: 'Month 4–9, per asset class', assets: 'BESS, EV chargers, thermal storage, non-critical HVAC',
      approval: 'Written envelope signed by plant head and electrical head',
      reversion: 'Any escalation, comms loss over 5 min, or constraint violation reverts to Tier 1',
      realisation: '75–90%',
    },
    {
      n: 3, name: 'Fully autonomous',
      desc: 'Executes freely inside the envelope, including boundary re-planning. Humans set objectives only.',
      entry: 'Month 12+, subset of assets', assets: 'BESS, EV charging, thermal storage',
      approval: 'Standing authorisation, annually re-confirmed',
      reversion: 'Any anomaly reverts to Tier 2, then Tier 1',
      realisation: 'Over 90%',
    },
  ];

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['sites', 'agents', 'telemetry', 'assets']).then((data) => {
      D = data;
      renderHero(); renderFilters(); renderQueue();
      renderLadder(); renderScope(); renderMatrix();
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  document.addEventListener('enx:sitechange', () => { if (D.sites) { renderHero(); renderLadder(); renderScope(); } });
  document.addEventListener('enx:tick', () => { if (D.sites) renderHero(); });

  function site() { return ENX.data.siteById(D.sites, ENX.state.get('siteId')); }

  function renderHero() {
    const s = site();
    const t = D.telemetry.series[s.siteId];
    const i = ENX.demo.index(D.telemetry.intervalMinutes);
    const pool = D.agents.decisions.filter((d) => d.siteId === s.siteId);
    const pending = pool.filter((d) => d.status === 'PENDING APPROVAL');
    const totalValue = pool.reduce((a, d) => a + d.expectedValueINR, 0);

    document.querySelector('[data-agent-hero]').innerHTML = `
      <div class="agent-panel__header">
        <div class="agent-orb" aria-hidden="true"></div>
        <div style="flex:1;min-width:0">
          <div class="row" style="gap:var(--sp-2)">
            <strong style="font-size:var(--fs-md)">NEXUS AGENT</strong>
            <span class="pill pill--active pill--pulse"><span class="pill__dot"></span>ACTIVE</span>
          </div>
          <div class="card__desc">${esc(s.name)} · agent commissioned · shadow mode passed</div>
        </div>
        ${ENX.ui.tierBadge(s.agentTier)}
      </div>
      <div class="agent-metrics">
        <div class="agent-metric">
          <div class="agent-metric__label">Decisions today</div>
          <div class="agent-metric__value">${pool.length}</div>
        </div>
        <div class="agent-metric">
          <div class="agent-metric__label">Awaiting human</div>
          <div class="agent-metric__value ${pending.length ? 'text-warning' : ''}">${pending.length}</div>
        </div>
        <div class="agent-metric">
          <div class="agent-metric__label">Value identified</div>
          <div class="agent-metric__value text-positive">${ENX.fmt.inr(totalValue)}</div>
        </div>
        <div class="agent-metric">
          <div class="agent-metric__label">Battery SoC</div>
          <div class="agent-metric__value">${t.socPct[i].toFixed(0)}%</div>
        </div>
      </div>`;
  }

  function renderFilters() {
    const opts = ['ALL', 'PENDING APPROVAL', 'EXECUTED', 'DECLINED'];
    document.querySelector('[data-decision-filters]').innerHTML = opts.map((o) => {
      const count = o === 'ALL' ? D.agents.decisions.length
        : D.agents.decisions.filter((d) => d.status === o).length;
      return `<button class="chip" data-dfilter="${esc(o)}" aria-pressed="${o === filter}">
        ${esc(o)}<span class="chip__count">${count}</span></button>`;
    }).join('');

    document.querySelectorAll('[data-dfilter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.dfilter;
        document.querySelectorAll('[data-dfilter]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b.dataset.dfilter === filter)));
        renderQueue();
      });
    });
  }

  function renderQueue() {
    const list = D.agents.decisions
      .filter((d) => filter === 'ALL' || d.status === filter)
      .sort((a, b) => {
        // Anything waiting on a human floats to the top, then by value.
        const pa = a.status === 'PENDING APPROVAL' ? 0 : 1;
        const pb = b.status === 'PENDING APPROVAL' ? 0 : 1;
        return pa - pb || b.expectedValueINR - a.expectedValueINR;
      });

    const host = document.querySelector('[data-decision-list]');
    if (!list.length) {
      host.innerHTML = `<div class="empty-state"><h3>Nothing in this state</h3>
        <p>No decisions currently match this filter.</p></div>`;
      return;
    }

    host.innerHTML = list.map((d) => `
      <button class="alert-row alert-row--${d.status === 'PENDING APPROVAL' ? 'warning' : d.status === 'DECLINED' ? 'critical' : 'optimisation'}"
              data-decision="${esc(d.decisionId)}">
        <div class="alert-row__spine"></div>
        <div style="min-width:0">
          <div class="row row--between" style="align-items:flex-start;gap:var(--sp-3)">
            <div class="alert-row__title">${esc(d.title)}</div>
            <div class="row" style="gap:var(--sp-2);flex-shrink:0">
              <span class="num text-positive" style="font-size:var(--fs-xs)">${ENX.fmt.inr(d.expectedValueINR)}</span>
              ${ENX.ui.pill(d.status)}
            </div>
          </div>
          <div class="alert-row__detail">${esc(d.why)}</div>
          <div class="alert-row__meta">
            ${ENX.ui.tierBadge(d.tier)}<span>·</span>
            <span>${esc(d.siteName)}</span><span>·</span>
            <span>${d.confidencePct}% confidence</span><span>·</span>
            <span>${ENX.fmt.ago(d.minuteOfDay)}</span>
          </div>
        </div>
      </button>`).join('');

    host.querySelectorAll('[data-decision]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openDecision(D.agents.decisions.find((d) => d.decisionId === btn.dataset.decision));
      });
    });
  }

  function openDecision(d) {
    if (!d) return;
    const pendingHuman = d.status === 'PENDING APPROVAL';

    ENX.ui.modal({
      eyebrow: `${d.decisionId} · Tier ${d.tier} · ${d.siteName}`,
      title: d.title,
      desc: `${d.confidencePct}% confidence · ${ENX.fmt.inr(d.expectedValueINR)} expected value`,
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
              ${d.expectedValueINR
                ? `<strong class="text-positive">${ENX.fmt.inr(d.expectedValueINR)}</strong> expected value.`
                : 'No direct saving — this action protects the asset or declines to act.'}
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
        </div>
        ${d.tier === 1 ? `
          <div class="callout callout--warning" style="margin-top:var(--sp-5)">
            ${ENX.router.iconHTML('safety')}
            <div><strong>Tier 1 — human approval required.</strong> This decision class never executes
            autonomously. Approving here records a two-key write in the command audit.</div>
          </div>` : ''}`,
      footer: pendingHuman
        ? `<button class="btn btn--danger" data-reject>Reject</button>
           <button class="btn" data-simulate>Simulate</button>
           <button class="btn btn--positive" data-approve>Approve</button>`
        : `<button class="btn" data-simulate>Simulate</button>
           <button class="btn btn--primary" data-modal-close>Close</button>`,
      onMount: (body, backdrop) => {
        const approve = backdrop.querySelector('[data-approve]');
        const reject = backdrop.querySelector('[data-reject]');
        const simulate = backdrop.querySelector('[data-simulate]');
        if (approve) approve.addEventListener('click', () => {
          d.status = 'EXECUTED';
          ENX.ui.closeModal();
          ENX.ui.toast(`Approved — ${d.title}. Two-key write recorded.`, 'positive');
          renderFilters(); renderQueue(); renderHero();
        });
        if (reject) reject.addEventListener('click', () => {
          d.status = 'DECLINED';
          ENX.ui.closeModal();
          ENX.ui.toast(`Rejected — the agent holds the current plan.`, 'warning');
          renderFilters(); renderQueue(); renderHero();
        });
        if (simulate) simulate.addEventListener('click', () => { window.location.href = 'optimisation.html'; });
      },
    });
  }

  function renderLadder() {
    const current = site().agentTier;
    document.querySelector('[data-autonomy-ladder]').innerHTML = TIERS.map((t, i) => `
      ${i ? '<div class="autonomy-arrow">↓</div>' : ''}
      <div class="autonomy-tier" data-current="${t.n === current}">
        <div class="autonomy-tier__head">
          <span class="autonomy-tier__num">TIER ${t.n}</span>
          <span class="autonomy-tier__name">${esc(t.name)}</span>
          ${t.n === current ? '<span class="pill pill--active" style="margin-left:auto">CURRENT</span>' : ''}
        </div>
        <div class="autonomy-tier__desc">${esc(t.desc)}</div>
        <div class="autonomy-tier__meta">
          <div>
            <div class="eyebrow">Assets</div>
            <div style="font-size:var(--fs-xs);margin-top:2px">${esc(t.assets)}</div>
          </div>
          <div>
            <div class="eyebrow">Approval</div>
            <div style="font-size:var(--fs-xs);margin-top:2px">${esc(t.approval)}</div>
          </div>
          <div>
            <div class="eyebrow">Reversion</div>
            <div style="font-size:var(--fs-xs);margin-top:2px">${esc(t.reversion)}</div>
          </div>
          <div>
            <div class="eyebrow">Savings realisation</div>
            <div style="font-size:var(--fs-xs);margin-top:2px">${esc(t.realisation)}</div>
          </div>
        </div>
      </div>`).join('');
  }

  function renderScope() {
    const s = site();
    const assets = D.assets.assets.filter((a) => a.siteId === s.siteId);
    const controllable = assets.filter((a) => a.controllable);
    const tier1Only = controllable.filter((a) => a.tier === 1);

    document.querySelector('[data-agent-scope]').innerHTML = `
      <div class="metric-row"><span class="metric-row__label">Site</span>
        <span class="metric-row__value">${esc(s.name)}</span></div>
      <div class="metric-row"><span class="metric-row__label">Assets in scope</span>
        <span class="metric-row__value">${controllable.length} of ${assets.length}</span></div>
      <div class="metric-row"><span class="metric-row__label">Human-approval only</span>
        <span class="metric-row__value">${tier1Only.length}</span></div>
      <div class="metric-row"><span class="metric-row__label">Envelope status</span>
        <span class="metric-row__value text-positive">Signed</span></div>
      <div class="metric-row"><span class="metric-row__label">Shadow mode</span>
        <span class="metric-row__value">Passed · 34 days</span></div>
      <div class="metric-row"><span class="metric-row__label">Fallback</span>
        <span class="metric-row__value text-positive">Armed</span></div>`;
  }

  function renderMatrix() {
    document.querySelector('[data-decision-matrix]').innerHTML = MATRIX.map((m) => `
      <tr>
        <td class="table__primary">${esc(m[0])}</td>
        <td class="text-secondary" style="font-size:var(--fs-xs)">${esc(m[1])}</td>
        <td>${ENX.ui.tierBadge(m[2])}
          ${m[2] === 1 ? '<div class="table__meta" style="margin-top:3px">Always human</div>' : ''}</td>
      </tr>`).join('');
  }
})();
