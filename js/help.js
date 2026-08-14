/**
 * Energy Nexus — help.
 * Documents what each screen does and what is simulated.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);

  const SCREENS = [
    ['Command Center', 'What is happening right now across the estate', 'OPERATING'],
    ['Sites', 'Which sites exist and how each is performing', 'OPERATING'],
    ['Digital Twin', 'What the plant model contains and how fresh it is', 'OPERATING'],
    ['Assets', 'Every connected asset, its telemetry and control permission', 'OPERATING'],
    ['Nexus Intelligence', 'What the agent decided, why, and what it would save', 'OPERATING'],
    ['Optimisation', 'What should happen next, and what it is worth', 'OPERATING'],
    ['Forecasts', 'What is expected over the next seven days, with uncertainty', 'OPERATING'],
    ['Analytics', 'What changed against the pre-Nexus baseline', 'OPERATING'],
    ['Flexibility', 'How much capacity could be dispatched, and how firm it is', 'PILOT'],
    ['Nexus Market', 'What price discovery would look like across the network', 'SIMULATION'],
    ['Network', 'How the cluster-first expansion is progressing', 'OPERATING'],
    ['Energy Internet', 'Where the roadmap leads in the long term', 'VISION'],
    ['Safety', 'Whether it is safe, and what happens when things fail', 'OPERATING'],
    ['Reports', 'What to hand the board, the auditor or the utility', 'OPERATING'],
  ];

  const KEYS = [
    ['/', 'Focus global search'],
    ['Enter', 'Open search results'],
    ['Esc', 'Close modal, drawer or mobile navigation'],
    ['Tab', 'Move through interactive elements'],
    ['Space / Enter', 'Activate a focused topology or map node'],
  ];

  const CONVENTIONS = [
    ['Monospaced numbers', 'Every measured quantity — MW, MWh, ₹, timestamps, asset IDs — uses a monospaced face so columns align and digits do not shift as values change.'],
    ['Carrier colours', 'Grid, solar, battery, diesel, HVAC, EV and thermal each keep the same colour in every chart and on the topology, so a colour always means the same carrier.'],
    ['Semantic colour', 'Green is positive or healthy, amber is attention, red is critical, cyan is active intelligence or data flow. Colour is never the only signal — icons and labels carry the same meaning.'],
    ['Tariff shading', 'Charts shade peak blocks red and off-peak blocks green behind the plot, so cost context never requires a separate lookup.'],
    ['The NOW line', 'On forecast charts, a dashed cyan line separates measured history from prediction.'],
    ['Tier badges', 'Every controllable asset and decision shows its autonomy tier. Tier 1 always means a human executes.'],
  ];

  document.addEventListener('enx:ready', () => {
    document.querySelector('[data-help-screens]').innerHTML = SCREENS.map((s) => {
      const cls = s[2] === 'OPERATING' ? 'online' : s[2] === 'PILOT' ? 'pilot' : s[2] === 'SIMULATION' ? 'simulated' : 'future';
      return `<tr>
        <td class="table__primary">${esc(s[0])}</td>
        <td class="text-secondary" style="font-size:var(--fs-xs)">${esc(s[1])}</td>
        <td><span class="pill pill--${cls}">${esc(s[2])}</span></td>
      </tr>`;
    }).join('');

    document.querySelector('[data-help-keys]').innerHTML = KEYS.map((k) => `
      <div class="metric-row">
        <span class="metric-row__label">${esc(k[1])}</span>
        <span class="metric-row__value"><kbd style="font-family:var(--font-mono);padding:2px 7px;
          border:1px solid var(--border-default);border-radius:4px;font-size:var(--fs-xs)">${esc(k[0])}</kbd></span>
      </div>`).join('');

    document.querySelector('[data-help-conventions]').innerHTML = CONVENTIONS.map((c) => `
      <div class="explain-item" style="margin-bottom:var(--sp-4)">
        <div class="explain-item__q">${esc(c[0])}</div>
        <div class="explain-item__a">${esc(c[1])}</div>
      </div>`).join('');
  });
})();
