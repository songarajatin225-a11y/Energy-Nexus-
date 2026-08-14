/**
 * Energy Nexus — onboarding wizard.
 * A seven-step commissioning walkthrough ending in a live twin.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);
  let step = 0;

  const STEPS = [
    {
      title: 'Connect site',
      lede: 'Register the plant and its commercial context so everything downstream has a frame of reference.',
      fields: [
        ['Site name', 'text', 'Hosur Manufacturing Cluster'],
        ['Location', 'text', 'Hosur, Tamil Nadu'],
        ['Industry', 'select', ['Auto components', 'Electronics / EMS', 'Chemicals', 'Pharmaceuticals', 'Textiles']],
        ['Connected load (MW)', 'text', '12.4'],
        ['Shift pattern', 'select', ['3-shift continuous', '2-shift', 'Single shift']],
      ],
      note: 'Connected load and shift pattern set the expected profile the twin reconciles against.',
    },
    {
      title: 'Import utility bill',
      lede: 'Twelve months of bills give the tariff structure, contracted demand and the baseline that savings are later verified against.',
      fields: [
        ['Utility', 'select', ['TANGEDCO', 'BESCOM', 'MSEDCL', 'DGVCL', 'TSSPDCL']],
        ['Tariff category', 'select', ['HT-I Industrial', 'HT-II', 'EHT']],
        ['Contracted demand (kVA)', 'text', '10,200'],
        ['Billing months available', 'text', '12'],
      ],
      note: 'Without a clean baseline there is nothing to verify savings against — this step is not optional.',
    },
    {
      title: 'Connect energy meters',
      lede: 'Point the edge gateway at the incomer and every sub-meter that matters.',
      fields: [
        ['Gateway', 'select', ['ENX-GW-02 (installed)', 'ENX-GW-03 (pending)']],
        ['Protocol', 'select', ['Modbus TCP', 'Modbus RTU', 'IEC 61850', 'OPC-UA']],
        ['Meters discovered', 'text', '38'],
        ['Poll interval', 'select', ['15 seconds', '30 seconds', '1 minute']],
      ],
      note: 'The gateway connects outbound only. No inbound path into the plant is opened.',
    },
    {
      title: 'Map assets',
      lede: 'Attach every generation, storage and load asset to the topology, with nameplate data and control capability.',
      fields: [
        ['Assets discovered', 'text', '10'],
        ['Controllable assets', 'text', '7'],
        ['Solar capacity (MW)', 'text', '4.2'],
        ['Battery', 'text', '5 MW / 10 MWh'],
      ],
      note: 'Mapping determines what the agent can ever touch. Anything unmapped stays invisible to it.',
    },
    {
      title: 'Build digital twin',
      lede: 'Reconcile metered against sub-metered energy, then capture the constraint register the customer signs.',
      fields: [
        ['Reconciliation', 'text', '99.4% accounted'],
        ['Unaccounted load', 'text', '0.6%'],
        ['Constraints captured', 'text', '8'],
        ['Signed by', 'text', 'Plant head + electrical head'],
      ],
      note: 'The signed constraint register becomes a contract, enforced in the optimiser, the edge and physical interlocks.',
    },
    {
      title: 'Run energy diagnostic',
      lede: 'Thirty days of shadow mode: the agent issues recommendations that are logged and scored but never executed.',
      fields: [
        ['Shadow period', 'text', '34 days'],
        ['Recommendations logged', 'text', '412'],
        ['Would-have-saved', 'text', '₹18.4 L'],
        ['Constraint violations', 'text', '0'],
      ],
      note: 'No policy is promoted to live control until it has survived shadow mode with a clean record.',
    },
    {
      title: 'Activate Nexus',
      lede: 'Enable write access through a two-key ceremony and start at Tier 1, without exception.',
      fields: [
        ['Starting tier', 'select', ['Tier 1 — human in the loop']],
        ['Nexus engineer', 'text', 'S. Menon'],
        ['Customer engineer', 'text', 'R. Iyer (Plant Head)'],
        ['Kill switch tested', 'select', ['Yes — passed']],
      ],
      note: 'Every deployment starts at Tier 1. Autonomy is earned per asset class, never granted at commissioning.',
    },
  ];

  document.addEventListener('enx:ready', () => {
    renderOutputs();
    render();
  });

  function render() {
    renderSteps();
    renderPanel();
    renderProgress();
  }

  function renderSteps() {
    document.querySelector('[data-wizard-steps]').innerHTML = STEPS.map((s, i) => `
      <button class="wizard-step" data-goto="${i}"
              data-state="${i === step ? 'active' : i < step ? 'done' : 'todo'}">
        <span class="wizard-step__num">${String(i + 1).padStart(2, '0')}</span>
        <span>${esc(s.title)}</span>
        ${i < step ? ENX.router.iconHTML('check') : ''}
      </button>`).join('');

    document.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => { step = parseInt(btn.dataset.goto, 10); render(); });
    });
  }

  function renderPanel() {
    const s = STEPS[step];
    const done = step === STEPS.length;

    if (done) { renderComplete(); return; }

    document.querySelector('[data-wizard-panel]').innerHTML = `
      <div class="card__header">
        <div>
          <div class="eyebrow">Step ${String(step + 1).padStart(2, '0')}</div>
          <div class="card__title" style="font-size:var(--fs-lg);margin-top:3px">${esc(s.title)}</div>
        </div>
      </div>
      <div class="card__body stack" style="gap:var(--sp-5)">
        <p class="text-secondary" style="font-size:var(--fs-md);line-height:var(--lh-snug)">${esc(s.lede)}</p>
        <div class="grid grid--2">
          ${s.fields.map((f, i) => fieldHTML(f, i)).join('')}
        </div>
        <div class="callout callout--info">
          ${ENX.router.iconHTML('help')}
          <div>${esc(s.note)}</div>
        </div>
      </div>
      <div class="card__footer">
        <div class="row row--between">
          <button class="btn" data-prev ${step === 0 ? 'aria-disabled="true"' : ''}>Back</button>
          <button class="btn btn--primary" data-next>
            ${step === STEPS.length - 1 ? 'Activate Nexus' : 'Continue'}
          </button>
        </div>
      </div>`;

    document.querySelector('[data-next]').addEventListener('click', () => {
      step = Math.min(STEPS.length, step + 1);
      render();
    });
    const prev = document.querySelector('[data-prev]');
    prev.addEventListener('click', () => { if (step > 0) { step -= 1; render(); } });
  }

  function fieldHTML(f, i) {
    const id = `f-${step}-${i}`;
    if (f[1] === 'select') {
      return `
        <div class="field">
          <label class="field__label" for="${id}">${esc(f[0])}</label>
          <select class="select" id="${id}">${f[2].map((o) => `<option>${esc(o)}</option>`).join('')}</select>
        </div>`;
    }
    return `
      <div class="field">
        <label class="field__label" for="${id}">${esc(f[0])}</label>
        <input class="input" id="${id}" type="text" value="${esc(f[2])}">
      </div>`;
  }

  function renderComplete() {
    document.querySelector('[data-wizard-panel]').innerHTML = `
      <div class="card__body" style="text-align:center;padding:var(--sp-16) var(--sp-6)">
        <div style="width:64px;height:64px;margin:0 auto var(--sp-5);border-radius:50%;
             display:flex;align-items:center;justify-content:center;
             background:var(--wash-green);color:var(--accent-green)">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <h2 style="font-size:var(--fs-2xl);font-weight:650;letter-spacing:-0.025em">Your energy twin is ready.</h2>
        <p class="text-secondary" style="font-size:var(--fs-md);margin:var(--sp-4) auto 0;max-width:52ch;line-height:var(--lh-base)">
          The site is connected, the twin is reconciled, the constraint register is signed and the agent
          is live at Tier 1. Recommendations begin immediately; autonomy is earned from here.
        </p>
        <div class="grid grid--3" style="gap:var(--sp-5);margin:var(--sp-8) auto 0;max-width:520px">
          <div><div class="eyebrow">Assets mapped</div>
            <div class="num" style="font-size:var(--fs-xl);font-weight:550">10</div></div>
          <div><div class="eyebrow">Reconciliation</div>
            <div class="num text-positive" style="font-size:var(--fs-xl);font-weight:550">99.4%</div></div>
          <div><div class="eyebrow">Starting tier</div>
            <div class="num" style="font-size:var(--fs-xl);font-weight:550">Tier 1</div></div>
        </div>
        <div class="row" style="justify-content:center;gap:var(--sp-3);margin-top:var(--sp-8);flex-wrap:wrap">
          <button class="btn" data-restart>Run through again</button>
          <a class="btn btn--primary" href="dashboard.html">Open Command Center</a>
        </div>
      </div>`;

    document.querySelector('[data-restart]').addEventListener('click', () => { step = 0; render(); });
    ENX.ui.toast('Site activated — agent live at Tier 1', 'positive');
  }

  function renderProgress() {
    const pct = Math.round((step / STEPS.length) * 100);
    document.querySelector('[data-wizard-bar]').style.width = `${pct}%`;
    document.querySelector('[data-step-num]').textContent = Math.min(step + 1, STEPS.length);
    document.querySelector('[data-step-pct]').textContent = `${pct}%`;
  }

  function renderOutputs() {
    const items = [
      'A reconciled digital twin of the plant',
      'A signed constraint register enforced at three independent points',
      'A verified baseline for measuring savings',
      'An edge gateway with outbound-only connectivity',
      'A tested kill switch, physical and logical',
      'Named two-key holders on both sides',
      'A shadow-mode record proving the policy before it acts',
    ];
    document.querySelector('[data-commissioning-outputs]').innerHTML =
      items.map((i) => `<li>${ENX.router.iconHTML('check')}<span>${esc(i)}</span></li>`).join('');
  }
})();
