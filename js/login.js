/**
 * Energy Nexus — sign-in screen.
 *
 * The credential check is a demo gate only; see the note in ENX.auth. This
 * module handles the form, the brand-side live topology, and the redirect back
 * to whichever screen the visitor was trying to reach.
 */
(function () {
  const esc = (s) => ENX.ui.escapeHTML(s);

  document.addEventListener('enx:ready', () => {
    // Already signed in — skip the form entirely.
    if (ENX.auth.isSignedIn()) { go(); return; }

    wireForm();
    renderBrandSide();
  });

  /** Where to land after signing in: ?next=<page>, else the Command Center. */
  function go() {
    const next = new URLSearchParams(location.search).get('next');
    const safe = /^[a-z0-9-]+$/i.test(next || '') ? `${next}.html` : 'dashboard.html';
    location.replace(safe);
  }

  function wireForm() {
    const form = document.querySelector('[data-login-form]');
    const email = document.querySelector('#email');
    const password = document.querySelector('#password');
    const errorEl = document.querySelector('[data-auth-error]');
    const submit = document.querySelector('[data-submit]');
    const label = document.querySelector('[data-submit-label]');

    document.querySelector('[data-toggle-pw]').addEventListener('click', (e) => {
      const show = password.type === 'password';
      password.type = show ? 'text' : 'password';
      e.currentTarget.textContent = show ? 'Hide' : 'Show';
      e.currentTarget.setAttribute('aria-pressed', String(show));
      password.focus();
    });

    document.querySelector('[data-forgot]').addEventListener('click', () => {
      ENX.ui.modal({
        eyebrow: 'Password',
        title: 'No account recovery here',
        desc: 'This prototype has no backend',
        body: `<p style="font-size:var(--fs-sm);color:var(--text-secondary);line-height:var(--lh-snug)">
          There is no user database, no email service and no password reset. The demo password is
          <code style="font-family:var(--font-mono)">nexus2026</code>, shown on the sign-in screen.
          A real deployment would authenticate against your identity provider over SSO.</p>`,
        footer: `<button class="btn btn--primary" data-modal-close>Got it</button>`,
      });
    });

    document.querySelector('[data-demo-signin]').addEventListener('click', () => {
      ENX.auth.start('', false);
      go();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      if (!email.value.trim() || !email.checkValidity()) {
        fail('Enter a valid work email address.');
        email.focus();
        return;
      }
      if (!password.value) {
        fail('Enter your password.');
        password.focus();
        return;
      }

      submit.dataset.busy = 'true';
      label.textContent = 'Signing in';

      try {
        // A brief pause so the busy state is legible rather than a flicker.
        await new Promise((r) => setTimeout(r, 420));
        const ok = await ENX.auth.verify(password.value);
        if (!ok) {
          fail('That password is not correct. The demo password is nexus2026.');
          password.select();
          return;
        }
        ENX.auth.start(email.value.trim(), document.querySelector('[data-remember]').checked);
        label.textContent = 'Signed in';
        go();
      } catch (err) {
        fail(err.message);
      } finally {
        submit.dataset.busy = 'false';
        if (label.textContent === 'Signing in') label.textContent = 'Sign in';
      }
    });

    function fail(message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
      submit.dataset.busy = 'false';
      label.textContent = 'Sign in';
    }
  }

  /** Brand column: estate figures and a live single-line, both from real datasets. */
  function renderBrandSide() {
    const statsEl = document.querySelector('[data-auth-stats]');
    const topoEl = document.querySelector('[data-auth-topology]');
    if (!statsEl) return;

    ENX.data.loadAll(['sites', 'assets', 'telemetry'])
      .then((D) => {
        const e = D.sites.estate;
        const stats = [
          [`${(e.euMW / 1000).toFixed(2)} GW`, 'Under management'],
          [`${e.totalSites}`, 'Sites'],
          [`${e.flexibilityMW} MW`, 'Flexibility'],
          [`₹${e.verifiedSavingsCr} Cr`, 'Verified savings'],
        ];
        statsEl.innerHTML = stats.map(([v, l]) => `
          <div>
            <div class="auth__stat-value">${esc(v)}</div>
            <div class="auth__stat-label">${esc(l)}</div>
          </div>`).join('');

        const site = D.sites.sites[0];
        const idx = () => ENX.demo.index(D.telemetry.intervalMinutes);
        const topo = ENX.twin.render(topoEl, ENX.twin.model(site, D.assets, D.telemetry, idx()), { compact: true });
        document.addEventListener('enx:tick', () => {
          topo.redraw(ENX.twin.model(site, D.assets, D.telemetry, idx()));
        });
      })
      .catch(() => {
        // The form is the point; the brand column degrades quietly.
        statsEl.remove();
        if (topoEl) topoEl.remove();
      });
  }
})();
