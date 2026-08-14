/**
 * Energy Nexus — settings.
 * Every control writes through ENX.state so the change is immediate and persisted.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);

  const UNITS = [
    ['Power', 'MW', 'Megawatts, two decimals'],
    ['Energy', 'MWh', 'Megawatt-hours'],
    ['Currency', '₹ INR', 'Lakh and crore compaction'],
    ['Carbon', 'tCO₂e', 'Grid-intensity weighted'],
    ['Tariff', '₹/kWh', 'Time-of-day blocks'],
    ['Timezone', 'IST (UTC+5:30)', 'Asia/Kolkata'],
    ['Numbers', 'en-IN', 'Indian digit grouping'],
  ];

  const INTEGRATIONS = [
    ['Modbus TCP/RTU', 'Meters, inverters, PLCs', 'CONNECTED'],
    ['IEC 61850', 'Substation and protection', 'CONNECTED'],
    ['IEC 60870-5-104', 'Utility SCADA telemetry', 'CONNECTED'],
    ['OPC-UA', 'Plant automation', 'CONNECTED'],
    ['OCPP 1.6J / 2.0.1', 'EV charging infrastructure', 'CONNECTED'],
    ['BACnet', 'HVAC and building systems', 'CONNECTED'],
    ['SunSpec', 'Solar inverters', 'CONNECTED'],
    ['MES / ERP', 'REST, OPC-UA, SQL', 'CONNECTED'],
    ['Weather service', 'Irradiance and ambient forecast', 'CONNECTED'],
    ['Utility bill import', 'Tariff and contracted demand', 'MANUAL'],
  ];

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    renderUnits();
    renderIntegrations();
    ENX.data.load('sites').then(hydrate).catch(() => hydrate(null));
  });

  function hydrate(sites) {
    const themeSel = document.querySelector('[data-set-theme]');
    themeSel.value = ENX.state.get('theme');
    themeSel.addEventListener('change', (e) => {
      ENX.state.set('theme', e.target.value);
      ENX.shell.applyTheme();
      document.dispatchEvent(new CustomEvent('enx:theme'));
      ENX.ui.toast(`Theme set to ${e.target.value}`, 'positive');
    });

    const motionSel = document.querySelector('[data-set-motion]');
    motionSel.value = ENX.state.get('motion');
    motionSel.addEventListener('change', (e) => {
      ENX.state.set('motion', e.target.value);
      ENX.shell.applyTheme();
      ENX.ui.toast(e.target.value === 'off' ? 'Reduced motion enabled' : 'Full motion enabled', 'positive');
    });

    const demoBtn = document.querySelector('[data-set-demo]');
    demoBtn.setAttribute('aria-pressed', String(ENX.state.get('demo')));
    demoBtn.addEventListener('click', () => {
      const on = ENX.state.get('demo');
      ENX.state.set('demo', !on);
      demoBtn.setAttribute('aria-pressed', String(!on));
      const topbarSwitch = document.querySelector('[data-action="toggle-demo"]');
      if (topbarSwitch) topbarSwitch.setAttribute('aria-pressed', String(!on));
      const banner = document.querySelector('[data-demo-banner]');
      if (banner) banner.hidden = on;
      if (!on) ENX.demo.start(); else ENX.demo.stop();
      ENX.ui.toast(!on ? 'Demo mode on' : 'Demo mode off', 'positive');
    });

    const siteSel = document.querySelector('[data-set-site]');
    if (sites) {
      siteSel.innerHTML = sites.sites.map((s) =>
        `<option value="${esc(s.siteId)}"${s.siteId === ENX.state.get('siteId') ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
      siteSel.addEventListener('change', (e) => {
        ENX.state.set('siteId', e.target.value);
        const topbar = document.querySelector('[data-action="site-select"]');
        if (topbar) topbar.value = e.target.value;
        document.dispatchEvent(new CustomEvent('enx:sitechange', { detail: { siteId: e.target.value } }));
        ENX.ui.toast('Default site updated', 'positive');
      });
    } else {
      siteSel.innerHTML = '<option>Sites unavailable</option>';
      siteSel.disabled = true;
    }

    const orgSel = document.querySelector('[data-set-org]');
    orgSel.value = ENX.state.get('org');
    orgSel.addEventListener('change', (e) => {
      ENX.state.set('org', e.target.value);
      const topbar = document.querySelector('[data-action="org-select"]');
      if (topbar) topbar.value = e.target.value;
      ENX.ui.toast('Organisation updated', 'positive');
    });

    document.querySelector('[data-reset]').addEventListener('click', () => {
      ENX.ui.modal({
        eyebrow: 'Reset',
        title: 'Clear local preferences?',
        desc: 'Theme, motion, demo mode, default site and organisation return to their defaults.',
        body: `<p style="font-size:var(--fs-sm);color:var(--text-secondary)">
          No data leaves this browser either way — this only clears what is stored locally.</p>`,
        footer: `<button class="btn" data-modal-close>Cancel</button>
                 <button class="btn btn--danger" data-confirm-reset>Reset and reload</button>`,
        onMount: (b, backdrop) => {
          backdrop.querySelector('[data-confirm-reset]').addEventListener('click', () => {
            try { localStorage.removeItem('enx.state.v1'); } catch (err) { /* nothing stored */ }
            location.reload();
          });
        },
      });
    });
  }

  function renderUnits() {
    document.querySelector('[data-units]').innerHTML = UNITS.map((u) => `
      <div class="metric-row">
        <span class="metric-row__label">${esc(u[0])}<br>
          <span class="text-tertiary" style="font-size:10px">${esc(u[2])}</span></span>
        <span class="metric-row__value">${esc(u[1])}</span>
      </div>`).join('');
  }

  function renderIntegrations() {
    document.querySelector('[data-integrations]').innerHTML = INTEGRATIONS.map((i) => `
      <div class="metric-row">
        <span class="metric-row__label">${esc(i[0])}<br>
          <span class="text-tertiary" style="font-size:10px">${esc(i[1])}</span></span>
        <span class="pill pill--${i[2] === 'CONNECTED' ? 'online' : 'warning'}">
          <span class="pill__dot"></span>${esc(i[2])}</span>
      </div>`).join('');
  }
})();
