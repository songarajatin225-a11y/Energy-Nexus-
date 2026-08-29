import { useEffect, useRef, useState } from 'react';
import { createFile, DataStream, type MP4Info, type MP4Sample } from 'mp4box';

/* Tuning constants — see the scrub loop and frame bank below. */
const LERP_TAU = 8;        // exponential smoothing rate toward the scroll target
const SNAP = 0.002;        // seconds; close enough to stop lerping
const LRU_MAX = 24;        // decoded ImageBitmaps held in memory
const LEAD = 24;           // frames the decoder may run ahead of blob encoding
const WATCHDOG = 60000;    // ms before giving up on WebCodecs

type BankEntry = { ts: number; blob: Blob };

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Drives a video's playhead from scroll position.
 *
 * Two strategies, in order of preference:
 *  1. Frame bank — decode every frame with WebCodecs into WebP blobs, then paint
 *     the nearest one to a canvas. Scrubbing is exact and smooth.
 *  2. Fallback — set video.currentTime directly. Correct, but seeks are coarse.
 *
 * The video element renders underneath the whole time, so the fallback is always
 * live and the canvas simply fades in over it once the bank is ready.
 */
export function useVideoScrub(videoSrc: string) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [scrollProgress, setScrollProgress] = useState(0);
  const [canvasLive, setCanvasLive] = useState(false);

  /* Mutable scrub state — kept off React so the rAF loop never re-renders. */
  const bank = useRef<BankEntry[]>([]);
  const lru = useRef<Map<number, ImageBitmap | null>>(new Map());
  const currentTime = useRef(0);
  const targetTime = useRef(0);
  const ready = useRef(false);
  const reverted = useRef(false);
  const painted = useRef(false);
  const building = useRef(false);
  const dur = useRef(0);
  const span = useRef(1);

  /* ---------------------------------------------------------------- scroll */
  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      span.current = el ? Math.max(1, el.offsetHeight - window.innerHeight) : 1;
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  /* ------------------------------------------------------------- rAF loop */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const getProgress = () =>
      Math.min(1, Math.max(0, window.scrollY / span.current));

    /** Binary search the bank for the frame nearest a time in seconds. */
    const nearestIndex = (t: number) => {
      const b = bank.current;
      if (!b.length) return -1;
      const micros = t * 1e6;
      let lo = 0;
      let hi = b.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (b[mid].ts < micros) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0 && Math.abs(b[lo - 1].ts - micros) < Math.abs(b[lo].ts - micros)) {
        return lo - 1;
      }
      return lo;
    };

    /** Keep bitmaps decoded around the playhead; evict the oldest beyond the cap. */
    const warmLRU = (i: number) => {
      const b = bank.current;
      for (let j = i - 1; j <= i + 2; j++) {
        if (j < 0 || j >= b.length || lru.current.has(j)) continue;
        lru.current.set(j, null); // placeholder stops duplicate decodes
        createImageBitmap(b[j].blob)
          .then((bmp) => lru.current.set(j, bmp))
          .catch(() => lru.current.delete(j));
      }
      while (lru.current.size > LRU_MAX) {
        const oldest = lru.current.keys().next().value as number | undefined;
        if (oldest === undefined) break;
        const bmp = lru.current.get(oldest);
        if (bmp) bmp.close();
        lru.current.delete(oldest);
      }
    };

    const drawNearest = (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const i = nearestIndex(t);
      if (i < 0) return;
      warmLRU(i);
      const bmp = lru.current.get(i);
      if (!bmp) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      if (!painted.current) {
        painted.current = true;
        setCanvasLive(true);
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const p = getProgress();
      setScrollProgress(p);

      if (dur.current > 0) {
        targetTime.current = p * dur.current;

        if (prefersReducedMotion()) {
          currentTime.current = targetTime.current;
        } else {
          currentTime.current +=
            (targetTime.current - currentTime.current) * (1 - Math.exp(-dt * LERP_TAU));
          if (Math.abs(targetTime.current - currentTime.current) < SNAP) {
            currentTime.current = targetTime.current;
          }
        }

        if (ready.current && !reverted.current) {
          drawNearest(currentTime.current);
        } else {
          const v = videoRef.current;
          if (v && !v.seeking && Math.abs(v.currentTime - currentTime.current) > 0.01) {
            v.currentTime = currentTime.current;
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---------------------------------------------------------- frame bank */
  useEffect(() => {
    const onMeta = () => {
      const el = videoRef.current;
      if (el && Number.isFinite(el.duration)) dur.current = el.duration;
    };
    const videoEl = videoRef.current;
    videoEl?.addEventListener('loadedmetadata', onMeta);

    let watchdog = 0;
    const revert = () => {
      reverted.current = true;
      ready.current = false;
      setCanvasLive(false);
    };

    /** Codec-specific config box (avcC / hvcC / vpcC / av1C) as a Uint8Array. */
    const description = (file: ReturnType<typeof createFile>, trackId: number) => {
      const trak = file.getTrackById(trackId);
      for (const entry of trak.mdia.minf.stbl.stsd.entries) {
        const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
        if (!box) continue;
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        box.write(stream);
        return new Uint8Array(stream.buffer, 8); // drop the box header
      }
      return undefined;
    };

    const build = async () => {
      if (building.current) return;
      building.current = true;

      const scratch = document.createElement('canvas');
      const sctx = scratch.getContext('2d');
      let inFlight = 0;

      const encode = (frame: VideoFrame) =>
        new Promise<void>((resolve) => {
          if (!sctx) {
            frame.close();
            resolve();
            return;
          }
          scratch.width = frame.displayWidth;
          scratch.height = frame.displayHeight;
          sctx.drawImage(frame, 0, 0);
          const ts = frame.timestamp;
          frame.close();
          scratch.toBlob(
            (blob) => {
              if (blob) bank.current.push({ ts, blob });
              inFlight--;
              resolve();
            },
            'image/webp',
            0.82,
          );
        });

      const start = (hardwareAcceleration?: 'prefer-software') =>
        fetch(videoSrc)
          .then((res) => res.arrayBuffer())
          .then(
            (buffer) =>
              new Promise<void>((resolve, reject) => {
                const file = createFile();
                let decoder: VideoDecoder | null = null;

                file.onError = (e) => reject(new Error(e));

                file.onReady = (info: MP4Info) => {
                  const track = info.videoTracks[0];
                  if (!track) {
                    reject(new Error('no video track'));
                    return;
                  }

                  decoder = new VideoDecoder({
                    output: (frame) => {
                      inFlight++;
                      void encode(frame);
                    },
                    error: (e) => reject(e),
                  });

                  decoder.configure({
                    codec: track.codec,
                    codedWidth: track.video.width,
                    codedHeight: track.video.height,
                    description: description(file, track.id),
                    ...(hardwareAcceleration ? { hardwareAcceleration } : {}),
                  });

                  file.setExtractionOptions(track.id, null, { nbSamples: track.nb_samples });
                  file.start();
                };

                file.onSamples = async (_id, _user, samples: MP4Sample[]) => {
                  try {
                    for (const s of samples) {
                      // Throttle so decoding never outruns WebP encoding.
                      while (inFlight > LEAD || (decoder?.decodeQueueSize ?? 0) > LEAD) {
                        await new Promise((r) => setTimeout(r, 8));
                      }
                      decoder?.decode(
                        new EncodedVideoChunk({
                          type: s.is_sync ? 'key' : 'delta',
                          timestamp: (s.cts * 1e6) / s.timescale,
                          duration: (s.duration * 1e6) / s.timescale,
                          data: s.data,
                        }),
                      );
                    }
                    await decoder?.flush();
                    while (inFlight > 0) await new Promise((r) => setTimeout(r, 16));
                    decoder?.close();
                    resolve();
                  } catch (e) {
                    reject(e);
                  }
                };

                const tagged = buffer as ArrayBuffer & { fileStart: number };
                tagged.fileStart = 0;
                file.appendBuffer(tagged);
                file.flush();
              }),
          );

      try {
        bank.current = [];
        await start();
      } catch {
        try {
          // A hardware decoder can reject this stream; software usually takes it.
          bank.current = [];
          inFlight = 0;
          await start('prefer-software');
        } catch {
          revert();
          return;
        }
      }

      if (reverted.current || !bank.current.length) return;
      bank.current.sort((a, b) => a.ts - b.ts);
      ready.current = true;
      window.clearTimeout(watchdog);
    };

    const kick = () => {
      if (prefersReducedMotion()) return;
      if (typeof VideoDecoder === 'undefined') return;
      watchdog = window.setTimeout(revert, WATCHDOG);
      void build();
    };

    if (document.readyState === 'complete') kick();
    else window.addEventListener('load', kick, { once: true });

    const cache = lru.current;
    return () => {
      window.clearTimeout(watchdog);
      window.removeEventListener('load', kick);
      videoEl?.removeEventListener('loadedmetadata', onMeta);
      cache.forEach((bmp) => bmp?.close());
      cache.clear();
    };
  }, [videoSrc]);

  return { containerRef, videoRef, canvasRef, scrollProgress, canvasLive };
}
