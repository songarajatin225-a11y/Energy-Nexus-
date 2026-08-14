/**
 * Energy Nexus — digital twin screen.
 * The full site model: topology, model layers, constraint register and assets.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};
  let topo = null;
  const layers = { flow: true, values: true, status: true };

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['sites', 'assets', 'telemetry', 'alerts', 'agents']).then((data) => {
      D = data;
      renderLayers();
      renderAll();
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  document.addEventListener('enx:tick', () => { if (D.sites) { renderTopology(); renderRibbon(); } });
  document.addEventListener('enx:sitechange', () => { if (D.sites) renderAll(); });

  function site() { return ENX.data.siteById(D.sites, ENX.state.get('siteId')); }
  function idx() { return ENX.demo.index(D.telemetry.intervalMinutes); }

  function renderAll() {
    document.querySelector('[data-twin-sub]').textContent =
      `${site().name} · ${site().location} · ${site().industry} · ${site().connectedLoadMW} MW connected load`;
    renderTopology();
    renderRibbon();
    renderModelLayers();
    renderConstraints();
    renderReconciliation();
    renderAssets();
  }

  function renderTopology() {
    const host = document.querySelector('[data-twin-topology]');
    const m = ENX.twin.model(site(), D.assets, D.telemetry, idx());
    if (topo) topo.redraw(m); else topo = ENX.twin.render(host, m, {});
    host.dataset.layers = JSON.stringify(layers);
  }

  function renderLayers() {
    const host = document.querySelector('[data-twin-layers]');
    const defs = [['flow', 'Energy flow'], ['values', 'Values'], ['status', 'Status']];
    host.innerHTML = defs.map(([k, label]) =>
      `<button class="chip" data-layer="${k}" aria-pressed="${layers[k]}">${esc(label)}</button>`).join('');

    host.querySelectorAll('[data-layer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.layer;
        layers[k] = !layers[k];
        btn.setAttribute('aria-pressed', String(layers[k]));
        applyLayers();
      });
    });
  }

  /* Layer toggles hide chrome without re-rendering the whole topology. */
  function applyLayers() {
    const host = document.querySelector('[data-twin-topology]');
    host.querySelectorAll('.topo-flow').forEach((el) => { el.style.display = layers.flow ? '' : 'none'; });
    host.querySelectorAll('.topo-link-label').forEach((el) => { el.style.display = layers.values ? '' : 'none'; });
    host.querySelectorAll('.topo-node__status').forEach((el) => { el.style.display = layers.status ? '' : 'none'; });
  }

  function renderRibbon() {
    const s = D.telemetry.series[site().siteId];
    const i = idx();
    const items = [
      ['Demand', `${s.loadMW[i].toFixed(2)} MW`], ['Grid', `${s.gridMW[i].toFixed(2)} MW`],
      ['Solar', `${s.solarMW[i].toFixed(2)} MW`], ['BESS', `${s.bessMW[i].toFixed(2)} MW`],
      ['SoC', `${s.socPct[i].toFixed(0)}%`], ['Voltage', `${s.voltage[i].toFixed(2)} kV`],
      ['Frequency', `${s.freq[i].toFixed(2)} Hz`], ['PF', s.pf[i].toFixed(3)],
      ['Tariff', `₹${s.tariff[i].toFixed(2)}`], ['Carbon', `${s.carbon[i]} g/kWh`],
    ];
    document.querySelector('[data-twin-ribbon]').innerHTML = items.map(([l, v]) => `
      <div class="telemetry-ribbon__item">
        <span class="telemetry-ribbon__label">${esc(l)}</span>
        <span class="telemetry-ribbon__value">${esc(v)}</span>
      </div>`).join('');
    applyLayers();
  }

  function renderModelLayers() {
    const n = D.assets.assets.filter((a) => a.siteId === site().siteId).length;
    const rows = [
      ['Topology', 'Incomer, transformers, feeders, panels, sub-meters', 'Commissioning survey', '4 days', 'CURRENT'],
      ['Asset models', `${n} assets with nameplate and measured behaviour`, 'OEM + learned', '15 s', 'CURRENT'],
      ['Load model', 'Per-feeder profiles, shift patterns, process criticality', 'Sub-metering', '15 s', 'CURRENT'],
      ['Production context', 'Order book, changeover cost, OEE', 'MES / ERP', '5 min', 'CURRENT'],
      ['Commercial terms', 'Tariff structure, contracted demand, open-access terms', 'Utility bill import', '1 month', 'CURRENT'],
      ['Environmental', 'Ambient, irradiance, forecast', 'Weather service', '15 min', 'CURRENT'],
      ['Grid state', 'Voltage, frequency, power factor, outage history', 'Edge gateway', '1 s', 'CURRENT'],
      ['Carbon', 'Grid intensity, scope 2 accounting', 'Grid operator', '15 min', 'CURRENT'],
      ['Constraint register', 'Hard limits signed by the customer', 'Signed at commissioning', 'On change', 'SIGNED'],
    ];
    document.querySelector('[data-model-layers]').innerHTML = rows.map((r) => `
      <tr>
        <td class="table__primary">${esc(r[0])}</td>
        <td class="text-secondary" style="font-size:var(--fs-xs)">${esc(r[1])}</td>
        <td class="table__meta">${esc(r[2])}</td>
        <td class="num table__meta">${esc(r[3])}</td>
        <td>${ENX.ui.pill(r[4] === 'SIGNED' ? 'VERIFIED' : 'ONLINE')}</td>
      </tr>`).join('');
  }

  function renderConstraints() {
    const s = site();
    const rows = [
      ['Contracted demand', `${s.peakMW} MVA`, 'Never exceeded'],
      ['BESS SoC floor', '20%', 'Reserved for backup duty'],
      ['BESS SoC ceiling', '95%', 'Warranty throughput'],
      ['CHW supply band', '6–8 °C', 'Process cooling protected'],
      ['Compressed air', '≥ 6.2 bar', 'Production critical'],
      ['Non-process zone comfort', '24–25.5 °C', 'Flexibility envelope'],
      ['DG run hours', 'Consent-limited', 'Tier 1 only'],
      ['Setpoint rate limit', '≤ 5% per interval', 'No step changes'],
    ];
    document.querySelector('[data-constraints]').innerHTML = rows.map((r) => `
      <div class="metric-row">
        <span class="metric-row__label">${esc(r[0])}<br>
          <span class="text-tertiary" style="font-size:10px">${esc(r[2])}</span></span>
        <span class="metric-row__value">${esc(r[1])}</span>
      </div>`).join('');
  }

  function renderReconciliation() {
    const rows = [
      ['Metered vs sub-metered', '99.4%', 'positive'],
      ['Unaccounted load', '0.6%', 'positive'],
      ['Failed plausibility checks', '1 point', 'warning'],
      ['Assets reporting', `${D.assets.assets.filter((a) => a.siteId === site().siteId && a.status === 'ONLINE').length} of ${D.assets.assets.filter((a) => a.siteId === site().siteId).length}`, 'positive'],
      ['Model last rebuilt', '4 h ago', ''],
    ];
    document.querySelector('[data-reconciliation]').innerHTML = rows.map((r) => `
      <div class="metric-row">
        <span class="metric-row__label">${esc(r[0])}</span>
        <span class="metric-row__value ${r[2] ? `text-${r[2]}` : ''}">${esc(r[1])}</span>
      </div>`).join('');
  }

  function renderAssets() {
    const list = D.assets.assets.filter((a) => a.siteId === site().siteId);
    document.querySelector('[data-twin-assets]').innerHTML = list.map((a) => `
      <tr data-asset="${esc(a.assetId)}" data-clickable>
        <td class="table__primary">${esc(a.name)}<div class="table__meta">${esc(a.assetId)}</div></td>
        <td><span class="pill">${esc(a.type.toUpperCase())}</span></td>
        <td class="num">${a.ratedMW} MW</td>
        <td class="num">${a.utilisationPct}%</td>
        <td class="num">${a.health}%</td>
        <td>${a.controllable ? ENX.ui.tierBadge(a.tier) : '<span class="pill">MONITOR</span>'}</td>
        <td>${ENX.ui.pill(a.status)}</td>
      </tr>`).join('');

    document.querySelectorAll('[data-asset]').forEach((row) => {
      row.addEventListener('click', () => {
        const asset = D.assets.assets.find((a) => a.assetId === row.dataset.asset);
        const m = ENX.twin.model(site(), D.assets, D.telemetry, idx());
        const node = m.sources.concat(m.loads).find((x) => x.type === asset.type)
          || { type: asset.type, power: 0, status: asset.status.toLowerCase(), assetId: asset.assetId };
        ENX.twin.openInspector(Object.assign({}, node, { assetId: asset.assetId }), m);
      });
    });
  }
})();
