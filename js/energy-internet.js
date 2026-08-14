/**
 * Energy Nexus — Energy Internet (long-term vision).
 * Explicitly labelled as vision throughout; nothing here claims to be operating.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);

  /* Kept in step with the landing-page roadmap; duplicated here so this screen
     works even if the landing bundle is not loaded. */
  const ROADMAP = [
    { v: 'V1', name: 'Monitoring', horizon: 'M1–M6', state: 'shipped' },
    { v: 'V2', name: 'Forecasting', horizon: 'M4–M12', state: 'shipped' },
    { v: 'V3', name: 'Optimisation', horizon: 'M9–M18', state: 'shipped' },
    { v: 'V4', name: 'AI Energy Agent', horizon: 'M15–M26', state: 'building' },
    { v: 'V5', name: 'Multi-site Orchestration', horizon: 'M22–M32', state: 'next' },
    { v: 'V6', name: 'Energy Router', horizon: 'Y3–Y6', state: 'future' },
    { v: 'V7', name: 'Flexibility Marketplace', horizon: 'M26–Y5', state: 'future' },
    { v: 'V8', name: 'Multi-energy Marketplace', horizon: 'Y5+', state: 'future' },
    { v: 'V9', name: 'Energy Internet', horizon: 'Y5–Y10', state: 'future' },
  ];

  document.addEventListener('enx:ready', () => {
    renderLadder(); renderCarriers(); renderRoadmap(); renderPreconditions(); renderKillCriteria();
  });

  function renderLadder() {
    const rungs = [
      ['Factories', 'Individual industrial sites running the Energy Nexus OS — monitoring, twin, forecasting and optimisation', 'true'],
      ['Industrial clusters', 'Plants inside a 15 km radius coordinating storage, flexibility and load', 'true'],
      ['Energy Nexus network', 'Cluster-to-cluster benchmarking, aggregated flexibility and portfolio optimisation', 'true'],
      ['Multi-energy coordination', 'Electricity, heat, cooling and storage optimised as one system rather than four', 'vision'],
      ['Energy internet', 'Open interoperability and settlement so any asset, meter or counterparty can transact under a common protocol', 'vision'],
    ];
    document.querySelector('[data-ei-ladder]').innerHTML = rungs.map((r, i) => `
      ${i ? '<div class="ladder__connector"></div>' : ''}
      <div class="ladder__rung" data-live="${r[2]}">
        <div class="ladder__title">${esc(r[0])}
          <span class="pill pill--${r[2] === 'vision' ? 'future' : 'online'}" style="margin-left:8px">
            ${r[2] === 'vision' ? 'VISION' : 'OPERATING'}</span>
        </div>
        <div class="ladder__desc">${esc(r[1])}</div>
      </div>`).join('');
  }

  function renderCarriers() {
    const carriers = [
      ['bolt', 'Electricity', 'Grid, solar, storage and load', 'OPERATING', 'var(--e-load)'],
      ['flex', 'Flexibility', 'Certified, dispatchable capacity', 'PILOT', 'var(--accent-green)'],
      ['optimise', 'Storage', 'Battery and thermal energy', 'OPERATING', 'var(--e-bess)'],
      ['forecast', 'Cooling', 'Chilled water and process cooling', 'OPERATING', 'var(--e-hvac)'],
      ['analytics', 'Process heat', 'Steam, hot water and waste heat recovery', 'PILOT', 'var(--e-thermal)'],
      ['network', 'Waste heat exchange', 'One plant’s reject heat as another’s input', 'VISION', 'var(--accent-amber)'],
      ['internet', 'Hydrogen', 'Electrolysis, storage and industrial offtake', 'VISION', 'var(--accent-violet)'],
      ['market', 'Carbon', 'Attribution, accounting and eventual settlement', 'PILOT', 'var(--accent-cyan)'],
    ];
    document.querySelector('[data-carriers]').innerHTML = carriers.map((c) => `
      <div class="feature">
        <div class="feature__icon" style="background:color-mix(in srgb, ${c[4]} 14%, transparent);color:${c[4]}">
          ${ENX.router.iconHTML(c[0])}
        </div>
        <h3>${esc(c[1])}</h3>
        <p>${esc(c[2])}</p>
        <span class="pill pill--${ENX.fmt.slug(c[3] === 'OPERATING' ? 'online' : c[3] === 'VISION' ? 'future' : 'pilot')}"
              style="margin-top:var(--sp-3)">${esc(c[3])}</span>
      </div>`).join('');
  }

  function renderRoadmap() {
    document.querySelector('[data-ei-roadmap]').innerHTML = ROADMAP.map((r) => `
      <div class="roadmap__step" data-state="${esc(r.state)}">
        <div class="roadmap__ver">${esc(r.v)}</div>
        <div class="roadmap__name">${esc(r.name)}</div>
        <div class="roadmap__horizon">${esc(r.horizon)}</div>
        <span class="pill pill--${r.state === 'shipped' ? 'online' : r.state === 'building' ? 'active' : 'future'}"
              style="align-self:flex-start;margin-top:auto">${esc(r.state.toUpperCase())}</span>
      </div>`).join('');
  }

  function renderPreconditions() {
    const items = [
      'A large installed base running the OS reliably, with uptime never traded for intelligence',
      'Verified savings settled against agreed baselines, so the value is proven rather than modelled',
      'Autonomy earned asset by asset through shadow mode and signed envelopes',
      'Cluster density high enough that coordination beats standalone optimisation',
      'State-level frameworks for demand flexibility and open access',
      'A licensed intermediary for any regulated energy transaction',
      'Physical routing hardware proven at pilot scale before productisation',
    ];
    document.querySelector('[data-preconditions]').innerHTML =
      items.map((i) => `<li>${ENX.router.iconHTML('check')}<span>${esc(i)}</span></li>`).join('');
  }

  function renderKillCriteria() {
    const gates = [
      ['Integrate', 'M1–M24', 'Integration cost per site does not fall with volume'],
      ['Prototype', 'M19–M30', 'Routing hardware cannot hold efficiency at industrial duty'],
      ['Pilot', 'M28–M40', 'Payback exceeds the customer’s capital threshold'],
      ['Productise', 'M40–M60', 'No repeatable demand outside the pilot cluster'],
    ];
    document.querySelector('[data-kill-criteria]').innerHTML = gates.map((g) => `
      <div class="metric-row">
        <span class="metric-row__label">${esc(g[0])}<br>
          <span class="text-tertiary" style="font-size:10px">${esc(g[2])}</span></span>
        <span class="metric-row__value">${esc(g[1])}</span>
      </div>`).join('');
  }
})();
