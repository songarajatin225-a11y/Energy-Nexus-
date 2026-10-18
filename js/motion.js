/**
 * Energy Nexus — landing motion system.
 *
 * Scroll-driven choreography for the public page. Everything here is additive
 * and decorative: the progress rail and section index are injected at runtime,
 * reveal variants are assigned by selector, and no markup or copy is edited.
 *
 * Only opacity, transform and clip-path are animated, so nothing triggers
 * layout. The whole module no-ops under a reduced-motion preference.
 */
window.ENX = window.ENX || {};

ENX.motion = (function () {
  /* Which treatment each part of the page gets, in document order. */
  const VARIANTS = [
    ['.ln-head .ln-eyebrow', 'rise-sm', 0],
    ['.ln-head h2', 'mask', 90],
    ['.ln-head .ln-lede', 'rise-sm', 190],
    ['.ln-panel', 'panel', 60],
    ['.ln-note', 'rise-sm', 0],
    ['.ln-close__copy .ln-eyebrow', 'rise-sm', 0],
    ['.ln-close h2', 'mask', 90],
    ['.ln-close .ln-lede', 'rise-sm', 190],
    ['.ln-close__actions', 'rise', 280],
    ['.ln-footer__brand', 'rise-sm', 0],
    ['.ln-footer__col', 'rise-sm', 90],
  ];

  /* Groups whose children arrive one after another. */
  const STAGGERS = [
    ['.ln-list', '.ln-list__item', 'rise-sm', 70],
    ['.ln-strip', '.ln-strip__cell', 'wipe', 80],
    ['.ln-rail', '.ln-rail__step', 'rise-sm', 55],
    ['.ln-timeline', '.ln-timeline__step', 'rise-sm', 60],
    ['.ln-defs', '.ln-def', 'rise-sm', 70],
    ['.ln-stats__grid', '.ln-stat', 'rise-sm', 90],
  ];

  function reduced() {
    return (window.ENX.state && ENX.state.get('motion') === 'off')
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  let observer = null;

  function observe(el) {
    if (!observer || el.dataset.in === 'true') return;
    observer.observe(el);
  }

  function tag(el, variant, delay) {
    if (!el) return;
    if (!el.dataset.anim) {
      el.dataset.anim = variant;
      if (delay) el.style.setProperty('--anim-delay', `${delay}ms`);
    }
    observe(el);
  }

  /**
   * Safety net. A fast programmatic scroll can carry an element through the
   * viewport between two observer deliveries, which would strand it at opacity
   * zero forever. Anything already on screen is simply marked arrived.
   */
  function sweep() {
    const h = window.innerHeight;
    document.querySelectorAll('[data-anim]:not([data-in]), .ln-reveal:not([data-visible])')
      .forEach((el) => {
        const box = el.getBoundingClientRect();
        if (box.bottom < 0 || box.top > h) return;
        el.dataset.in = 'true';
        if (el.classList.contains('ln-reveal')) el.dataset.visible = 'true';
        if (el.classList.contains('ln-stat')) countUpStats();
      });
  }

  /** Assign variants. Safe to call again after async renders. */
  function scan() {
    VARIANTS.forEach(([sel, variant, delay]) => {
      document.querySelectorAll(sel).forEach((el) => tag(el, variant, delay));
    });

    STAGGERS.forEach(([groupSel, childSel, variant, step]) => {
      document.querySelectorAll(groupSel).forEach((group) => {
        Array.from(group.querySelectorAll(childSel)).forEach((child, i) => {
          tag(child, variant, i * step);
        });
      });
    });

    // The rail line and timeline markers animate off the same in-view flag.
    document.querySelectorAll('.ln-rail__step, .ln-timeline__step').forEach(observe);

    // Section wrappers carry their own reveal in landing.css; this module owns
    // their flag now, so they must be observed too or their contents stay at
    // opacity 0 forever.
    document.querySelectorAll('.ln-reveal').forEach((el) => {
      if (el.dataset.visible !== 'true') observe(el);
    });
  }

  /* ---------------------------------------------------------- counters */
  /** Count the leading number of a statistic up, keeping its units intact. */
  function countUpStats() {
    document.querySelectorAll('.ln-stat__value').forEach((el) => {
      if (el.dataset.counted) return;
      const text = el.textContent.trim();
      const match = text.match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/s);
      if (!match) return;

      const [, prefix, rawNumber, suffix] = match;
      const target = parseFloat(rawNumber.replace(/,/g, ''));
      if (!Number.isFinite(target)) return;

      el.dataset.counted = 'true';
      const decimals = (rawNumber.split('.')[1] || '').length;
      const format = (v) =>
        `${prefix}${v.toLocaleString('en-IN', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}${suffix}`;

      if (reduced()) { el.textContent = text; return; }

      const started = performance.now();
      const run = (now) => {
        const t = Math.min(1, (now - started) / 1100);
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        el.textContent = format(target * eased);
        if (t < 1) requestAnimationFrame(run);
        else el.textContent = text; // land on the authored string exactly
      };
      requestAnimationFrame(run);
    });
  }

  /* ------------------------------------------------- progress + index */
  function buildChrome() {
    const sections = Array.from(document.querySelectorAll('main > section[id], main > header'));

    const progress = document.createElement('div');
    progress.className = 'ln-progress';
    progress.setAttribute('aria-hidden', 'true');
    progress.innerHTML = '<div class="ln-progress__fill"></div>';
    document.body.appendChild(progress);
    const fill = progress.firstElementChild;

    const dots = document.createElement('div');
    dots.className = 'ln-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = sections.map(() => '<span></span>').join('');
    document.body.appendChild(dots);
    const ticks = Array.from(dots.children);

    let queued = false;
    const paint = () => {
      queued = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      fill.style.transform = `scaleX(${p})`;

      // Past the hero, the index becomes useful; over it, it is clutter.
      dots.dataset.visible = String(window.scrollY > window.innerHeight * 0.9);

      const mid = window.scrollY + window.innerHeight / 2;
      let active = 0;
      sections.forEach((s, i) => {
        if (s.offsetTop <= mid) active = i;
      });
      ticks.forEach((t, i) => { t.dataset.on = String(i === active); });
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    paint();
  }

  /* ------------------------------------------------------------ parallax */
  function buildParallax() {
    const layers = [
      ['.ln-scene__figure', 0.06],
      ['.ln-panel', 0.04],
    ].flatMap(([sel, rate]) =>
      Array.from(document.querySelectorAll(sel)).map((el) => ({ el, rate })));

    if (!layers.length) return;

    let queued = false;
    const paint = () => {
      queued = false;
      const centre = window.innerHeight / 2;
      layers.forEach(({ el, rate }) => {
        const box = el.getBoundingClientRect();
        if (box.bottom < -200 || box.top > window.innerHeight + 200) return;
        const offset = (box.top + box.height / 2 - centre) * rate;
        el.style.transform = `translate3d(0, ${(-offset).toFixed(2)}px, 0)`;
      });
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    paint();
  }

  /* ------------------------------------------------------------ magnetic */
  /** A few pixels of pull on the primary actions. Fine pointers only. */
  function buildMagnetic() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    document.querySelectorAll('.ln-btn--primary, .ln-link-cta').forEach((el) => {
      el.dataset.magnetic = 'true';
      const strength = 0.28;
      const limit = 7;

      el.addEventListener('pointermove', (e) => {
        const b = el.getBoundingClientRect();
        const dx = (e.clientX - (b.left + b.width / 2)) * strength;
        const dy = (e.clientY - (b.top + b.height / 2)) * strength;
        el.dataset.pulling = 'true';
        el.style.transform = `translate(${Math.max(-limit, Math.min(limit, dx)).toFixed(1)}px, ${Math.max(-limit, Math.min(limit, dy)).toFixed(1)}px)`;
      });

      el.addEventListener('pointerleave', () => {
        el.dataset.pulling = 'false';
        el.style.transform = '';
      });
    });
  }

  /* ---------------------------------------------------------------- init */
  function init() {
    if (reduced()) {
      // Mark everything arrived so nothing is left invisible.
      document.querySelectorAll('[data-anim]').forEach((el) => { el.dataset.in = 'true'; });
      document.querySelectorAll('.ln-reveal').forEach((el) => { el.dataset.visible = 'true'; });
      return;
    }

    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.dataset.in = 'true';
        if (entry.target.classList.contains('ln-reveal')) {
          entry.target.dataset.visible = 'true';
        }
        observer.unobserve(entry.target);
        if (entry.target.classList.contains('ln-stat')) countUpStats();
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

    scan();
    buildChrome();

    let sweepQueued = false;
    window.addEventListener('scroll', () => {
      if (sweepQueued) return;
      sweepQueued = true;
      requestAnimationFrame(() => { sweepQueued = false; sweep(); });
    }, { passive: true });

    buildParallax();
    buildMagnetic();

    // Hero stages and data-driven lists render after fetches resolve.
    document.addEventListener('enx:tick', scan, { once: true });
    window.setTimeout(() => { scan(); sweep(); }, 400);
    window.setTimeout(() => { scan(); sweep(); countUpStats(); }, 1200);
  }

  return { init, scan, sweep, countUpStats };
})();
