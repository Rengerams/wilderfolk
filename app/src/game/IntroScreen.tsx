import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureIntroAudio, getMuteState, toggleMute } from '../audio';
import { GAME_PHASE, GAME_SUBTITLE, GAME_VERSION } from './version';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type IntroPhase = 'opening' | 'ready';

interface IntroScreenProps {
  onContinue: () => void;
}

type ParticleType = 'ember' | 'spark' | 'leaf' | 'dust';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  life: number;
  maxLife: number;
  type: ParticleType;
}

interface FoodChainItem {
  icon: string;
  label: string;
}

const FULL_SUBTITLE = GAME_SUBTITLE;
const HOOK_LINE = "Don't kill all the wolves.";
const HOOK_DETAIL = 'Build inside the food chain — or watch it collapse.';
const TYPEWRITER_MS = 98;
const FADE_MS = 3200;
const TITLE_LETTER_MS = 115;

/** ~20s unhurried intro — each beat gets room to breathe. */
const INTRO_TIMELINE_MS = {
  aurora: 900,
  logo: 3800,
  title: 5200,
  subtitle: 9800,
  hook: 14200,
  hookDetail: 15900,
  chain: 17600,
  ready: 19800,
} as const;

const INTRO_DURATION_MS = INTRO_TIMELINE_MS.ready;

const FOOD_CHAIN: FoodChainItem[] = [
  { icon: '🌿', label: 'Grass' },
  { icon: '🐰', label: 'Rabbits' },
  { icon: '🦌', label: 'Deer' },
  { icon: '🐺', label: 'Wolves' },
  { icon: '👨', label: 'Humans' },
  { icon: '🏠', label: 'Village' },
];

const FLOAT_SPRITES = [
  { src: '/sprites/wolf.png', delay: '0s' },
  { src: '/sprites/house.png', delay: '1.2s' },
  { src: '/sprites/deer.png', delay: '2.4s' },
] as const;

const PARTICLE_COLORS: Record<ParticleType, string[]> = {
  ember: ['#ff6b35', '#f7931e', '#ffd700', '#ff4500'],
  spark: ['#ffffff', '#ffd700', '#87ceeb', '#fff8dc'],
  leaf: ['#22c55e', '#4ade80', '#86efac', '#16a34a'],
  dust: ['#a8a29e', '#d6d3d1', '#78716c', '#f5f5f4'],
};

// ---------------------------------------------------------------------------
// Particle helpers
// ---------------------------------------------------------------------------

function pickParticleType(): ParticleType {
  const types: ParticleType[] = ['ember', 'spark', 'leaf', 'dust'];
  return types[Math.floor(Math.random() * types.length)];
}

function spawnParticle(canvasW: number, canvasH: number): Particle {
  const type = pickParticleType();
  const palette = PARTICLE_COLORS[type];

  return {
    x: Math.random() * canvasW,
    y: canvasH + 10,
    vx: (Math.random() - 0.5) * 1.2,
    vy: -(0.35 + Math.random() * 1.6),
    size: type === 'spark' ? 0.5 + Math.random() * 1.5 : 1 + Math.random() * 3,
    alpha: 0.25 + Math.random() * 0.55,
    color: palette[Math.floor(Math.random() * palette.length)],
    life: 0,
    maxLife: 260 + Math.random() * 340,
    type,
  };
}

function drawParticle(ctx: CanvasRenderingContext2D, particle: Particle): void {
  const lifeRatio = particle.life / particle.maxLife;
  const fadeIn = lifeRatio < 0.12 ? lifeRatio / 0.12 : 1;
  const alpha = particle.alpha * (1 - lifeRatio) * fadeIn;

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);

  if (particle.type === 'spark') {
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  } else if (particle.type === 'ember') {
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (particle.type === 'leaf') {
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.ellipse(
      particle.x,
      particle.y,
      particle.size,
      particle.size * 0.6,
      particle.life * 0.04,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  } else {
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function updateParticle(particle: Particle): void {
  particle.x += particle.vx;
  particle.y += particle.vy;
  particle.life++;

  if (particle.type === 'leaf') {
    particle.vx += Math.sin(particle.life * 0.018) * 0.04;
  }
  if (particle.type === 'spark') {
    particle.x += (Math.random() - 0.5) * 1.2;
    particle.y += (Math.random() - 0.5) * 1.2;
  }
}

function isParticleAlive(particle: Particle, width: number, height: number): boolean {
  return (
    particle.life < particle.maxLife &&
    particle.y > -20 &&
    particle.y < height + 20 &&
    particle.x > -20 &&
    particle.x < width + 20
  );
}

function scheduleIntroBeat(ms: number, fn: () => void): ReturnType<typeof setTimeout> {
  return setTimeout(fn, ms);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IntroScreen({ onContinue }: IntroScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const startedAtRef = useRef(0);

  const [phase, setPhase] = useState<IntroPhase>('opening');
  const [auroraVisible, setAuroraVisible] = useState(false);
  const [logoVisible, setLogoVisible] = useState(false);
  const [titleVisible, setTitleVisible] = useState(false);
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [subtitleText, setSubtitleText] = useState('');
  const [hookVisible, setHookVisible] = useState(false);
  const [hookDetailVisible, setHookDetailVisible] = useState(false);
  const [chainVisible, setChainVisible] = useState(false);
  const [readyVisible, setReadyVisible] = useState(false);
  const [spritesSoft, setSpritesSoft] = useState(true);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(() => getMuteState());

  const tryStartIntroAudio = useCallback(() => {
    void ensureIntroAudio();
  }, []);

  const handleToggleMute = useCallback(() => {
    void ensureIntroAudio().then(() => {
      const nowMuted = toggleMute();
      setMuted(nowMuted);
      if (!nowMuted) void ensureIntroAudio();
    });
  }, []);

  const handleContinue = useCallback(() => {
    tryStartIntroAudio();
    onContinue();
  }, [tryStartIntroAudio, onContinue]);

  useEffect(() => {
    startedAtRef.current = Date.now();
    tryStartIntroAudio();
  }, [tryStartIntroAudio]);

  useEffect(() => {
    const unlockOnGesture = () => tryStartIntroAudio();
    window.addEventListener('pointerdown', unlockOnGesture);
    window.addEventListener('keydown', unlockOnGesture);
    return () => {
      window.removeEventListener('pointerdown', unlockOnGesture);
      window.removeEventListener('keydown', unlockOnGesture);
    };
  }, [tryStartIntroAudio]);

  // Unhurried reveal timeline.
  useEffect(() => {
    const timers = [
      scheduleIntroBeat(INTRO_TIMELINE_MS.aurora, () => setAuroraVisible(true)),
      scheduleIntroBeat(INTRO_TIMELINE_MS.logo, () => setLogoVisible(true)),
      scheduleIntroBeat(INTRO_TIMELINE_MS.title, () => setTitleVisible(true)),
      scheduleIntroBeat(INTRO_TIMELINE_MS.subtitle, () => setSubtitleVisible(true)),
      scheduleIntroBeat(INTRO_TIMELINE_MS.hook, () => {
        setSpritesSoft(false);
        setHookVisible(true);
      }),
      scheduleIntroBeat(INTRO_TIMELINE_MS.hookDetail, () => setHookDetailVisible(true)),
      scheduleIntroBeat(INTRO_TIMELINE_MS.chain, () => setChainVisible(true)),
      scheduleIntroBeat(INTRO_TIMELINE_MS.ready, () => {
        setPhase('ready');
        setReadyVisible(true);
      }),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Subtle progress along the bottom — shares startedAtRef with the reveal timeline.
  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startedAtRef.current;
      setProgress(Math.min(100, (elapsed / INTRO_DURATION_MS) * 100));
    };
    tick();
    const id = window.setInterval(tick, 120);
    return () => clearInterval(id);
  }, []);

  // Typewriter — starts only after subtitle beat.
  useEffect(() => {
    if (!subtitleVisible) return;

    let index = 0;
    const interval = setInterval(() => {
      index++;
      setSubtitleText(FULL_SUBTITLE.slice(0, index));
      if (index >= FULL_SUBTITLE.length) clearInterval(interval);
    }, TYPEWRITER_MS);

    return () => clearInterval(interval);
  }, [subtitleVisible]);

  // Ambient particles — calmer spawn rate.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 60; i++) {
      const particle = spawnParticle(width, height);
      particle.y = Math.random() * height;
      particle.life = Math.random() * particle.maxLife;
      particlesRef.current.push(particle);
    }

    const loop = () => {
      ctx.clearRect(0, 0, width, height);

      const spawnChance = auroraVisible ? 0.35 : 0.12;
      if (Math.random() < spawnChance) {
        particlesRef.current.push(spawnParticle(width, height));
      }

      const remaining: Particle[] = [];
      for (const particle of particlesRef.current) {
        updateParticle(particle);
        if (isParticleAlive(particle, width, height)) {
          drawParticle(ctx, particle);
          remaining.push(particle);
        }
      }
      particlesRef.current = remaining;

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [auroraVisible]);

  useEffect(() => {
    if (phase !== 'ready') return;

    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return;
      handleContinue();
    };

    const clickHandler = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('.intro-control')) return;
      handleContinue();
    };

    window.addEventListener('keydown', keyHandler);
    window.addEventListener('click', clickHandler);

    return () => {
      window.removeEventListener('keydown', keyHandler);
      window.removeEventListener('click', clickHandler);
    };
  }, [phase, handleContinue]);

  const subtitleTyping = subtitleVisible && subtitleText.length < FULL_SUBTITLE.length;
  const showSkipButton = logoVisible && phase !== 'ready';

  return (
    <div
      className="intro-root fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain"
      style={{ cursor: phase === 'ready' ? 'pointer' : 'default' }}
    >
      {/* Base + aurora wash */}
      <div
        className="absolute inset-0 bg-black transition-opacity ease-out"
        style={{
          opacity: auroraVisible ? 0 : 1,
          transitionDuration: `${FADE_MS}ms`,
        }}
      />
      <div
        className={`intro-aurora absolute inset-0 transition-opacity ease-out ${
          auroraVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDuration: `${FADE_MS}ms` }}
      />

      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0"
        style={{ width: '100%', height: '100%' }}
      />

      <div className="intro-grain pointer-events-none absolute inset-0" />

      <div
        className={`intro-control absolute left-6 top-6 z-20 flex items-center gap-2 transition-opacity ease-out sm:left-10 sm:top-8 ${
          logoVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ transitionDuration: `${FADE_MS}ms` }}
        aria-hidden={!logoVisible}
      >
        <span className="rounded-full bg-stone-900/75 px-3 py-1 text-[10px] font-bold tracking-widest uppercase text-amber-300 ring-1 ring-amber-600/35 backdrop-blur-sm">
          {GAME_PHASE}
        </span>
        <span className="rounded-full bg-stone-900/60 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-stone-400 ring-1 ring-stone-700/50 backdrop-blur-sm">
          v{GAME_VERSION}
        </span>
      </div>

      <div
        className={`intro-moon pointer-events-none absolute right-8 top-8 h-16 w-16 rounded-full sm:right-14 sm:top-12 sm:h-20 sm:w-20 ${
          logoVisible ? 'intro-moon-visible' : 'opacity-0'
        }`}
        style={{
          background: 'radial-gradient(circle at 35% 35%, #fef9c3 0%, #fde047 35%, #a78bfa 100%)',
        }}
      />

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-16 z-[1] flex justify-center gap-10 sm:bottom-20 sm:gap-16 ${
          spritesSoft ? 'intro-sprites-visible' : 'intro-sprites-fade'
        }`}
      >
        {FLOAT_SPRITES.map((sprite) => (
          <img
            key={sprite.src}
            src={sprite.src}
            alt=""
            className="intro-float-sprite h-12 w-12 object-contain opacity-50 drop-shadow-lg sm:h-16 sm:w-16"
            style={{ animationDelay: sprite.delay, imageRendering: 'pixelated' }}
          />
        ))}
      </div>

      <div
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 22%, rgba(0,0,0,0.78) 100%)',
        }}
      />

      <div className="relative z-10 my-auto flex w-full max-w-4xl flex-col items-center px-4 py-12 text-center sm:py-16">
        {/* Logo — emerges first, alone */}
        <div
          className={`mb-5 flex justify-center transition-all ease-out ${
            logoVisible ? 'intro-logo-visible opacity-100' : 'translate-y-6 opacity-0'
          }`}
          style={{ transitionDuration: `${FADE_MS}ms` }}
          aria-hidden={!logoVisible}
        >
          <img
            src="/logo.png"
            alt="Wilderfolk"
            className="h-28 w-28 rounded-full object-contain sm:h-40 sm:w-40"
            style={{
              filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.55))',
              boxShadow: logoVisible
                ? '0 0 48px rgba(34,197,94,0.25), 0 0 96px rgba(34,197,94,0.08)'
                : 'none',
            }}
          />
        </div>

        {/* Title */}
        <div
          className="overflow-hidden transition-all ease-out"
          style={{
            maxHeight: titleVisible ? '12rem' : '0',
            opacity: titleVisible ? 1 : 0,
            marginBottom: titleVisible ? '0.25rem' : 0,
            transitionDuration: `${FADE_MS * 0.85}ms`,
          }}
          aria-hidden={!titleVisible}
        >
          <h1
            className="intro-title mb-3 text-6xl font-black tracking-tight text-white sm:text-8xl"
            style={{
              textShadow:
                '0 0 40px rgba(34,197,94,0.35), 0 0 80px rgba(34,197,94,0.15), 0 4px 8px rgba(0,0,0,0.85)',
            }}
          >
            {'Wilderfolk'.split('').map((char, index) => (
              <span
                key={index}
                className="inline-block"
                style={{
                  opacity: titleVisible ? 1 : 0,
                  transform: titleVisible ? 'translateY(0)' : 'translateY(28px)',
                  transitionProperty: 'opacity, transform',
                  transitionDuration: '900ms',
                  transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                  transitionDelay: titleVisible ? `${index * TITLE_LETTER_MS + 200}ms` : '0ms',
                }}
              >
                {char}
              </span>
            ))}
          </h1>

          <div className="mx-auto mb-2 h-0.5 overflow-hidden rounded-full" style={{ width: 'min(220px, 70vw)' }}>
            <div
              className="h-full rounded-full ease-out"
              style={{
                width: titleVisible ? '100%' : '0%',
                transitionDuration: '3200ms',
                transitionDelay: titleVisible ? '600ms' : '0ms',
                background: 'linear-gradient(90deg, transparent, #22c55e, #d97706, #22c55e, transparent)',
              }}
            />
          </div>
        </div>

        {/* Subtitle */}
        <div
          className="overflow-hidden transition-all ease-out"
          style={{
            maxHeight: subtitleVisible ? '5rem' : '0',
            opacity: subtitleVisible ? 1 : 0,
            marginTop: subtitleVisible ? '1.5rem' : 0,
            marginBottom: subtitleVisible ? '2rem' : 0,
            transform: subtitleVisible ? 'translateY(0)' : 'translateY(12px)',
            transitionDuration: '1400ms',
          }}
          aria-hidden={!subtitleVisible}
        >
          <p
            className="text-lg font-light tracking-[0.28em] uppercase text-stone-300 sm:text-2xl"
            style={{ textShadow: '0 2px 6px rgba(0,0,0,0.85)', minHeight: '2.25rem' }}
          >
            {subtitleText}
            {subtitleTyping && (
              <span className="animate-blink ml-1 inline-block h-5 w-0.5 bg-emerald-400/90" />
            )}
          </p>
        </div>

        {/* Hook */}
        <div
          className="overflow-hidden transition-all ease-out"
          style={{
            maxHeight: hookVisible ? '8rem' : '0',
            opacity: hookVisible ? 1 : 0,
            marginBottom: hookVisible ? '1.25rem' : 0,
            transitionDuration: '1600ms',
          }}
          aria-hidden={!hookVisible}
        >
          <p
            className="intro-hook text-base font-semibold uppercase tracking-[0.14em] text-amber-200 sm:text-xl"
            style={{ textShadow: '0 0 28px rgba(251,191,36,0.3)' }}
          >
            {HOOK_LINE}
          </p>
          <p
            className={`intro-subline mx-auto mt-3 max-w-md text-sm font-light leading-relaxed text-stone-400 sm:text-base ${
              hookDetailVisible ? 'intro-subline-visible' : 'opacity-0'
            }`}
          >
            {HOOK_DETAIL}
          </p>
        </div>

        {/* Food chain */}
        <div
          className="flex max-w-full flex-wrap items-center justify-center gap-1 overflow-hidden transition-all ease-out sm:gap-2"
          style={{
            maxHeight: chainVisible ? '6rem' : '0',
            opacity: chainVisible ? 1 : 0,
            marginBottom: chainVisible ? '2rem' : 0,
            transform: chainVisible ? 'translateY(0)' : 'translateY(16px)',
            transitionDuration: '1800ms',
          }}
          aria-hidden={!chainVisible}
        >
          {FOOD_CHAIN.map((item, index) => (
            <div key={item.label} className="flex items-center gap-1 sm:gap-2">
              <div
                className={`intro-chain-item flex flex-col items-center rounded-lg border border-stone-700/45 bg-stone-900/45 px-2 py-1.5 backdrop-blur-sm sm:px-3 ${
                  chainVisible ? 'intro-chain-visible' : ''
                }`}
                style={{ animationDelay: chainVisible ? `${index * 220}ms` : '0ms' }}
              >
                <span className="text-lg sm:text-xl">{item.icon}</span>
                <span className="text-[9px] uppercase tracking-wider text-stone-500">
                  {item.label}
                </span>
              </div>
              {index < FOOD_CHAIN.length - 1 && (
                <span
                  className="text-stone-600 transition-opacity duration-700"
                  style={{
                    opacity: chainVisible ? 1 : 0,
                    transitionDelay: chainVisible ? `${index * 220 + 110}ms` : '0ms',
                  }}
                >
                  →
                </span>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div
          className="flex flex-col items-center gap-4 overflow-hidden pb-2 transition-all ease-out"
          style={{
            maxHeight: readyVisible ? '14rem' : '0',
            opacity: readyVisible ? 1 : 0,
            transform: readyVisible ? 'translateY(0)' : 'translateY(20px)',
            transitionDuration: '1600ms',
          }}
          aria-hidden={!readyVisible}
        >
          <button
            type="button"
            onClick={handleContinue}
            className="intro-control intro-cta cursor-pointer rounded-full border border-emerald-500/40 bg-emerald-600/90 px-10 py-3.5 text-sm font-bold tracking-widest uppercase text-white backdrop-blur-sm transition-all hover:bg-emerald-500"
          >
            Choose your land →
          </button>

          <p className="max-w-sm text-center text-[11px] leading-relaxed text-stone-500">
            Press any key or click to continue
            {muted && (
              <span className="mt-1 block text-amber-400/90">Sound is off — tap 🔊 to unmute</span>
            )}
          </p>

          <p className="text-[10px] font-medium tracking-[0.14em] text-stone-600">
            {GAME_PHASE} · v{GAME_VERSION}
          </p>
        </div>
      </div>

      {/* Progress whisper */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-[3] h-0.5 bg-stone-900/80"
        aria-hidden
      >
        <div
          className="intro-progress h-full bg-gradient-to-r from-emerald-900/60 via-emerald-500/70 to-amber-600/50"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="intro-control absolute bottom-8 right-6 z-20 flex items-center gap-2 sm:bottom-10">
        <button
          type="button"
          onClick={handleToggleMute}
          className="rounded-lg border border-stone-700/80 bg-stone-900/70 px-3 py-2 text-sm text-stone-300 backdrop-blur-sm transition-all hover:border-stone-500 hover:text-white"
          title={muted ? 'Unmute' : 'Mute'}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        {showSkipButton && (
          <button
            type="button"
            onClick={handleContinue}
            className="rounded-lg border border-stone-700/80 bg-stone-900/70 px-4 py-2 text-xs text-stone-400 backdrop-blur-sm transition-all hover:border-stone-500 hover:text-stone-200"
          >
            Skip intro →
          </button>
        )}
      </div>

      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1] h-36"
        style={{ background: 'linear-gradient(to top, rgba(34,197,94,0.06), transparent)' }}
      />
    </div>
  );
}