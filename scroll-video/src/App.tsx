import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, ArrowDown, ChevronUp, Info, X } from 'lucide-react';
import { useVideoScrub } from '@/useVideoScrub';

const DARK = '#1D3045';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260821_114821_a8ca298f-be2c-4613-a4dd-51b69e16bbde.mp4';

const NAV_LINKS = [
  'VECTRUS ENERGY',
  'VECTRUS UPSTREAM',
  'VECTRUS MARKETS',
  'VECTRUS SYSTEMS',
  'VECTRUS+',
];

const EASE = 'cubic-bezier(0.16,1,0.3,1)';

/* Children rise into place once their section is meaningfully visible. */
function Stagger({
  show,
  delay = 0,
  className,
  children,
}: {
  show: boolean;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    opacity: show ? 1 : 0,
    transform: show ? 'translateY(0)' : 'translateY(24px)',
    transition: `opacity 0.8s ${EASE}, transform 0.8s ${EASE}`,
    transitionDelay: `${delay}ms`,
  };
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

function Navbar({
  isLight,
  onOpenMenu,
}: {
  isLight: boolean;
  onOpenMenu: () => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 200);
    return () => clearTimeout(t);
  }, []);

  const color = isLight ? DARK : '#ffffff';
  const inverse = isLight ? '#ffffff' : DARK;

  const enter = (delay: number): CSSProperties => ({
    opacity: entered ? 1 : 0,
    transform: entered ? 'translateY(0)' : 'translateY(-12px)',
    transition: `opacity 0.6s ${EASE}, transform 0.6s ${EASE}`,
    transitionDelay: `${delay}ms`,
  });

  return (
    <nav
      className="absolute top-0 left-0 right-0 z-50 pointer-events-auto flex items-center justify-between px-6 sm:px-8 md:px-12 pt-8 sm:pt-12 pb-6 transition-colors duration-500"
      style={{ color }}
    >
      {/* Desktop links */}
      <div className="hidden lg:flex items-center gap-8 xl:gap-10">
        {NAV_LINKS.map((label, i) => (
          <a
            key={label}
            href="#"
            className="relative text-xs tracking-[0.15em] uppercase font-medium hover:opacity-70 transition-opacity"
            style={enter(i * 80 + 100)}
          >
            {label}
            {i === 0 && (
              <span
                className="absolute -bottom-3 left-0 w-full"
                style={{ height: 2, backgroundColor: color }}
              />
            )}
          </a>
        ))}
      </div>

      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenMenu}
        className="lg:hidden flex flex-col"
        style={{ gap: 5, ...enter(100) }}
      >
        <span style={{ width: 24, height: 2, backgroundColor: color }} />
        <span style={{ width: 24, height: 2, backgroundColor: color }} />
        <span style={{ width: 16, height: 2, backgroundColor: color }} />
      </button>

      {/* Right cluster */}
      <div className="hidden sm:flex items-center gap-6" style={enter(500)}>
        <div className="flex items-center gap-2">
          <span className="text-xs tracking-[0.2em] uppercase font-medium">NEWS</span>
          <span
            className="flex items-center justify-center rounded-full"
            style={{ width: 20, height: 20, backgroundColor: color }}
          >
            <Info size={10} style={{ color: inverse }} />
          </span>
        </div>

        <span className="hidden lg:inline text-xs tracking-[0.2em] uppercase font-medium">
          MENU
        </span>
        <button
          type="button"
          onClick={onOpenMenu}
          className="lg:hidden text-xs tracking-[0.2em] uppercase font-medium hover:opacity-70 transition-opacity"
        >
          MENU
        </button>
      </div>
    </nav>
  );
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div
      className={`fixed inset-0 z-[100] ${
        open ? 'opacity-100 visible' : 'opacity-0 invisible'
      }`}
      style={{
        backgroundColor: DARK,
        transition: 'opacity 500ms cubic-bezier(0.4,0,0.2,1), visibility 500ms cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <div
        className={`h-full flex flex-col ${open ? 'translate-y-0' : '-translate-y-8'}`}
        style={{ transition: 'transform 500ms cubic-bezier(0.4,0,0.2,1)' }}
      >
        <div className="flex justify-end px-6 sm:px-8 pt-8 sm:pt-12">
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="flex items-center justify-center rounded-full border border-white/30 hover:border-white transition-colors"
            style={{ width: 40, height: 40 }}
          >
            <X size={18} className="text-white" />
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          {NAV_LINKS.map((label, i) => (
            <a
              key={label}
              href="#"
              onClick={onClose}
              className={`px-8 sm:px-12 py-3 text-2xl sm:text-3xl font-light tracking-wide uppercase transition-colors ${
                i === 0 ? 'text-white' : 'text-white/60 hover:text-white'
              }`}
              style={{
                opacity: open ? 1 : 0,
                transform: open ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 0.5s ${EASE}, transform 0.5s ${EASE}`,
                transitionDelay: `${i * 60}ms`,
              }}
            >
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-6 px-8 sm:px-12 pb-10">
          <span className="text-xs tracking-[0.2em] uppercase text-white/60">NEWS</span>
          <span className="text-xs tracking-[0.2em] uppercase text-white/60">CONTACT</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { containerRef, videoRef, canvasRef, scrollProgress, canvasLive } =
    useVideoScrub(VIDEO_SRC);
  const [menuOpen, setMenuOpen] = useState(false);

  const p = scrollProgress;

  /* Sequential fades — a section is fully gone before the next begins. */
  const s1Opacity = p < 0.2 ? 1 : Math.max(0, 1 - (p - 0.2) / 0.08);
  const s2Opacity =
    p < 0.32 ? 0 : p < 0.4 ? (p - 0.32) / 0.08 : p < 0.55 ? 1 : Math.max(0, 1 - (p - 0.55) / 0.08);
  const s3Opacity = p < 0.67 ? 0 : p < 0.75 ? (p - 0.67) / 0.08 : 1;

  const sectionStyle = (opacity: number): CSSProperties => ({
    opacity,
    transition: 'opacity 0.1s ease-out',
  });

  return (
    <div ref={containerRef} className="relative h-[500vh]">
      <div className="sticky top-0 w-full h-screen overflow-hidden">
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
          preload="auto"
        />

        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          style={{ opacity: canvasLive ? 1 : 0 }}
        />

        <div className="absolute inset-0 pointer-events-none">
          <Navbar isLight={p <= 0.55} onOpenMenu={() => setMenuOpen(true)} />

          {/* ---------------- Section 1 ---------------- */}
          <section
            className="absolute inset-0 flex items-center px-6 sm:px-8 md:px-20 lg:px-32"
            style={sectionStyle(s1Opacity)}
          >
            <div>
              <Stagger show={s1Opacity > 0.3} delay={0}>
                <h1
                  className="font-light uppercase"
                  style={{
                    fontSize: 'clamp(2rem,5vw,5rem)',
                    lineHeight: 1.2,
                    color: DARK,
                  }}
                >
                  Advancing resources for a cleaner future
                </h1>
              </Stagger>
              <Stagger show={s1Opacity > 0.3} delay={150} className="mt-6">
                <p
                  className="text-sm tracking-[0.3em] uppercase"
                  style={{ color: `${DARK}90` }}
                >
                  Sustainable power with purpose
                </p>
              </Stagger>
            </div>

            <div className="absolute bottom-12 right-6 sm:right-8 md:right-12">
              <Stagger show={s1Opacity > 0.3} delay={300}>
                <button
                  type="button"
                  aria-label="Next"
                  className="pointer-events-auto flex items-center justify-center rounded-full hover:opacity-70 transition-opacity"
                  style={{ width: 48, height: 48, border: `1px solid ${DARK}80` }}
                >
                  <ArrowRight size={18} style={{ color: DARK }} />
                </button>
              </Stagger>
            </div>
          </section>

          {/* ---------------- Section 2 ---------------- */}
          <section
            className="absolute inset-0 flex items-center justify-center px-6 sm:px-8"
            style={sectionStyle(s2Opacity)}
          >
            <div className="max-w-[900px]">
              <Stagger show={s2Opacity > 0.3} delay={0}>
                <h2
                  className="font-extralight tracking-wide text-center uppercase"
                  style={{
                    fontSize: 'clamp(1.5rem,4.5vw,4.5rem)',
                    lineHeight: 1.3,
                    color: DARK,
                  }}
                >
                  We build lasting partnerships with vision{' '}
                  <span style={{ color: `${DARK}CC` }}>and precision</span>{' '}
                  <span style={{ color: `${DARK}80` }}>across every frontier</span>
                </h2>
              </Stagger>
            </div>

            <div className="absolute bottom-16 right-6 sm:right-8 md:right-12 flex flex-col items-center gap-4">
              <Stagger show={s2Opacity > 0.3} delay={200}>
                <button
                  type="button"
                  aria-label="Scroll down"
                  className="pointer-events-auto flex items-center justify-center rounded-full hover:opacity-70 transition-opacity"
                  style={{ width: 48, height: 48, border: `1px solid ${DARK}66` }}
                >
                  <ArrowDown size={18} style={{ color: DARK }} />
                </button>
              </Stagger>

              <Stagger show={s2Opacity > 0.3} delay={350} className="mt-4">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full"
                    style={{ width: 8, height: 8, backgroundColor: DARK }}
                  />
                  <span
                    className="rounded-full"
                    style={{ width: 6, height: 6, backgroundColor: `${DARK}66` }}
                  />
                  <span
                    className="rounded-full"
                    style={{ width: 6, height: 6, backgroundColor: `${DARK}66` }}
                  />
                </div>
              </Stagger>

              <Stagger show={s2Opacity > 0.3} delay={500} className="mt-2">
                <button
                  type="button"
                  aria-label="Back to top"
                  className="pointer-events-auto flex items-center justify-center rounded-full hover:opacity-70 transition-opacity"
                  style={{ width: 40, height: 40, border: `1px solid ${DARK}4D` }}
                >
                  <ChevronUp size={16} style={{ color: `${DARK}CC` }} />
                </button>
              </Stagger>
            </div>
          </section>

          {/* ---------------- Section 3 ---------------- */}
          <section
            className="absolute inset-0 flex items-center justify-end px-6 sm:px-8 md:px-20 lg:px-32"
            style={sectionStyle(s3Opacity)}
          >
            <div className="max-w-2xl text-left">
              <Stagger show={s3Opacity > 0.3} delay={0}>
                <p className="text-white/60 text-lg tracking-wide mb-4">Halder | Nordvik</p>
              </Stagger>

              <Stagger show={s3Opacity > 0.3} delay={150}>
                <h2
                  className="font-light text-white uppercase tracking-wide mb-8"
                  style={{ fontSize: 'clamp(2rem,4vw,4rem)', lineHeight: 1.2 }}
                >
                  Fueling ambition,
                  <br />
                  shaping tomorrow.
                </h2>
              </Stagger>

              <Stagger show={s3Opacity > 0.3} delay={300}>
                <div className="flex items-center gap-4">
                  <span className="text-sm tracking-[0.3em] text-white/80 uppercase">
                    Contact Nordvik
                  </span>
                  <button
                    type="button"
                    aria-label="Contact Nordvik"
                    className="pointer-events-auto flex items-center justify-center rounded-full bg-white hover:scale-110 transition-transform duration-300"
                    style={{ width: 40, height: 40 }}
                  >
                    <ArrowRight size={16} className="text-gray-800" />
                  </button>
                </div>
              </Stagger>
            </div>
          </section>
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
