/**
 * Energy Nexus — navigation model.
 *
 * A static multi-page app: this module owns the nav structure, icon set and
 * active-page resolution so every page renders an identical shell.
 */
window.ENX = window.ENX || {};

ENX.router = (function () {
  /* Inline icon paths — no sprite fetch, nothing to 404, works offline. */
  const ICONS = {
    command: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    grid: 'M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1',
    sites: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5',
    twin: 'M12 2l9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12L3 7',
    assets: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    agent: 'M12 3a4 4 0 014 4v1h1a3 3 0 013 3v6a3 3 0 01-3 3H7a3 3 0 01-3-3v-6a3 3 0 013-3h1V7a4 4 0 014-4zM9 14h.01M15 14h.01',
    optimise: 'M3 17l6-6 4 4 8-8M21 7v5h-5',
    forecast: 'M3 15h4l3-9 4 14 3-7h4',
    flex: 'M13 2L4 14h6l-1 8 9-12h-6z',
    market: 'M3 21h18M5 21V9l4-3 4 3 6-4v16M9 21v-6h4v6',
    network: 'M12 2v6M12 16v6M4.9 6.6l4.3 2.5M14.8 14.9l4.3 2.5M19.1 6.6l-4.3 2.5M9.2 14.9l-4.3 2.5M12 9a3 3 0 100 6 3 3 0 000-6zM3 4a2 2 0 100 4 2 2 0 000-4zM21 4a2 2 0 100 4 2 2 0 000-4zM3 16a2 2 0 100 4 2 2 0 000-4zM21 16a2 2 0 100 4 2 2 0 000-4z',
    analytics: 'M3 3v18h18M7 15v3M12 9v9M17 5v13',
    reports: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 13h6M9 17h6',
    safety: 'M12 2l8 4v6c0 5-3.4 9.4-8 10-4.6-.6-8-5-8-10V6zM9 12l2 2 4-4',
    settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H10a1.6 1.6 0 001-1.5V2a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V10a1.6 1.6 0 001.5 1H22a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
    bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
    help: 'M12 22a10 10 0 100-20 10 10 0 000 20zM9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01',
    search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
    menu: 'M3 12h18M3 6h18M3 18h18',
    close: 'M18 6L6 18M6 6l12 12',
    sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
    check: 'M20 6L9 17l-5-5',
    chevron: 'M9 18l6-6-6-6',
    download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
    play: 'M5 3l14 9-14 9z',
    user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
    internet: 'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15 15 0 014 10 15 15 0 01-4 10 15 15 0 01-4-10 15 15 0 014-10z',
    bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
    alert: 'M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01',
  };

  const NAV = [
    {
      label: 'Operate',
      items: [
        { id: 'dashboard', href: 'dashboard.html', label: 'Command Center', icon: 'command' },
        { id: 'sites', href: 'sites.html', label: 'Sites', icon: 'sites' },
        { id: 'digital-twin', href: 'digital-twin.html', label: 'Digital Twin', icon: 'twin' },
        { id: 'assets', href: 'assets.html', label: 'Assets', icon: 'assets' },
      ],
    },
    {
      label: 'Intelligence',
      items: [
        { id: 'agent', href: 'agent.html', label: 'Nexus Intelligence', icon: 'agent', badge: 'AI' },
        { id: 'optimisation', href: 'optimisation.html', label: 'Optimisation', icon: 'optimise' },
        { id: 'forecasts', href: 'forecasts.html', label: 'Forecasts', icon: 'forecast' },
        { id: 'analytics', href: 'analytics.html', label: 'Analytics', icon: 'analytics' },
      ],
    },
    {
      label: 'Network',
      items: [
        { id: 'flexibility', href: 'flexibility.html', label: 'Flexibility', icon: 'flex' },
        { id: 'marketplace', href: 'marketplace.html', label: 'Nexus Market', icon: 'market', badge: 'V7', future: true },
        { id: 'network', href: 'network.html', label: 'Network', icon: 'network' },
        { id: 'energy-internet', href: 'energy-internet.html', label: 'Energy Internet', icon: 'internet', badge: 'V9', future: true },
      ],
    },
    {
      label: 'Assurance',
      items: [
        { id: 'safety', href: 'safety.html', label: 'Safety', icon: 'safety' },
        { id: 'reports', href: 'reports.html', label: 'Reports', icon: 'reports' },
      ],
    },
  ];

  const FOOTER = [
    { id: 'settings', href: 'settings.html', label: 'Settings', icon: 'settings' },
    { id: 'help', href: 'help.html', label: 'Help', icon: 'help' },
  ];

  /** All navigable pages, flattened — used by global search. */
  function allPages() {
    const pages = [];
    NAV.forEach((g) => g.items.forEach((i) => pages.push(Object.assign({ group: g.label }, i))));
    FOOTER.forEach((i) => pages.push(Object.assign({ group: 'System' }, i)));
    return pages;
  }

  /** Build an inline SVG icon element. */
  function icon(name, size) {
    const d = ICONS[name] || ICONS.command;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (size) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  /** Icon as a markup string, for template literals. */
  function iconHTML(name, cls) {
    const d = ICONS[name] || ICONS.command;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ''}><path d="${d}"/></svg>`;
  }

  return { NAV, FOOTER, ICONS, icon, iconHTML, allPages };
})();
