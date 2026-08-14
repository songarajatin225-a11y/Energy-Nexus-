/**
 * Energy Nexus — industrial cluster network map.
 *
 * The outline and the cluster nodes share one projection, so a node can never
 * drift off the coastline. Simplified geography, sufficient for a cluster map.
 */
window.ENX = window.ENX || {};

ENX.network = (function () {
  const esc = (s) => ENX.ui.escapeHTML(s);

  /* Simplified India boundary as [lng, lat], clockwise from Kashmir. */
  const INDIA = [
    [74.0, 34.5], [75.5, 35.5], [77.0, 35.4], [78.5, 34.6], [79.2, 33.0],
    [79.5, 31.0], [81.0, 30.3], [83.0, 29.2], [85.0, 28.2], [87.0, 27.9], [88.2, 27.3],
    [88.5, 26.5], [89.5, 26.2], [90.5, 26.9], [92.0, 27.5], [94.0, 27.6], [95.5, 28.2],
    [97.0, 28.3], [97.4, 27.3], [96.5, 27.0], [95.2, 26.6], [94.6, 25.2], [94.3, 24.0],
    [93.4, 23.1], [92.6, 22.0], [92.2, 21.3], [91.0, 22.2], [89.9, 21.8], [88.9, 21.7],
    [87.5, 21.5], [86.8, 20.7], [86.0, 19.9], [85.0, 19.5], [84.0, 18.5], [82.5, 17.0],
    [81.0, 16.2], [80.3, 15.8], [80.1, 15.0], [80.2, 13.5], [79.9, 12.5], [79.8, 11.5],
    [79.4, 10.3], [78.8, 9.3], [78.2, 8.9], [77.5, 8.1], [76.9, 8.4], [76.3, 9.5],
    [75.7, 11.2], [74.9, 12.8], [74.5, 14.5], [73.9, 15.8], [73.3, 17.5], [72.9, 19.2],
    [72.7, 20.5], [72.6, 21.6], [72.0, 21.1], [70.5, 20.8], [69.5, 21.5], [68.9, 22.4],
    [68.2, 23.7], [69.2, 24.3], [70.5, 25.7], [71.0, 27.0], [72.5, 28.0], [73.5, 29.5],
    [74.5, 31.0], [74.0, 32.5],
  ];

  const BOUNDS = { minLng: 67.5, maxLng: 98.5, minLat: 7.0, maxLat: 36.5 };

  const STATUS_COLOR = {
    LIVE: 'var(--accent-cyan)',
    RAMPING: 'var(--accent-amber)',
    PILOT: 'var(--accent-violet)',
  };

  function projector(W, H) {
    const spanLng = BOUNDS.maxLng - BOUNDS.minLng;
    const spanLat = BOUNDS.maxLat - BOUNDS.minLat;
    // Preserve aspect so the country is not stretched.
    const scale = Math.min(W / spanLng, H / spanLat);
    const offX = (W - spanLng * scale) / 2;
    const offY = (H - spanLat * scale) / 2;
    return (lng, lat) => [
      offX + (lng - BOUNDS.minLng) * scale,
      offY + (BOUNDS.maxLat - lat) * scale,
    ];
  }

  /**
   * @param {HTMLElement} container
   * @param {object} cfg { nodes, links, onSelect, height, showLabels, selectedId }
   */
  function renderMap(container, cfg) {
    const o = Object.assign({ height: 620, showLabels: true, links: [], nodes: [] }, cfg);
    container.classList.add('network-map');

    function draw() {
      const W = Math.max(320, container.clientWidth || 800);
      const H = o.height;
      const P = projector(W, H);

      const outline = INDIA.map(([lng, lat]) => P(lng, lat).map((n) => n.toFixed(1)).join(',')).join(' ');

      const maxMW = Math.max.apply(null, o.nodes.map((n) => n.euMW));
      const pos = {};
      o.nodes.forEach((n) => { pos[n.nodeId] = P(n.lng, n.lat); });

      const linkParts = o.links.map((l) => {
        const a = pos[l.from], b = pos[l.to];
        if (!a || !b) return '';
        // Arc the link outward so parallel routes stay distinguishable.
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const cx = mx - (dy / len) * len * 0.14;
        const cy = my + (dx / len) * len * 0.14;
        const live = isLive(l.from, o.nodes) && isLive(l.to, o.nodes);
        return `<path class="map-link${live ? ' map-link--active' : ''}"
          d="M ${a[0].toFixed(1)} ${a[1].toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}"/>`;
      }).join('');

      const placed = layoutLabels(o.nodes, pos, W);

      const nodeParts = o.nodes.map((n) => {
        const [x, y] = pos[n.nodeId];
        const r = 4 + (n.euMW / maxMW) * 9;
        const color = STATUS_COLOR[n.status] || 'var(--accent-cyan)';
        const selected = o.selectedId === n.nodeId;
        const lab = placed[n.nodeId];
        const flip = lab.side === 'left';
        return `
          <g class="map-node" data-node="${esc(n.nodeId)}" data-selected="${selected}"
             tabindex="0" role="button" style="--node-color:${color}"
             aria-label="${esc(n.name)}: ${n.sites} sites, ${n.euMW} megawatts under management">
            <circle class="map-node__halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 2.4).toFixed(1)}"/>
            ${n.status === 'LIVE' ? `<circle class="map-node__pulse" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"
              style="animation-delay:${(n.priority * 0.32).toFixed(2)}s"/>` : ''}
            <circle class="map-node__core" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" style="color:${color}"/>
            ${o.showLabels ? `
              ${lab.leader ? `<line x1="${(x + (flip ? -r - 2 : r + 2)).toFixed(1)}" y1="${y.toFixed(1)}"
                x2="${(x + (flip ? -r - 6 : r + 6)).toFixed(1)}" y2="${lab.y.toFixed(1)}"
                stroke="${color}" stroke-width="0.8" opacity="0.5"/>` : ''}
              <text class="map-node__label" x="${(x + (flip ? -r - 7 : r + 7)).toFixed(1)}" y="${(lab.y - 1).toFixed(1)}"
                    text-anchor="${flip ? 'end' : 'start'}">${esc(n.name)}</text>
              <text class="map-node__value" x="${(x + (flip ? -r - 7 : r + 7)).toFixed(1)}" y="${(lab.y + 11).toFixed(1)}"
                    text-anchor="${flip ? 'end' : 'start'}">${n.sites} sites · ${n.euMW} MW</text>` : ''}
          </g>`;
      }).join('');

      container.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
             aria-label="Industrial cluster network across India">
          <polygon class="map-outline" points="${outline}"/>
          ${linkParts}
          ${nodeParts}
        </svg>`;

      container.querySelectorAll('.map-node').forEach((el) => {
        const handler = () => {
          const node = o.nodes.find((n) => n.nodeId === el.dataset.node);
          container.querySelectorAll('.map-node').forEach((x) => { x.dataset.selected = 'false'; });
          el.dataset.selected = 'true';
          if (o.onSelect) o.onSelect(node);
        };
        el.addEventListener('click', handler);
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
        });
      });
    }

    draw();
    let t = null;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(draw, 160); });
    document.addEventListener('enx:theme', draw);
    return { redraw: draw };
  }

  /**
   * Choose a side and vertical offset for every label so none overlap.
   * Dense industrial belts put clusters close together, and colliding labels
   * make the map unreadable exactly where it matters most.
   */
  function layoutLabels(nodes, pos, W) {
    const LINE_H = 22;
    const width = (n) => Math.max(n.name.length * 5.9, `${n.sites} sites · ${n.euMW} MW`.length * 5.2) + 14;

    // Place the biggest clusters first — they get the cleanest position.
    const order = nodes.slice().sort((a, b) => b.euMW - a.euMW);
    const boxes = [];
    const out = {};

    order.forEach((n) => {
      const [x, y] = pos[n.nodeId];
      const w = width(n);

      // Prefer whichever side has more free space and fewer neighbouring nodes.
      const rightCrowd = nodes.filter((m) => m !== n && pos[m.nodeId][0] > x
        && pos[m.nodeId][0] - x < w && Math.abs(pos[m.nodeId][1] - y) < LINE_H).length;
      const leftCrowd = nodes.filter((m) => m !== n && pos[m.nodeId][0] < x
        && x - pos[m.nodeId][0] < w && Math.abs(pos[m.nodeId][1] - y) < LINE_H).length;

      let side = 'right';
      if (x + w > W - 6) side = 'left';
      else if (rightCrowd > leftCrowd && x - w > 6) side = 'left';

      // Nudge vertically in alternating steps until the box is clear.
      let ly = y;
      for (let attempt = 0; attempt < 14; attempt++) {
        const offset = attempt === 0 ? 0
          : (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * LINE_H;
        const candidate = ly + offset;
        const box = {
          x1: side === 'left' ? x - w : x,
          x2: side === 'left' ? x : x + w,
          y1: candidate - 12, y2: candidate + 14,
        };
        if (!boxes.some((b) => overlaps(b, box))) {
          boxes.push(box);
          out[n.nodeId] = { y: candidate, side, leader: Math.abs(candidate - y) > 2 };
          return;
        }
      }
      out[n.nodeId] = { y, side, leader: false };
    });

    return out;
  }

  function overlaps(a, b) {
    return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  }

  function isLive(id, nodes) {
    const n = nodes.find((x) => x.nodeId === id);
    return n && n.status === 'LIVE';
  }

  return { renderMap, INDIA, projector, STATUS_COLOR };
})();
