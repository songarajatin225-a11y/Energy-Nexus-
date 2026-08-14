/**
 * Energy Nexus — safety centre and command audit.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let D = {};
  let auditQuery = '', auditSite = 'ALL', auditActor = 'ALL', auditCommand = 'ALL';

  const CONTROLS = [
    ['Constraint register as contract', 'Hard limits captured in the twin, signed by the customer at commissioning, and enforced at three independent points: the optimiser, the edge controller, and physical interlocks Nexus does not control.', 'ENFORCED'],
    ['Two-key writes', 'Enabling write access on a new asset requires a Nexus commissioning engineer and a named customer engineer, both authenticated, with an immutable audit entry.', 'ENFORCED'],
    ['Envelope enforcement at the edge', 'The edge gateway rejects any cloud instruction outside the signed envelope and logs the rejection. The cloud is never trusted by the edge.', 'ENFORCED'],
    ['Dead-man behaviour', 'Loss of cloud connectivity holds the last valid schedule for a bounded window, then reverts assets to their native controller in a defined safe state.', 'ARMED'],
    ['Rate and excursion limiting', 'Bounded setpoint change per interval, no step changes, and an automatic hold on any measurement failing plausibility checks.', 'ENFORCED'],
    ['Shadow mode before promotion', 'Any new model or policy runs a minimum of 30 days issuing logged, scored recommendations that are never executed, before it may be promoted.', 'PASSED'],
    ['Kill switch, physical and logical', 'A customer-accessible one-click revert to manual, plus a hardware disconnect on every control path.', 'ARMED'],
  ];

  const CYBER = [
    ['IEC 62443-aligned zoning', 'Network segmentation between plant, edge and cloud zones', 'COMPLIANT'],
    ['Outbound-only edge connectivity', 'No inbound connections to the plant by default', 'ENFORCED'],
    ['Mutual TLS', 'Certificate-pinned channels between edge and cloud', 'ENFORCED'],
    ['Signed firmware and policy bundles', 'Nothing executes on the edge unless it verifies', 'ENFORCED'],
    ['No standing remote access', 'Remote sessions require per-session customer approval', 'ENFORCED'],
    ['Full command audit trail', 'Every write recorded, immutable, exportable', 'ACTIVE'],
    ['Third-party penetration test', 'Annual, with findings tracked to closure', 'CURRENT'],
  ];

  document.addEventListener('enx:ready', (e) => {
    if (e.detail && e.detail.error) return;
    ENX.data.loadAll(['audit', 'sites', 'assets']).then((data) => {
      D = data;
      renderSummary(); renderControls(); renderCyber(); renderFailsafe();
      renderAuditFilters(); renderAudit(); wire();
    }).catch((err) => ENX.ui.toast(err.message, 'critical', 8000));
  });

  document.addEventListener('enx:sitechange', () => { if (D.sites) renderSummary(); });

  function site() { return ENX.data.siteById(D.sites, ENX.state.get('siteId')); }

  function renderSummary() {
    const blocked = D.audit.entries.filter((e) => e.status === 'BLOCKED').length;
    const items = [
      ['Envelopes signed', '8 of 8', 'positive'],
      ['Constraint violations', '0', 'positive'],
      ['Writes blocked at edge', String(blocked), blocked ? 'warning' : 'positive'],
      ['Kill switch', 'Armed', 'positive'],
      ['Edge gateways online', '16 of 16', 'positive'],
      ['Last validation', '14 days ago', ''],
    ];
    document.querySelector('[data-safety-summary]').innerHTML = items.map(([l, v, tone]) => `
      <div>
        <div class="eyebrow">${esc(l)}</div>
        <div class="num ${tone ? `text-${tone}` : ''}" style="font-size:var(--fs-md);font-weight:600;margin-top:2px">${esc(v)}</div>
      </div>`).join('');

    document.querySelector('[data-safety-sub]').textContent =
      `${site().name} · all envelopes signed and enforced · no constraint violations in the last 30 days.`;
  }

  function renderControls() {
    document.querySelector('[data-safety-items]').innerHTML = CONTROLS.map((c) => `
      <div class="safety-item">
        <div style="min-width:0;flex:1">
          <div class="safety-item__name">${esc(c[0])}</div>
          <div class="safety-item__desc">${esc(c[1])}</div>
        </div>
        <span class="pill pill--online"><span class="pill__dot"></span>${esc(c[2])}</span>
      </div>`).join('');
  }

  function renderCyber() {
    document.querySelector('[data-cyber-items]').innerHTML = CYBER.map((c) => `
      <div class="safety-item">
        <div style="min-width:0;flex:1">
          <div class="safety-item__name">${esc(c[0])}</div>
          <div class="safety-item__desc">${esc(c[1])}</div>
        </div>
        <span class="pill pill--online"><span class="pill__dot"></span>${esc(c[2])}</span>
      </div>`).join('');
  }

  function renderFailsafe() {
    const rows = [
      ['Cloud unreachable', 'Hold last valid schedule', '5 min'],
      ['Then', 'Revert to native controller', 'Safe state'],
      ['Edge heartbeat lost', 'Assets revert automatically', 'Immediate'],
      ['Constraint violation', 'Revert to Tier 1', 'Immediate'],
      ['Implausible measurement', 'Hold, exclude from twin', 'Immediate'],
      ['Any anomaly at Tier 3', 'Step down to Tier 2', 'Immediate'],
    ];
    document.querySelector('[data-failsafe]').innerHTML = rows.map((r) => `
      <div class="metric-row">
        <span class="metric-row__label">${esc(r[0])}<br>
          <span class="text-tertiary" style="font-size:10px">${esc(r[1])}</span></span>
        <span class="metric-row__value">${esc(r[2])}</span>
      </div>`).join('');
  }

  function renderAuditFilters() {
    const sel = (name, values) => {
      const el = document.querySelector(`[data-audit-${name}]`);
      el.innerHTML = `<option value="ALL">All ${name === 'command' ? 'commands' : `${name}s`}</option>` +
        values.map((v) => `<option value="${esc(v.value)}">${esc(v.label)}</option>`).join('');
    };
    sel('site', D.sites.sites.map((s) => ({ value: s.siteId, label: s.name })));
    sel('actor', Array.from(new Set(D.audit.entries.map((e) => e.actor))).map((a) => ({ value: a, label: a })));
    sel('command', Array.from(new Set(D.audit.entries.map((e) => e.command))).map((c) => ({ value: c, label: c })));
  }

  function filteredAudit() {
    const q = auditQuery.toLowerCase();
    return D.audit.entries
      .filter((e) =>
        (auditSite === 'ALL' || e.siteId === auditSite) &&
        (auditActor === 'ALL' || e.actor === auditActor) &&
        (auditCommand === 'ALL' || e.command === auditCommand) &&
        (!q || e.assetName.toLowerCase().includes(q) || e.auditId.toLowerCase().includes(q)
          || e.reason.toLowerCase().includes(q) || e.actor.toLowerCase().includes(q)))
      .sort((a, b) => b.minuteOfDay - a.minuteOfDay);
  }

  function renderAudit() {
    const list = filteredAudit();
    const host = document.querySelector('[data-audit-rows]');

    if (!list.length) {
      host.innerHTML = `<tr><td colspan="9"><div class="empty-state">
        <h3>No audit entries match</h3><p>Adjust the filters to see more of the trail.</p>
      </div></td></tr>`;
      return;
    }

    host.innerHTML = list.map((e) => `
      <tr>
        <td class="mono" style="font-size:var(--fs-xs)">${ENX.fmt.clock(e.minuteOfDay)}
          <div class="table__meta">${ENX.fmt.ago(e.minuteOfDay)}</div></td>
        <td class="table__primary">${esc(e.actor)}</td>
        <td>${esc(e.assetName)}<div class="table__meta">${esc(e.siteName)}</div></td>
        <td><span class="pill">${esc(e.command)}</span></td>
        <td class="text-secondary" style="font-size:var(--fs-xs)">${esc(e.reason)}</td>
        <td class="num">${e.expectedValueINR ? ENX.fmt.inr(e.expectedValueINR) : '—'}</td>
        <td class="${e.result.startsWith('REJECTED') ? 'text-critical' : 'text-positive'}"
            style="font-size:var(--fs-xs)">${esc(e.result)}</td>
        <td><span class="pill">${esc(e.approval)}</span></td>
        <td>${ENX.ui.pill(e.status)}</td>
      </tr>`).join('');
  }

  function wire() {
    document.querySelectorAll('[data-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-tab]').forEach((t) =>
          t.setAttribute('aria-selected', String(t === tab)));
        document.querySelectorAll('[data-panel]').forEach((p) => {
          p.hidden = p.dataset.panel !== tab.dataset.tab;
        });
      });
    });

    document.querySelector('[data-audit-search]').addEventListener('input', (e) => {
      auditQuery = e.target.value; renderAudit();
    });
    document.querySelector('[data-audit-site]').addEventListener('change', (e) => {
      auditSite = e.target.value; renderAudit();
    });
    document.querySelector('[data-audit-actor]').addEventListener('change', (e) => {
      auditActor = e.target.value; renderAudit();
    });
    document.querySelector('[data-audit-command]').addEventListener('change', (e) => {
      auditCommand = e.target.value; renderAudit();
    });
    document.querySelector('[data-export-audit]').addEventListener('click', () => {
      ENX.report.exportCSV('energy-nexus-command-audit', filteredAudit().map((e) => ({
        auditId: e.auditId, time: ENX.fmt.clock(e.minuteOfDay), actor: e.actor,
        site: e.siteName, asset: e.assetName, command: e.command, reason: e.reason,
        expectedValueINR: e.expectedValueINR, result: e.result, approval: e.approval, status: e.status,
      })));
    });

    document.querySelector('[data-kill-switch]').addEventListener('click', () => {
      ENX.ui.modal({
        eyebrow: 'Emergency control',
        title: 'Return every asset to manual?',
        desc: `${site().name} · this takes effect immediately`,
        body: `
          <div class="stack">
            <div class="callout callout--warning">
              ${ENX.router.iconHTML('alert')}
              <div>Every controllable asset at this site reverts to its native controller in a defined
              safe state. The agent stops issuing setpoints and drops to Tier 1. Savings stop accruing
              until control is re-enabled through a two-key write.</div>
            </div>
            <div class="metric-row"><span class="metric-row__label">Assets affected</span>
              <span class="metric-row__value">${D.assets.assets.filter((a) => a.siteId === site().siteId && a.controllable).length}</span></div>
            <div class="metric-row"><span class="metric-row__label">Production impact</span>
              <span class="metric-row__value text-positive">None</span></div>
            <div class="metric-row"><span class="metric-row__label">Re-enable requires</span>
              <span class="metric-row__value">Two-key write</span></div>
          </div>`,
        footer: `<button class="btn" data-modal-close>Cancel</button>
                 <button class="btn btn--danger" data-confirm-kill>Return to manual</button>`,
        onMount: (b, backdrop) => {
          backdrop.querySelector('[data-confirm-kill]').addEventListener('click', () => {
            ENX.ui.closeModal();
            ENX.ui.toast('All assets returned to manual control. Audit entry recorded.', 'critical', 6000);
          });
        },
      });
    });
  }
})();
