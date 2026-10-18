/**
 * Energy Nexus — cinematic scroll-tied hero.
 *
 * The hero occupies a tall scroll track with a sticky full-viewport scene.
 * Scroll position drives the video playhead; the clip is never played as a
 * timeline. The approved hero copy is split across three stages that fade
 * sequentially — each is fully gone before the next appears.
 *
 * Scrubbing uses exponential smoothing plus direct seeking. The WebCodecs
 * frame bank used by scroll-video/ is deliberately absent here: it needs
 * mp4box, and this site ships no runtime dependencies. Seeking is coarser but
 * costs nothing and cannot fail.
 */
window.ENX = window.ENX || {};

ENX.heroScroll = (function () {
  /* Swap this for an Energy Nexus clip; nothing else needs to change. */
  const VIDEO_SRC =
    'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260821_114821_a8ca298f-be2c-4613-a4dd-51b69e16bbde.mp4';

  const LERP_TAU = 8;    // smoothing rate toward the scroll target
  const SNAP = 0.002;    // seconds; close enough to stop lerping
  const DARK_AT = 0.62;  // progress where the footage turns dark

  /** Sequential stage opacities — previous fully out before the next arrives. */
  function stageOpacity(stage, p) {
    if (stage === 1) return p < 0.24 ? 1 : Math.max(0, 1 - (p - 0.24) / 0.1);
    if (stage === 2) {
      if (p < 0.36) return 0;
      if (p < 0.46) return (p - 0.36) / 0.1;
      if (p < 0.62) return 1;
      return Math.max(0, 1 - (p - 0.62) / 0.1);
    }
    if (p < 0.72) return 0;
    if (p < 0.82) return (p - 0.72) / 0.1;
    return 1;
  }

  function reducedMotion() {
    return ENX.state.get('motion') === 'off'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function init() {
    const scene = document.querySelector('[data-ln-scene]');
    if (!scene) return;

    const video = scene.querySelector('[data-ln-video]');
    const stages = Array.from(scene.querySelectorAll('[data-ln-stage]'));
    const root = document.documentElement;

    let span = 1;
    let duration = 0;
    let current = 0;
    let last = performance.now();

    const measure = () => {
      span = Math.max(1, scene.offsetHeight - window.innerHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    /* The video is remote. If it cannot load, the scene still has to read:
       fall back to the page's own ink ground and hold white type throughout. */
    const fail = () => {
      scene.dataset.video = 'unavailable';
      root.dataset.heroPhase = 'dark';
    };
    video.addEventListener('error', fail);
    video.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(video.duration)) duration = video.duration;
      scene.dataset.video = 'ready';
    });
    video.src = VIDEO_SRC;
    video.load();

    // Nothing has decoded after 12s — treat it as unavailable rather than
    // leaving the visitor on a blank rectangle.
    setTimeout(() => { if (!duration) fail(); }, 12000);

    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const p = Math.min(1, Math.max(0, window.scrollY / span));

      stages.forEach((el) => {
        const o = stageOpacity(Number(el.dataset.lnStage), p);
        el.style.opacity = String(o);
        el.dataset.visible = o > 0.3 ? 'true' : 'false';
      });

      if (scene.dataset.video !== 'unavailable') {
        root.dataset.heroPhase = p > DARK_AT ? 'dark' : 'light';
      }

      if (duration > 0) {
        const target = p * duration;
        if (reducedMotion()) {
          current = target;
        } else {
          current += (target - current) * (1 - Math.exp(-dt * LERP_TAU));
          if (Math.abs(target - current) < SNAP) current = target;
        }
        if (!video.seeking && Math.abs(video.currentTime - current) > 0.01) {
          video.currentTime = current;
        }
      }

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  return { init, VIDEO_SRC, stageOpacity };
})();
