/**
 * Energy Nexus — digital twin topology.
 *
 * Renders the site single-line diagram as an interactive SVG: sources feed a
 * common energy bus, the bus feeds loads, and animated flow encodes real
 * direction and magnitude. Every node opens an inspector drawer.
 */
window.ENX = window.ENX || {};

ENX.twin = (function () {
  const esc = (s) => ENX.ui.escapeHTML(s);

  /* Carrier colour per node type — shared with charts so the estate reads consistently. */
  const CARRIER = {
    grid: 'var(--e-grid)', solar: 'var(--e-solar)', bess: 'var(--e-bess)', dg: 'var(--e-dg)',
    hvac: 'var(--e-hvac)', chiller: 'var(--e-hvac)', compressor: 'var(--e-load)',
    production: 'var(--e-load)', ev: 'var(--e-ev)', thermal: 'var(--e-thermal)',
    meter: 'var(--e-grid)', bus: 'var(--accent-cyan)',
  };

  const LABEL = {
    grid: 'GRID', solar: 'SOLAR', bess: 'BESS', dg: 'DG', hvac: 'HVAC',
    chiller: 'CHILLER', compressor: 'COMPRESSOR', production: 'PRODUCTION',
    ev: 'EV CHARGING', thermal: 'THERMAL', meter: 'METERING',
  };

  /**
   * Build the live topology model for a site at a telemetry index.
   * Load-side power is apportioned from measured site load using each asset's
   * rating, which is how a twin reconciles sub-metered against total demand.
   */
  function model(site, assets, telemetry, idx) {
    const s = telemetry.series[site.siteId];
    const load = s.loadMW[idx];
    const solar = s.solarMW[idx];
    const bess = s.bessMW[idx];      // + discharge, − charge
    const grid = s.gridMW[idx];
    const dg = s.dgMW[idx];

    const siteAssets = assets.assets.filter((a) => a.siteId === site.siteId);
    const loadTypes = ['hvac', 'chiller', 'compressor', 'production', 'ev', 'thermal'];
    const present = loadTypes.filter((t) => siteAssets.some((a) => a.type === t));
    const ratingTotal = present.reduce((sum, t) => {
      const a = siteAssets.find((x) => x.type === t);
      return sum + (a ? a.ratedMW : 0);
    }, 0) || 1;

    const sources = [
      { id: 'grid', type: 'grid', power: grid, status: grid > 0.05 ? 'online' : 'idle', sub: `${s.voltage[idx].toFixed(2)} kV · ${s.pf[idx].toFixed(3)} PF` },
      { id: 'solar', type: 'solar', power: solar, status: solar > 0.05 ? 'online' : 'idle', sub: solar > 0.05 ? `${((solar / site.solarMW) * 100).toFixed(0)}% of ${site.solarMW} MW` : 'No irradiance' },
      { id: 'bess', type: 'bess', power: Math.abs(bess), status: Math.abs(bess) > 0.02 ? 'online' : 'idle', sub: `SoC ${s.socPct[idx].toFixed(0)}% · ${bess > 0.02 ? 'Discharging' : bess < -0.02 ? 'Charging' : 'Idle'}`, direction: bess >= 0 ? 'out' : 'in' },
      { id: 'dg', type: 'dg', power: dg, status: dg > 0.02 ? 'online' : 'idle', sub: dg > 0.02 ? 'Running' : 'Standby · Tier 1' },
    ];

    const loads = present.map((t) => {
      const a = siteAssets.find((x) => x.type === t);
      const share = a.ratedMW / ratingTotal;
      const power = load * share;
      return {
        id: t, type: t, power,
        status: a.status.toLowerCase(),
        sub: subFor(a),
        assetId: a.assetId,
        tier: a.tier,
      };
    });

    return { site, sources, loads, totals: { load, solar, bess, grid, dg, soc: s.socPct[idx] }, idx };
  }

  function subFor(a) {
    const t = a.telemetry || {};
    if (a.type === 'chiller') return `CoP ${t.copActual} · ${t.chwSupplyC} °C`;
    if (a.type === 'hvac') return `${t.zoneTempC} °C · SP ${t.setpointC} °C`;
    if (a.type === 'compressor') return `${t.pressureBar} bar`;
    if (a.type === 'production') return `OEE ${t.oeePct}%`;
    if (a.type === 'ev') return `${t.activeSessions}/${t.connectors} connectors`;
    if (a.type === 'thermal') return `${t.storedMWh} MWh · ${t.tempC} °C`;
    return `${a.utilisationPct}% utilisation`;
  }

  /* ---------- geometry ---------- */
  const NODE_W = 138;
  const NODE_H = 66;
  const VIEW_W = 1060;

  function layout(m, compact) {
    const busY = compact ? 232 : 258;
    const srcY = compact ? 118 : 132;
    const loadY = compact ? 330 : 372;
    const gridY = 18;

    const sources = m.sources.filter((s) => !compact || s.power > 0.01 || s.id === 'grid' || s.id === 'bess');
    // The grid incomer sits centred at the top, as on a real single-line diagram;
    // on-site sources spread across the row beneath it.
    const grid = sources.find((s) => s.id === 'grid');
    const others = sources.filter((s) => s.id !== 'grid');
    const spanS = VIEW_W - 200;
    const src = others.map((s, i) => Object.assign({}, s, {
      x: 100 + (spanS / Math.max(1, others.length)) * (i + 0.5) - NODE_W / 2,
      y: srcY,
    }));
    if (grid) src.unshift(Object.assign({}, grid, { x: VIEW_W / 2 - NODE_W / 2, y: gridY }));

    const spanL = VIEW_W - 120;
    const loads = m.loads.map((l, i) => Object.assign({}, l, {
      x: 60 + (spanL / Math.max(1, m.loads.length)) * (i + 0.5) - NODE_W / 2,
      y: loadY,
    }));

    return { src, loads, busY, height: loadY + NODE_H + 30 };
  }

  /* ---------- rendering ---------- */
  function render(container, m, opts) {
    const o = Object.assign({ compact: false, onSelect: null }, opts);

    function draw() {
      const L = layout(m, o.compact);
      const parts = [];

      /* --- energy bus --- */
      const busX1 = 46, busX2 = VIEW_W - 46;
      parts.push(`
        <rect x="${busX1}" y="${L.busY - 5}" width="${busX2 - busX1}" height="10" rx="5"
              fill="var(--bg-raised)" stroke="var(--border-strong)" stroke-width="1"/>
        <text class="topo-node__sub" x="${busX1 + 4}" y="${L.busY - 13}" style="text-anchor:start">SITE ENERGY BUS · 11 kV</text>
        <text class="topo-node__value" x="${busX2 - 4}" y="${L.busY - 12}"
              style="text-anchor:end;font-size:12px">${m.totals.load.toFixed(2)} MW</text>`);

      /* --- source links (into the bus) --- */
      L.src.forEach((s) => {
        const cx = s.x + NODE_W / 2;
        const yFrom = s.y + NODE_H;
        const flowIn = s.direction === 'in';   // BESS charging draws from the bus
        parts.push(link(cx, yFrom, cx, L.busY, s.power, CARRIER[s.type], flowIn, s.power > 0.01));
        if (s.power > 0.01) {
          parts.push(linkLabel(cx, (yFrom + L.busY) / 2, `${s.power.toFixed(2)} MW`));
        }
      });

      /* --- load links (out of the bus) --- */
      L.loads.forEach((l) => {
        const cx = l.x + NODE_W / 2;
        parts.push(link(cx, L.busY, cx, l.y, l.power, CARRIER[l.type], false, l.power > 0.01));
        if (l.power > 0.01) {
          parts.push(linkLabel(cx, (L.busY + l.y) / 2, `${l.power.toFixed(2)} MW`));
        }
      });

      /* --- nodes --- */
      L.src.concat(L.loads).forEach((n) => parts.push(node(n)));

      container.innerHTML = `
        <svg viewBox="0 0 ${VIEW_W} ${L.height}" width="100%" role="group"
             aria-label="Site energy topology for ${esc(m.site.name)}">${parts.join('')}</svg>`;

      container.querySelectorAll('.topo-node').forEach((el) => {
        el.addEventListener('click', () => select(el, m, o));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(el, m, o); }
        });
      });
    }

    draw();
    return { redraw: (next) => { m = next || m; draw(); } };
  }

  /** A link is a static rail plus an animated flow overlay when power is moving. */
  function link(x1, y1, x2, y2, power, color, reverse, active) {
    const d = `M ${x1} ${y1} L ${x2} ${y2}`;
    if (!active) return `<path class="topo-link" d="${d}"/>`;
    // Faster animation for bigger flows, clamped so it never strobes.
    const dur = Math.max(0.55, Math.min(2.6, 2.2 - power * 0.22)).toFixed(2);
    return `
      <path class="topo-link topo-link--active" d="${d}" style="--flow-color:${color}"/>
      <path class="topo-flow${reverse ? ' topo-flow--reverse' : ''}" d="${d}"
            style="--flow-color:${color};--flow-duration:${dur}s;color:${color}"/>`;
  }

  function linkLabel(x, y, text) {
    const w = text.length * 5.6 + 8;
    return `
      <g class="topo-link-label">
        <rect class="topo-link-label__bg" x="${x - w / 2}" y="${y - 7}" width="${w}" height="14" rx="3"/>
        <text x="${x}" y="${y + 3.5}" text-anchor="middle" class="topo-link-label">${esc(text)}</text>
      </g>`;
  }

  function node(n) {
    const color = CARRIER[n.type] || 'var(--accent-cyan)';
    const cx = n.x + NODE_W / 2;
    return `
      <g class="topo-node" data-node="${esc(n.id)}" data-type="${esc(n.type)}"
         tabindex="0" role="button" aria-label="${esc(LABEL[n.type] || n.type)}: ${n.power.toFixed(2)} megawatts">
        <rect class="topo-node__box" x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="8"/>
        <rect class="topo-node__accent" x="${n.x}" y="${n.y}" width="${NODE_W}" height="3" rx="1.5" fill="${color}"/>
        <circle class="topo-node__status topo-node__status--${esc(n.status)}"
                cx="${n.x + NODE_W - 11}" cy="${n.y + 14}" r="3.2"/>
        <text class="topo-node__label" x="${cx}" y="${n.y + 19}">${esc(LABEL[n.type] || n.type)}</text>
        <text class="topo-node__value" x="${cx}" y="${n.y + 40}">${n.power.toFixed(2)} <tspan style="font-size:9px;fill:var(--text-tertiary)">MW</tspan></text>
        <text class="topo-node__sub" x="${cx}" y="${n.y + 55}">${esc(n.sub || '')}</text>
      </g>`;
  }

  /* ---------- inspector ---------- */
  function select(el, m, o) {
    document.querySelectorAll('.topo-node[data-selected="true"]').forEach((x) => { x.dataset.selected = 'false'; });
    el.dataset.selected = 'true';

    const id = el.dataset.node;
    const n = m.sources.concat(m.loads).find((x) => x.id === id);
    if (!n) return;

    if (o.onSelect) { o.onSelect(n, m); return; }
    openInspector(n, m);
  }

  function openInspector(n, m) {
    const assets = ENX.data.peek('assets');
    const asset = assets && (n.assetId
      ? assets.assets.find((a) => a.assetId === n.assetId)
      : assets.assets.find((a) => a.siteId === m.site.siteId && a.type === n.type));

    const alerts = ENX.data.peek('alerts');
    const related = asset && alerts
      ? alerts.alerts.filter((a) => a.assetId === asset.assetId).slice(0, 3)
      : [];

    const decisions = ENX.data.peek('agents');
    const opportunity = decisions
      ? decisions.decisions.find((d) => d.assetType === n.type && d.siteId === m.site.siteId)
        || decisions.decisions.find((d) => d.assetType === n.type)
      : null;

    const tel = asset && asset.telemetry ? asset.telemetry : {};
    const telRows = Object.keys(tel).map((k) => `
      <div class="metric-row">
        <span class="metric-row__label">${esc(humanise(k))}</span>
        <span class="metric-row__value">${esc(tel[k])}</span>
      </div>`).join('');

    ENX.ui.drawer({
      eyebrow: `${m.site.name} · ${asset ? asset.assetId : n.type.toUpperCase()}`,
      title: asset ? asset.name : (LABEL[n.type] || n.type),
      desc: `${LABEL[n.type] || n.type} · live from the site digital twin`,
      body: `
        <div class="stack">
          <div class="row" style="gap:var(--sp-2);flex-wrap:wrap">
            ${ENX.ui.pill(asset ? asset.status : n.status.toUpperCase())}
            ${asset ? ENX.ui.tierBadge(asset.tier) : ''}
            ${asset && asset.controllable
              ? '<span class="pill pill--active">CONTROLLABLE</span>'
              : '<span class="pill">MONITOR ONLY</span>'}
          </div>

          <div class="card">
            <div class="card__header"><div class="card__title">Live state</div></div>
            <div class="card__body card__body--tight">
              <div class="metric-row">
                <span class="metric-row__label">Power</span>
                <span class="metric-row__value">${n.power.toFixed(2)} MW</span>
              </div>
              ${asset ? `
              <div class="metric-row">
                <span class="metric-row__label">Rated</span>
                <span class="metric-row__value">${asset.ratedMW} MW</span>
              </div>
              <div class="metric-row">
                <span class="metric-row__label">Utilisation</span>
                <span class="metric-row__value">${asset.utilisationPct}%</span>
              </div>
              <div class="metric-row">
                <span class="metric-row__label">Health</span>
                <span class="metric-row__value">${asset.health}%</span>
              </div>` : ''}
              ${telRows}
            </div>
          </div>

          ${asset && asset.note ? `
            <div class="callout callout--warning">
              ${ENX.router.iconHTML('safety')}
              <div><strong>Permanently human-approved.</strong> ${esc(asset.note)}.</div>
            </div>` : ''}

          ${opportunity ? `
            <div class="card">
              <div class="card__header">
                <div>
                  <div class="card__title">Optimisation opportunity</div>
                  <div class="card__desc">Identified by the Nexus agent</div>
                </div>
                <span class="pill pill--optimisation">${esc(opportunity.confidencePct)}% CONF</span>
              </div>
              <div class="card__body card__body--tight">
                <p style="font-size:var(--fs-sm);margin-bottom:var(--sp-3)">${esc(opportunity.why)}</p>
                <div class="metric-row">
                  <span class="metric-row__label">Expected value</span>
                  <span class="metric-row__value text-positive">${ENX.fmt.inr(opportunity.expectedValueINR)}</span>
                </div>
              </div>
            </div>` : ''}

          ${related.length ? `
            <div class="card">
              <div class="card__header"><div class="card__title">Recent alerts</div></div>
              <div>${related.map(ENX.shell.alertRowHTML).join('')}</div>
            </div>` : ''}
        </div>`,
      footer: asset && asset.controllable
        ? `<div class="row" style="gap:var(--sp-2)">
             <a class="btn" style="flex:1" href="agent.html">Open in agent</a>
             <a class="btn btn--primary" style="flex:1" href="optimisation.html">Optimise</a>
           </div>`
        : `<a class="btn btn--block" href="assets.html">View in asset centre</a>`,
    });
  }

  function humanise(k) {
    return k.replace(/([A-Z])/g, ' $1')
      .replace(/^./, (c) => c.toUpperCase())
      .replace(/\bPct\b/i, '%')
      .replace(/\bC\b$/, '°C');
  }

  return { model, render, CARRIER, LABEL, openInspector };
})();
