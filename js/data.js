/**
 * Energy Nexus — centralised data layer.
 *
 * Every screen reads through this module so the whole OS renders from one
 * unified energy model. Datasets are fetched once and cached for the session.
 */
window.ENX = window.ENX || {};

ENX.data = (function () {
  const cache = new Map();
  const inflight = new Map();

  // Datasets are keyed by filename stem; paths stay relative for GitHub Pages.
  const PATH = (name) => `data/${name}.json`;

  /**
   * Load a dataset once. Concurrent callers share a single request.
   * @param {string} name e.g. 'sites'
   * @returns {Promise<object>}
   */
  function load(name) {
    if (cache.has(name)) return Promise.resolve(cache.get(name));
    if (inflight.has(name)) return inflight.get(name);

    const req = fetch(PATH(name), { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((json) => {
        cache.set(name, json);
        inflight.delete(name);
        return json;
      })
      .catch((err) => {
        inflight.delete(name);
        // file:// has no fetch access — the most common local-run mistake.
        const hint = location.protocol === 'file:'
          ? 'Datasets cannot be read over file://. Run a local web server — see the README.'
          : `Could not load ${PATH(name)} (${err.message}).`;
        throw new Error(hint);
      });

    inflight.set(name, req);
    return req;
  }

  /** Load several datasets and resolve to an object keyed by name. */
  function loadAll(names) {
    return Promise.all(names.map(load)).then((results) => {
      const out = {};
      names.forEach((n, i) => { out[n] = results[i]; });
      return out;
    });
  }

  /** Synchronous read for data already loaded — returns undefined if not cached. */
  function peek(name) { return cache.get(name); }

  /* ---------- derived selectors: one place for cross-dataset joins ---------- */

  function siteById(sites, siteId) {
    return sites.sites.find((s) => s.siteId === siteId) || sites.sites[0];
  }

  function assetsForSite(assets, siteId) {
    return assets.assets.filter((a) => a.siteId === siteId);
  }

  function alertsForSite(alerts, siteId) {
    return alerts.alerts.filter((a) => a.siteId === siteId);
  }

  function decisionsForSite(agents, siteId) {
    return agents.decisions.filter((d) => d.siteId === siteId);
  }

  /**
   * Telemetry index matching the current wall-clock time.
   * Demo mode advances a virtual offset on top of this.
   */
  function currentIndex(intervalMinutes) {
    const now = new Date();
    const minute = now.getHours() * 60 + now.getMinutes();
    return Math.floor(minute / (intervalMinutes || 15));
  }

  /** Slice a telemetry series to the last N hours ending at `endIdx`. */
  function window_(series, endIdx, hours, intervalMinutes) {
    const steps = Math.round((hours * 60) / intervalMinutes);
    const out = [];
    for (let i = steps - 1; i >= 0; i--) {
      // Wrap so the 24-hour profile is continuous across midnight.
      let idx = (endIdx - i) % series.length;
      if (idx < 0) idx += series.length;
      out.push(series[idx]);
    }
    return out;
  }

  /** Build clock labels for a windowed slice. */
  function windowLabels(endIdx, hours, intervalMinutes, length) {
    const labels = [];
    for (let i = length - 1; i >= 0; i--) {
      let idx = (endIdx - i) % (1440 / intervalMinutes);
      if (idx < 0) idx += 1440 / intervalMinutes;
      const mins = idx * intervalMinutes;
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      labels.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
    return labels;
  }

  return {
    load, loadAll, peek,
    siteById, assetsForSite, alertsForSite, decisionsForSite,
    currentIndex, window: window_, windowLabels,
  };
})();
