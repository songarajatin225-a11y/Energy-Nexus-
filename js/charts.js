/**
 * Energy Nexus — chart engine.
 *
 * Hand-built SVG, no charting library. Every chart is a pure function of its
 * config, re-rendered on resize and on theme change, so the same code serves
 * telemetry, forecasts, market depth and analytics.
 */
window.ENX = window.ENX || {};

ENX.charts = (function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const instances = [];

  /* ---------- helpers ---------- */

  /** Resolve `var(--token)` to a concrete colour — SVG attributes cannot use var(). */
  function resolveColor(c) {
    if (typeof c !== 'string') return '#2E8BFF';
    const m = c.match(/^var\((--[^)]+)\)$/);
    if (!m) return c;
    const value = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
    return value || '#2E8BFF';
  }

  const esc = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** Nice axis ticks — round numbers a human would choose. */
  function niceTicks(min, max, count) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const raw = span / (count || 5);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = start; v <= end + step * 0.001; v += step) ticks.push(Number(v.toFixed(10)));
    return ticks;
  }

  function extent(arrays) {
    let min = Infinity, max = -Infinity;
    arrays.forEach((arr) => arr.forEach((v) => {
      if (v === null || v === undefined || Number.isNaN(v)) return;
      if (v < min) min = v;
      if (v > max) max = v;
    }));
    if (min === Infinity) { min = 0; max = 1; }
    return [min, max];
  }

  /** Register a chart so it survives resize and theme changes. */
  function register(container, renderFn) {
    const existing = instances.findIndex((i) => i.el === container);
    if (existing !== -1) instances.splice(existing, 1);
    instances.push({ el: container, render: renderFn });
    renderFn();
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      instances.forEach((i) => { if (document.body.contains(i.el)) i.render(); });
    }, 140);
  });
  document.addEventListener('enx:theme', () => {
    instances.forEach((i) => { if (document.body.contains(i.el)) i.render(); });
  });

  /* ======================================================================
     Line / area chart — the workhorse
     ====================================================================== */
  function line(container, config) {
    const cfg = Object.assign({
      height: 300, legend: true, yLabel: '', xTicks: 6, yTicks: 5,
      yFormat: (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)),
      series: [], bands: [], periods: [], refLines: [], labels: [],
      animate: false,
    }, config);

    container.classList.add('chart');
    const hidden = new Set(cfg.hiddenSeries || []);

    function render() {
      const W = Math.max(280, container.clientWidth || 600);
      const H = cfg.height;
      const pad = { t: 14, r: 14, b: 26, l: 48 };
      const pw = W - pad.l - pad.r;
      const ph = H - pad.t - pad.b;

      const visible = cfg.series.filter((s) => !hidden.has(s.key));
      const dataArrays = visible.map((s) => s.values)
        .concat(cfg.bands.flatMap((b) => [b.lower, b.upper]))
        .concat(cfg.refLines.map((r) => [r.value]));

      let [dmin, dmax] = extent(dataArrays.length ? dataArrays : [[0, 1]]);
      if (cfg.yMin !== undefined) dmin = cfg.yMin;
      if (cfg.yMax !== undefined) dmax = cfg.yMax;
      // Anchor at zero for positive-only data so magnitudes stay honest.
      if (dmin > 0 && cfg.zeroBase !== false) dmin = 0;
      if (dmax < 0) dmax = 0;

      const ticks = niceTicks(dmin, dmax, cfg.yTicks);
      const yLo = Math.min(ticks[0], dmin);
      const yHi = Math.max(ticks[ticks.length - 1], dmax);

      const n = Math.max(1, (cfg.labels.length || (visible[0] ? visible[0].values.length : 2)) - 1);
      const X = (i) => pad.l + (i / n) * pw;
      const Y = (v) => pad.t + ph - ((v - yLo) / (yHi - yLo || 1)) * ph;

      const parts = [];

      /* tariff / period shading */
      cfg.periods.forEach((p) => {
        const x1 = X(p.from), x2 = X(p.to);
        parts.push(`<rect class="chart__period chart__period--${esc(p.kind)}"
          x="${x1}" y="${pad.t}" width="${Math.max(0, x2 - x1)}" height="${ph}"/>`);
      });

      /* gridlines + y ticks */
      ticks.forEach((t) => {
        if (t < yLo || t > yHi) return;
        const y = Y(t);
        parts.push(`<line class="chart__grid-line" x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}"/>`);
        parts.push(`<text class="chart__tick chart__tick--y" x="${pad.l - 8}" y="${y + 3}">${esc(cfg.yFormat(t))}</text>`);
      });

      /* x ticks */
      if (cfg.labels.length) {
        const step = Math.max(1, Math.ceil(cfg.labels.length / cfg.xTicks));
        cfg.labels.forEach((lab, i) => {
          if (i % step !== 0 && i !== cfg.labels.length - 1) return;
          parts.push(`<text class="chart__tick chart__tick--x" x="${X(i)}" y="${H - 8}">${esc(lab)}</text>`);
        });
      }

      /* confidence bands, drawn behind the lines */
      cfg.bands.forEach((b) => {
        if (hidden.has(b.key)) return;
        const up = b.upper.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
        const lo = b.lower.map((v, i) => `${X(i)},${Y(v)}`).reverse().join(' ');
        parts.push(`<polygon class="chart__band" points="${up} ${lo}" fill="${resolveColor(b.color)}"/>`);
      });

      /* axis baseline */
      parts.push(`<line class="chart__axis-line" x1="${pad.l}" y1="${Y(Math.max(yLo, 0))}" x2="${W - pad.r}" y2="${Y(Math.max(yLo, 0))}"/>`);

      /* series */
      visible.forEach((s) => {
        const color = resolveColor(s.color);
        const pts = s.values.map((v, i) => `${X(i)},${Y(v)}`);
        if (s.type === 'area') {
          const base = Y(Math.max(yLo, 0));
          parts.push(`<polygon class="chart__area" fill="${color}"
            points="${X(0)},${base} ${pts.join(' ')} ${X(s.values.length - 1)},${base}"/>`);
        }
        if (s.type === 'bar') {
          const bw = Math.max(1.5, (pw / s.values.length) * 0.58);
          const base = Y(Math.max(yLo, 0));
          s.values.forEach((v, i) => {
            const y = Y(v);
            parts.push(`<rect class="chart__bar" x="${X(i) - bw / 2}" y="${Math.min(y, base)}"
              width="${bw}" height="${Math.max(0.5, Math.abs(base - y))}" fill="${color}" rx="1"/>`);
          });
          return;
        }
        parts.push(`<polyline class="chart__line${s.dashed ? ' chart__line--dashed' : ''}${s.thin ? ' chart__line--thin' : ''}"
          stroke="${color}" points="${pts.join(' ')}"/>`);
      });

      /* reference lines (contracted demand, peak ceiling) */
      cfg.refLines.forEach((r) => {
        const y = Y(r.value);
        parts.push(`<line class="chart__ref-line" x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}"/>`);
        if (r.label) parts.push(`<text class="chart__ref-label" x="${W - pad.r}" y="${y - 5}" text-anchor="end">${esc(r.label)}</text>`);
      });

      /* the boundary between measured and forecast */
      if (cfg.nowIndex !== undefined && cfg.nowIndex !== null) {
        const x = X(cfg.nowIndex);
        parts.push(`<line class="chart__now-line" x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t + ph}"/>`);
        parts.push(`<text class="chart__now-label" x="${x + 4}" y="${pad.t + 9}">NOW</text>`);
      }

      /* interaction layer */
      parts.push(`<line class="chart__crosshair" x1="0" y1="${pad.t}" x2="0" y2="${pad.t + ph}" data-crosshair/>`);
      visible.forEach((s) => {
        parts.push(`<circle class="chart__hover-dot" r="3.5" fill="${resolveColor(s.color)}" data-dot="${esc(s.key)}"/>`);
      });
      parts.push(`<rect class="chart__hit" x="${pad.l}" y="${pad.t}" width="${pw}" height="${ph}" data-hit/>`);

      container.innerHTML =
        `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
           aria-label="${esc(cfg.ariaLabel || 'Time series chart')}">${parts.join('')}</svg>
         <div class="chart-tooltip" data-tooltip></div>` +
        (cfg.legend ? legendHTML(cfg, hidden) : '');

      wireHover(container, cfg, { X, Y, pad, pw, ph, W, H, visible });
      if (cfg.legend) wireLegend(container, cfg, hidden, render);
    }

    register(container, render);
    return { render, container };
  }

  function legendHTML(cfg, hidden) {
    const items = cfg.series.map((s) => `
      <button class="chart-legend__item" data-legend="${esc(s.key)}" aria-pressed="${!hidden.has(s.key)}">
        <span class="chart-legend__swatch${s.dashed ? ' chart-legend__swatch--dashed' : ''}"
              style="background:${s.dashed ? 'transparent' : resolveColor(s.color)};color:${resolveColor(s.color)}"></span>
        ${esc(s.name)}
      </button>`);
    const bands = cfg.bands.map((b) => `
      <button class="chart-legend__item" data-legend="${esc(b.key)}" aria-pressed="${!hidden.has(b.key)}">
        <span class="chart-legend__swatch chart-legend__swatch--band" style="background:${resolveColor(b.color)}"></span>
        ${esc(b.name)}
      </button>`);
    return `<div class="chart-legend">${items.concat(bands).join('')}</div>`;
  }

  function wireLegend(container, cfg, hidden, render) {
    container.querySelectorAll('[data-legend]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.legend;
        // Never let the operator hide every series — an empty chart is a bug, not a view.
        const visibleCount = cfg.series.filter((s) => !hidden.has(s.key)).length;
        if (!hidden.has(key) && visibleCount <= 1 && cfg.series.some((s) => s.key === key)) return;
        if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
        render();
      });
    });
  }

  function wireHover(container, cfg, geo) {
    const svg = container.querySelector('svg');
    const hit = container.querySelector('[data-hit]');
    const crosshair = container.querySelector('[data-crosshair]');
    const tooltip = container.querySelector('[data-tooltip]');
    if (!hit) return;

    function pointerToIndex(clientX) {
      const rect = svg.getBoundingClientRect();
      const scale = geo.W / rect.width;
      const x = (clientX - rect.left) * scale;
      const n = (cfg.labels.length || geo.visible[0].values.length) - 1;
      const i = Math.round(((x - geo.pad.l) / geo.pw) * n);
      return Math.max(0, Math.min(n, i));
    }

    function show(clientX) {
      if (!geo.visible.length) return;
      const i = pointerToIndex(clientX);
      const x = geo.X(i);
      container.dataset.hover = 'true';
      crosshair.setAttribute('x1', x);
      crosshair.setAttribute('x2', x);

      geo.visible.forEach((s) => {
        const dot = container.querySelector(`[data-dot="${s.key}"]`);
        if (!dot) return;
        const v = s.values[i];
        if (v === undefined || v === null) { dot.style.opacity = '0'; return; }
        dot.style.opacity = '';
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', geo.Y(v));
      });

      const rows = geo.visible.map((s) => {
        const v = s.values[i];
        if (v === undefined || v === null) return '';
        return `<div class="chart-tooltip__row">
            <span class="chart-tooltip__swatch" style="background:${resolveColor(s.color)}"></span>
            <span class="chart-tooltip__name">${esc(s.name)}</span>
            <span class="chart-tooltip__value">${esc((cfg.tooltipFormat || cfg.yFormat)(v, s))}</span>
          </div>`;
      }).join('');

      tooltip.innerHTML =
        `<div class="chart-tooltip__time">${esc(cfg.labels[i] || `#${i}`)}</div>${rows}` +
        (cfg.tooltipExtra ? cfg.tooltipExtra(i) : '');
      tooltip.dataset.open = 'true';

      // Keep the tooltip inside the container.
      const rect = svg.getBoundingClientRect();
      const px = (x / geo.W) * rect.width;
      const tw = tooltip.offsetWidth;
      const clamped = Math.max(tw / 2 + 4, Math.min(rect.width - tw / 2 - 4, px));
      tooltip.style.left = `${clamped}px`;
      tooltip.style.top = `${(geo.pad.t / geo.H) * rect.height}px`;
    }

    function hide() {
      container.dataset.hover = 'false';
      tooltip.dataset.open = 'false';
    }

    hit.addEventListener('pointermove', (e) => show(e.clientX));
    hit.addEventListener('pointerdown', (e) => show(e.clientX));
    hit.addEventListener('pointerleave', hide);
    svg.addEventListener('pointerleave', hide);
  }

  /* ======================================================================
     Sparkline
     ====================================================================== */
  function sparkline(container, values, opts) {
    const o = Object.assign({ color: 'var(--accent-cyan)', area: true, height: 26, dot: true }, opts);

    function render() {
      const W = Math.max(40, container.clientWidth || 120);
      const H = o.height;
      const pad = 3;
      const [min, max] = extent([values]);
      const span = (max - min) || 1;
      const X = (i) => (i / Math.max(1, values.length - 1)) * (W - pad * 2) + pad;
      const Y = (v) => H - pad - ((v - min) / span) * (H - pad * 2);
      const pts = values.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
      const color = resolveColor(o.color);
      const last = values[values.length - 1];

      container.innerHTML = `
        <svg class="sparkline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
          ${o.area ? `<polygon class="sparkline__area" fill="${color}"
            points="${X(0)},${H} ${pts} ${X(values.length - 1)},${H}"/>` : ''}
          <polyline class="sparkline__line" stroke="${color}" points="${pts}"/>
          ${o.dot ? `<circle class="sparkline__dot" cx="${X(values.length - 1)}" cy="${Y(last)}" r="2.4" fill="${color}"/>` : ''}
        </svg>`;
    }

    register(container, render);
  }

  /* ======================================================================
     Donut breakdown
     ====================================================================== */
  function donut(container, segments, opts) {
    const o = Object.assign({ size: 180, thickness: 22, centerValue: '', centerLabel: '' }, opts);
    container.classList.add('chart');

    function render() {
      const S = o.size;
      const R = S / 2 - o.thickness / 2 - 2;
      const C = S / 2;
      const total = segments.reduce((a, s) => a + s.value, 0) || 1;
      let angle = -Math.PI / 2;

      const arcs = segments.map((s) => {
        const sweep = (s.value / total) * Math.PI * 2;
        const x1 = C + R * Math.cos(angle);
        const y1 = C + R * Math.sin(angle);
        angle += sweep;
        const x2 = C + R * Math.cos(angle);
        const y2 = C + R * Math.sin(angle);
        const large = sweep > Math.PI ? 1 : 0;
        return `<path class="donut__seg" d="M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}"
          stroke="${resolveColor(s.color)}" stroke-width="${o.thickness}" fill="none" stroke-linecap="butt">
          <title>${esc(s.name)}: ${esc(s.label || s.value)}</title></path>`;
      }).join('');

      container.innerHTML = `
        <svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="${esc(o.ariaLabel || 'Breakdown')}">
          <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${resolveColor('var(--bg-raised)')}" stroke-width="${o.thickness}"/>
          ${arcs}
          ${o.centerValue ? `<text class="donut__center-value" x="${C}" y="${C + 2}">${esc(o.centerValue)}</text>` : ''}
          ${o.centerLabel ? `<text class="donut__center-label" x="${C}" y="${C + 18}">${esc(o.centerLabel)}</text>` : ''}
        </svg>`;
    }

    register(container, render);
  }

  /* ======================================================================
     Radial gauge — SoC, confidence, health
     ====================================================================== */
  function gauge(container, value, opts) {
    const o = Object.assign({ size: 128, thickness: 9, max: 100, color: 'var(--accent-cyan)', label: '', sub: '' }, opts);
    container.classList.add('chart');

    function render() {
      const S = o.size;
      const R = S / 2 - o.thickness / 2 - 2;
      const C = S / 2;
      // 270° sweep starting bottom-left, the industrial instrument convention.
      const START = Math.PI * 0.75;
      const SWEEP = Math.PI * 1.5;
      const frac = Math.max(0, Math.min(1, value / o.max));

      const arc = (from, to) => {
        const x1 = C + R * Math.cos(from), y1 = C + R * Math.sin(from);
        const x2 = C + R * Math.cos(to), y2 = C + R * Math.sin(to);
        return `M ${x1} ${y1} A ${R} ${R} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
      };

      container.innerHTML = `
        <svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img"
             aria-label="${esc(o.label || 'Gauge')}: ${esc(o.display || value)}">
          <path class="gauge__track" d="${arc(START, START + SWEEP)}" stroke-width="${o.thickness}"/>
          <path class="gauge__value" d="${arc(START, START + SWEEP * Math.max(frac, 0.001))}"
                stroke="${resolveColor(o.color)}" stroke-width="${o.thickness}"/>
          <text class="gauge__label" x="${C}" y="${C + 4}" style="font-size:${S * 0.2}px">${esc(o.display !== undefined ? o.display : Math.round(value))}</text>
          ${o.sub ? `<text class="gauge__sub" x="${C}" y="${C + 22}">${esc(o.sub)}</text>` : ''}
        </svg>`;
    }

    register(container, render);
  }

  /* ======================================================================
     Grouped / stacked bars — used for analytics comparisons
     ====================================================================== */
  function bars(container, config) {
    const cfg = Object.assign({
      height: 260, labels: [], series: [], stacked: false, yTicks: 4,
      yFormat: (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)),
      legend: true,
    }, config);
    container.classList.add('chart');

    function render() {
      const W = Math.max(260, container.clientWidth || 600);
      const H = cfg.height;
      const pad = { t: 12, r: 12, b: 30, l: 48 };
      const pw = W - pad.l - pad.r;
      const ph = H - pad.t - pad.b;

      const totals = cfg.stacked
        ? cfg.labels.map((_, i) => cfg.series.reduce((a, s) => a + (s.values[i] || 0), 0))
        : cfg.series.flatMap((s) => s.values);
      const [, dmax] = extent([totals]);
      const ticks = niceTicks(0, dmax, cfg.yTicks);
      const yHi = ticks[ticks.length - 1];
      const Y = (v) => pad.t + ph - (v / (yHi || 1)) * ph;

      const groupW = pw / Math.max(1, cfg.labels.length);
      const barW = cfg.stacked ? groupW * 0.56 : (groupW * 0.72) / cfg.series.length;

      const parts = [];
      ticks.forEach((t) => {
        const y = Y(t);
        parts.push(`<line class="chart__grid-line" x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}"/>`);
        parts.push(`<text class="chart__tick chart__tick--y" x="${pad.l - 8}" y="${y + 3}">${esc(cfg.yFormat(t))}</text>`);
      });

      cfg.labels.forEach((lab, i) => {
        const gx = pad.l + groupW * i + groupW / 2;
        parts.push(`<text class="chart__tick chart__tick--x" x="${gx}" y="${H - 10}">${esc(lab)}</text>`);

        if (cfg.stacked) {
          let acc = 0;
          cfg.series.forEach((s) => {
            const v = s.values[i] || 0;
            const y0 = Y(acc), y1 = Y(acc + v);
            parts.push(`<rect class="chart__bar" x="${gx - barW / 2}" y="${y1}" width="${barW}"
              height="${Math.max(0, y0 - y1)}" fill="${resolveColor(s.color)}">
              <title>${esc(s.name)} · ${esc(lab)}: ${esc(cfg.yFormat(v))}</title></rect>`);
            acc += v;
          });
        } else {
          cfg.series.forEach((s, si) => {
            const v = s.values[i] || 0;
            const x = gx - (barW * cfg.series.length) / 2 + si * barW;
            parts.push(`<rect class="chart__bar" x="${x}" y="${Y(v)}" width="${Math.max(1, barW - 2)}"
              height="${Math.max(0, pad.t + ph - Y(v))}" fill="${resolveColor(s.color)}" rx="1">
              <title>${esc(s.name)} · ${esc(lab)}: ${esc(cfg.yFormat(v))}</title></rect>`);
          });
        }
      });

      parts.push(`<line class="chart__axis-line" x1="${pad.l}" y1="${pad.t + ph}" x2="${W - pad.r}" y2="${pad.t + ph}"/>`);

      container.innerHTML =
        `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
          aria-label="${esc(cfg.ariaLabel || 'Bar chart')}">${parts.join('')}</svg>` +
        (cfg.legend ? `<div class="chart-legend">${cfg.series.map((s) => `
          <span class="chart-legend__item" aria-pressed="true">
            <span class="chart-legend__swatch" style="background:${resolveColor(s.color)}"></span>${esc(s.name)}
          </span>`).join('')}</div>` : '');
    }

    register(container, render);
  }

  /* ======================================================================
     Heatmap — load intensity by hour × day
     ====================================================================== */
  function heatmap(container, config) {
    const cfg = Object.assign({
      rows: [], cols: [], values: [], color: 'var(--accent-cyan)', height: 190,
      format: (v) => v.toFixed(1),
    }, config);
    container.classList.add('chart');

    function render() {
      const W = Math.max(280, container.clientWidth || 600);
      const padL = 42, padT = 16, padB = 20;
      const cw = (W - padL - 6) / Math.max(1, cfg.cols.length);
      const chH = cfg.height - padT - padB;
      const rh = chH / Math.max(1, cfg.rows.length);
      const flat = cfg.values.flat();
      const [min, max] = extent([flat]);
      const span = (max - min) || 1;
      const base = resolveColor(cfg.color);

      const parts = [];
      cfg.rows.forEach((row, r) => {
        parts.push(`<text class="heat-label" x="${padL - 7}" y="${padT + r * rh + rh / 2 + 3}" text-anchor="end">${esc(row)}</text>`);
        cfg.cols.forEach((col, c) => {
          const v = cfg.values[r][c];
          const intensity = 0.08 + ((v - min) / span) * 0.92;
          parts.push(`<rect class="heat-cell" x="${padL + c * cw}" y="${padT + r * rh}"
            width="${Math.max(1, cw - 1.5)}" height="${Math.max(1, rh - 1.5)}" rx="1.5"
            fill="${base}" fill-opacity="${intensity.toFixed(3)}">
            <title>${esc(row)} ${esc(col)}: ${esc(cfg.format(v))}</title></rect>`);
        });
      });
      cfg.cols.forEach((col, c) => {
        if (c % Math.ceil(cfg.cols.length / 12) !== 0) return;
        parts.push(`<text class="heat-label" x="${padL + c * cw + cw / 2}" y="${cfg.height - 6}" text-anchor="middle">${esc(col)}</text>`);
      });

      container.innerHTML = `<svg viewBox="0 0 ${W} ${cfg.height}" width="${W}" height="${cfg.height}"
        role="img" aria-label="${esc(cfg.ariaLabel || 'Heatmap')}">${parts.join('')}</svg>`;
    }

    register(container, render);
  }

  /* ======================================================================
     Waterfall — the savings bridge (DOM-based so labels wrap cleanly)
     ====================================================================== */
  function waterfall(container, steps) {
    function render() {
      const max = Math.max.apply(null, steps.map((s) => Math.abs(s.value)));
      container.className = 'waterfall';
      container.innerHTML = steps.map((s) => {
        const h = Math.max(3, (Math.abs(s.value) / (max || 1)) * 180);
        return `
          <div class="waterfall__col">
            <div class="waterfall__value" style="color:${resolveColor(s.color)}">${esc(s.display)}</div>
            <div class="waterfall__bar" style="height:${h}px;background:${resolveColor(s.color)};opacity:${s.muted ? 0.45 : 1}"></div>
            <div class="waterfall__label">${esc(s.label)}</div>
          </div>`;
      }).join('');
    }
    register(container, render);
  }

  return { line, sparkline, donut, gauge, bars, heatmap, waterfall, resolveColor, niceTicks };
})();
