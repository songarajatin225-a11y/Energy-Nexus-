/**
 * Energy Nexus — public landing page.
 *
 * Renders the marketing narrative from the same datasets the OS uses, so the
 * numbers on the homepage and inside the product can never disagree.
 *
 * Content is fixed: every string below is the approved copy. This module owns
 * layout and presentation only.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);

  /* Shared roadmap model — also consumed by the Energy Internet screen. */
  const ROADMAP = [
    { v: 'V1', name: 'Monitoring', horizon: 'M1–M6', state: 'shipped', desc: 'Visibility and bill validation' },
    { v: 'V2', name: 'Forecasting', horizon: 'M4–M12', state: 'shipped', desc: 'A single control plane across grid, solar, BESS and loads' },
    { v: 'V3', name: 'Optimisation', horizon: 'M9–M18', state: 'shipped', desc: 'Verified cost reduction from recommendations' },
    { v: 'V4', name: 'AI Energy Agent', horizon: 'M15–M26', state: 'building', desc: 'Cost reduction without human effort' },
    { v: 'V5', name: 'Multi-site Orchestration', horizon: 'M22–M32', state: 'next', desc: 'Portfolio optimisation across plants' },
    { v: 'V6', name: 'Energy Router', horizon: 'Y3–Y6', state: 'future', desc: 'Physical routing, resilience, faster payback' },
    { v: 'V7', name: 'Flexibility Marketplace', horizon: 'M26–Y5', state: 'future', desc: 'A new revenue line from existing assets' },
    { v: 'V8', name: 'Multi-energy Marketplace', horizon: 'Y5+', state: 'future', desc: 'Price discovery across carriers' },
    { v: 'V9', name: 'Energy Internet', horizon: 'Y5–Y10', state: 'future', desc: 'Infrastructure participation' },
  ];
  window.ENX.ROADMAP = ROADMAP;

  document.addEventListener('enx:ready', () => {
    wireTheme();
    wireNav();
    ENX.heroScroll.init();
    renderStatic();
    observeReveal();

    ENX.data.loadAll(['sites', 'assets', 'telemetry', 'agents', 'network'])
      .then((D) => {
        renderHeroStats(D);
        renderHeroTopology(D);
        renderExplain(D);
        renderMap(D);
      })
      .catch((err) => {
        // The narrative still stands without live figures; say so rather than showing blanks.
        document.querySelector('[data-hero-stats]').innerHTML =
          `<p class="ln-meta">${esc(err.message)}</p>`;
      });
  });

  function wireTheme() {
    const btn = document.querySelector('[data-landing-theme]');
    if (!btn) return;
    const paint = () => {
      const dark = ENX.state.get('theme') === 'dark';
      btn.innerHTML = ENX.router.iconHTML(dark ? 'sun' : 'moon');
      btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    };
    paint();
    btn.addEventListener('click', () => {
      ENX.state.set('theme', ENX.state.get('theme') === 'dark' ? 'light' : 'dark');
      ENX.shell.applyTheme();
      paint();
      document.dispatchEvent(new CustomEvent('enx:theme'));
    });
  }

  /** Header compacts on scroll; nav marks the section currently in view. */
  function wireNav() {
    const nav = document.querySelector('[data-ln-nav]');
    const links = Array.from(document.querySelectorAll('[data-ln-navlinks] a'));

    const onScroll = () => {
      nav.dataset.scrolled = String(window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const sections = links
      .map((a) => document.querySelector(a.getAttribute('href')))
      .filter(Boolean);
    if (!sections.length) return;

    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => {
          a.toggleAttribute('aria-current', a.getAttribute('href') === `#${e.target.id}`);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));
  }

  /** One-shot reveal — no repeat, no parallax. */
  function observeReveal() {
    const targets = document.querySelectorAll('.ln-reveal');
    if (!('IntersectionObserver' in window)) {
      targets.forEach((t) => { t.dataset.visible = 'true'; });
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.dataset.visible = 'true';
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
    targets.forEach((t) => io.observe(t));
  }

  /* ------------------------------------------------------------- hero */
  function renderHeroStats(D) {
    const e = D.sites.estate;
    const stats = [
      [`${(e.euMW / 1000).toFixed(2)} GW`, 'Under management'],
      [`${e.totalSites}`, 'Industrial sites'],
      [`${e.flexibilityMW} MW`, 'Flexibility'],
      [`₹${e.verifiedSavingsCr} Cr`, 'Verified savings'],
    ];
    document.querySelector('[data-hero-stats]').innerHTML = stats.map(([v, l]) => `
      <div class="ln-stat">
        <div class="ln-stat__value">${esc(v)}</div>
        <div class="ln-stat__label">${esc(l)}</div>
      </div>`).join('');
  }

  function renderHeroTopology(D) {
    const site = D.sites.sites[0];
    const idx = ENX.demo.index(D.telemetry.intervalMinutes);
    const host = document.querySelector('[data-hero-topology]');
    document.querySelector('[data-hero-site]').textContent = `${site.name} · ${site.location}`;

    const model = ENX.twin.model(site, D.assets, D.telemetry, idx);
    const topo = ENX.twin.render(host, model, { compact: true });

    const ribbon = document.querySelector('[data-hero-ribbon]');
    const paintRibbon = (m) => {
      const s = D.telemetry.series[site.siteId];
      const i = ENX.demo.index(D.telemetry.intervalMinutes);
      const items = [
        ['Demand', `${m.totals.load.toFixed(2)} MW`],
        ['Solar', `${m.totals.solar.toFixed(2)} MW`],
        ['SoC', `${s.socPct[i].toFixed(0)}%`],
        ['Tariff', `₹${s.tariff[i].toFixed(2)}`],
        ['Carbon', `${s.carbon[i]} g/kWh`],
      ];
      ribbon.innerHTML = items.map(([l, v]) => `
        <div class="telemetry-ribbon__item">
          <span class="telemetry-ribbon__label">${esc(l)}</span>
          <span class="telemetry-ribbon__value">${esc(v)}</span>
        </div>`).join('');
    };
    paintRibbon(model);

    document.addEventListener('enx:tick', () => {
      const m = ENX.twin.model(site, D.assets, D.telemetry, ENX.demo.index(D.telemetry.intervalMinutes));
      topo.redraw(m);
      paintRibbon(m);
    });
  }

  /* --------------------------------------------------------- narrative */
  function renderStatic() {
    /* Problem — numbered rule list */
    document.querySelector('[data-problem-grid]').innerHTML = [
      ['grid', 'Fragmented control', 'Grid, solar, BESS, DG, HVAC and production each run on separate controllers and vendor portals. No layer holds the whole plant.'],
      ['analytics', 'Data without decisions', 'Meters produce readings, not actions. Energy audits produce reports that expire the day the load profile changes.'],
      ['alert', 'Peaks priced brutally', 'A single maximum-demand excursion resets the billing peak for twelve months. Most plants discover it on the invoice.'],
      ['forecast', 'No forward view', 'Without a load and solar forecast, batteries charge on rules of thumb and miss the block that actually mattered.'],
      ['optimise', 'Idle flexibility', 'Batteries, thermal storage and deferrable loads sit unused between events because nothing certifies or dispatches them.'],
      ['safety', 'Trust granted for uptime', 'Indian industry rewards reliability, not intelligence. One unexplained stoppage sets the autonomy roadmap back a year.'],
    ].map(listItemHTML).join('');

    /* Why now — four-column strip */
    document.querySelector('[data-whynow-grid]').innerHTML = [
      ['bolt', 'Behind-the-meter solar is normal', 'C&I rooftop and open-access solar are now standard on industrial sites, creating surplus that needs managing.'],
      ['flex', 'Storage economics crossed over', 'Battery costs have fallen far enough that peak shaving pays back inside the warranty, not after it.'],
      ['market', 'Policy is opening', 'Green open access thresholds have fallen and states are drafting demand-flexibility frameworks.'],
      ['agent', 'Forecasting got cheap', 'Load and solar forecasting that needed a research team now runs on commodity infrastructure.'],
    ].map((f) => `
      <div class="ln-strip__cell">
        <div class="ln-strip__index" aria-hidden="true"></div>
        <h3 class="ln-strip__title">${esc(f[1])}</h3>
        <p class="ln-strip__desc">${esc(f[2])}</p>
      </div>`).join('');

    /* Five questions — five-column strip */
    document.querySelector('[data-landing-questions]').innerHTML = [
      ['01', 'What is happening?', 'Real-time energy state across every connected asset'],
      ['02', 'Why is it happening?', 'AI explanation grounded in the digital twin'],
      ['03', 'What should happen next?', 'The optimisation recommendation, with its value'],
      ['04', 'What is the value?', '₹ savings, MW, MWh and carbon — measured, then verified'],
      ['05', 'Is it safe?', 'Constraints, permissions, autonomy tier and fallback status'],
    ].map(([n, q, a]) => `
      <div class="ln-strip__cell">
        <div class="ln-strip__index">${esc(n)}</div>
        <h3 class="ln-strip__title">${esc(q)}</h3>
        <p class="ln-strip__desc">${esc(a)}</p>
      </div>`).join('');

    /* Architecture — stepped rail */
    const arch = [
      ['Energy assets', 'Grid, solar, BESS, DG, HVAC, chillers, compressors, production, thermal, EV'],
      ['Energy data layer', 'Protocol adapters, edge gateways, Modbus, IEC 61850, OPC-UA, OCPP, MES/ERP'],
      ['Digital twin', 'Topology, asset models, constraints, commercial terms, carbon — reconciled continuously'],
      ['Forecasting', 'Load, solar, price, thermal demand and flexibility with confidence bands'],
      ['Optimisation', 'Cost, peak and carbon objectives solved against the signed constraint register'],
      ['Nexus intelligence', 'Rationale, counterfactual cost and confidence for every decision'],
      ['AI energy agent', 'A constrained entity that owns site energy decisions and escalates when it should'],
      ['Safe action', 'Envelope enforcement at the edge, two-key writes, dead-man fallback, kill switch'],
      ['Verified savings', 'IPMVP-aligned measurement and verification against an agreed baseline'],
    ];
    document.querySelector('[data-architecture-ladder]').innerHTML = arch.map((a) => `
      <div class="ln-rail__step" data-state="live">
        <span class="ln-rail__dot"></span>
        <div>
          <h3 class="ln-rail__title">${esc(a[0])}</h3>
          <p class="ln-rail__desc">${esc(a[1])}</p>
        </div>
      </div>`).join('');

    /* Twin capabilities — numbered rule list */
    document.querySelector('[data-twin-grid]').innerHTML = [
      ['twin', 'Topology and asset models', 'Incomer, transformers, feeders, panels and every downstream asset, with nameplate and measured behaviour.'],
      ['safety', 'The constraint register', 'Hard limits captured at commissioning, signed by the customer, and enforced in the optimiser, the edge and physical interlocks.'],
      ['analytics', 'Commercial and carbon context', 'Tariff structure, contracted demand, open-access terms and grid carbon intensity sit inside the model, not beside it.'],
    ].map(listItemHTML).join('');

    /* Autonomy — spec sheet */
    const tiers = [
      ['Tier 1', 'Human in the loop', 'Recommends actions with rationale and quantified value; a human executes. Month one of every deployment, without exception.'],
      ['Tier 2', 'Semi-autonomous', 'Executes within a signed envelope and escalates anything outside it. BESS, EV charging, thermal storage, non-critical HVAC.'],
      ['Tier 3', 'Fully autonomous', 'Executes freely inside the envelope, including boundary re-planning. Month 12+, and only for a subset of assets.'],
    ];
    document.querySelector('[data-landing-autonomy]').innerHTML = `
      <div class="ln-defs">${tiers.map((t) => `
        <div class="ln-def">
          <div class="ln-def__term">${esc(t[0])}</div>
          <div class="ln-def__val">
            <strong>${esc(t[1])}</strong><br>${esc(t[2])}
          </div>
        </div>`).join('')}</div>`;

    /* Savings waterfall — existing chart component, flattened by panel styling */
    ENX.charts.waterfall(document.querySelector('[data-landing-waterfall]'), [
      { label: 'Annual energy spend', value: 24.6, display: '₹24.6 Cr', color: 'var(--e-grid)', muted: true },
      { label: 'Addressable opportunity', value: 2.1, display: '₹2.1 Cr', color: 'var(--accent-blue)' },
      { label: 'Verified savings', value: 1.48, display: '₹1.48 Cr', color: 'var(--accent-green)' },
      { label: 'Nexus fee', value: 0.38, display: '₹38 L', color: 'var(--accent-amber)' },
      { label: 'Customer net benefit', value: 1.10, display: '₹1.10 Cr', color: 'var(--accent-cyan)' },
    ]);

    /* Energy internet — stepped rail with regime tag */
    const internet = [
      ['Factories', 'Individual industrial sites on the Energy Nexus OS', 'true'],
      ['Industrial clusters', 'Coordinated optimisation across plants inside a 15 km radius', 'true'],
      ['Energy Nexus network', 'Cluster-to-cluster visibility, benchmarking and aggregated flexibility', 'true'],
      ['Multi-energy coordination', 'Electricity, heat, cooling and storage optimised together', 'vision'],
      ['Energy internet', 'Open interoperability and settlement across carriers and counterparties', 'vision'],
    ];
    document.querySelector('[data-landing-internet]').innerHTML = internet.map((r) => `
      <div class="ln-rail__step" data-state="${r[2] === 'vision' ? 'vision' : 'live'}">
        <span class="ln-rail__dot"></span>
        <div>
          <h3 class="ln-rail__title">${esc(r[0])}</h3>
          <p class="ln-rail__desc">${esc(r[1])}</p>
        </div>
        ${r[2] === 'vision' ? '<span class="ln-rail__tag">Long-term vision</span>' : ''}
      </div>`).join('');

    /* Roadmap — horizontal timeline */
    document.querySelector('[data-landing-roadmap]').innerHTML = `
      <div class="ln-timeline">${ROADMAP.map((r) => `
        <div class="ln-timeline__step" data-state="${esc(r.state)}">
          <div class="ln-timeline__marker"></div>
          <div class="ln-timeline__ver">${esc(r.v)}</div>
          <h3 class="ln-timeline__name">${esc(r.name)}</h3>
          <div class="ln-timeline__horizon">${esc(r.horizon)}</div>
          <p class="ln-timeline__desc">${esc(r.desc)}</p>
          <span class="ln-state ln-state--${esc(r.state)}">
            <span class="ln-state__text">${esc(r.state.toUpperCase())}</span>
          </span>
        </div>`).join('')}</div>`;
  }

  /** Problem and twin rows share one numbered-list treatment. */
  function listItemHTML(f) {
    return `
      <div class="ln-list__item">
        <div class="ln-list__num" aria-hidden="true"></div>
        <div>
          <h3 class="ln-list__title">${ENX.router.iconHTML(f[0])}${esc(f[1])}</h3>
          <p class="ln-list__desc">${esc(f[2])}</p>
        </div>
      </div>`;
  }

  /* -------------------------------------------------------- explain */
  function renderExplain(D) {
    const d = D.agents.decisions.find((x) => x.expectedValueINR > 30000) || D.agents.decisions[0];
    document.querySelector('[data-landing-explain]').innerHTML = `
      <div class="ln-def">
        <div class="ln-def__term">Why?</div>
        <div class="ln-def__val">${esc(d.why)}</div>
      </div>
      <div class="ln-def">
        <div class="ln-def__term">What will happen?</div>
        <div class="ln-def__val">${esc(d.whatHappens)}</div>
      </div>
      <div class="ln-def">
        <div class="ln-def__term">What will it save?</div>
        <div class="ln-def__val"><strong>${ENX.fmt.inr(d.expectedValueINR)}</strong>
          at ${d.confidencePct}% confidence.</div>
      </div>
      <div class="ln-def">
        <div class="ln-def__term">Constraints considered</div>
        <div class="ln-def__val">
          <ul class="ln-checks">
            ${d.constraints.map((c) => `<li>${ENX.router.iconHTML('check')}<span>${esc(c)}</span></li>`).join('')}
          </ul>
        </div>
      </div>
      <div class="ln-def ln-def--emphasis">
        <div class="ln-def__term">What if we do nothing?</div>
        <div class="ln-def__val">${esc(d.counterfactual)}</div>
      </div>`;
  }

  function renderMap(D) {
    ENX.network.renderMap(document.querySelector('[data-landing-map]'), {
      nodes: D.network.nodes,
      links: D.network.links,
      height: 600,
      onSelect: (n) => ENX.ui.toast(`${n.name} — ${n.sites} sites, ${n.euMW} MW under management`),
    });
  }
})();
