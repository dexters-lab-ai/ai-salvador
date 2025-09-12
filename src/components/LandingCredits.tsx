import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Descriptions, characters as CharacterSheets } from '../../data/characters';

type Props = {
  durationMs?: number;
  onDone?: () => void;
  inline?: boolean;
};

// Select a cinematic cast from character descriptions with emojis consistent with in-game.
const EMOJI_BY_NAME: Record<string, string> = {
  'President Bukele': '👑',
  'ICE': '🚔',
  'MS-13': '🦹',
  'Alex': '📚',
  'Lucky': '🧀',
};

function pickBlurb(identity: string, max = 90) {
  const oneLine = identity.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine;
}

export default function LandingCredits({ durationMs = 9000, onDone, inline = false }: Props) {
  const cast = useMemo(() => {
    const priority = ['President Bukele', 'ICE', 'MS-13', 'Alex', 'Lucky'];
    const map = new Map(Descriptions.map((d) => [d.name, d] as const));
    return priority
      .map((name) => map.get(name))
      .filter(Boolean)
      .map((d) => ({
        name: d!.name,
        blurb: pickBlurb(d!.identity),
        emoji: EMOJI_BY_NAME[d!.name] || '⭐',
        characterKey: (d as any).character as string | undefined,
      }));
  }, []);

  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimer = useRef<number | null>(null);

  useEffect(() => {
    const stepMs = Math.max(1400, Math.floor(durationMs / Math.max(1, cast.length)));
    const iv = setInterval(() => setIndex((i) => (i + 1) % cast.length), stepMs);
    const timeout = setTimeout(() => {
      setVisible(false);
      onDone?.();
      clearInterval(iv);
    }, durationMs);

    // Music: fade in quickly, fade out at end; credits-only
    const el = new Audio('/assets/background.ogg');
    el.volume = 0;
    el.loop = true;
    audioRef.current = el;
    el.play().catch(() => {});
    const fade = (target: number, ms: number) => {
      const start = performance.now();
      const init = el.volume;
      const diff = target - init;
      const step = (t: number) => {
        const progress = Math.min(1, (t - start) / ms);
        el.volume = Math.max(0, Math.min(1, init + diff * progress));
        if (progress < 1) {
          fadeTimer.current = requestAnimationFrame(step);
        }
      };
      fadeTimer.current = requestAnimationFrame(step);
    };
    fade(0.24, 1500);

    const fadeOutAt = setTimeout(() => {
      fade(0, 1000);
      setTimeout(() => {
        el.pause();
        el.currentTime = 0;
      }, 1100);
    }, Math.max(0, durationMs - 1300));

    return () => {
      clearInterval(iv);
      clearTimeout(timeout);
      clearTimeout(fadeOutAt);
      if (fadeTimer.current) cancelAnimationFrame(fadeTimer.current);
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {}
        audioRef.current = null;
      }
    };
  }, [cast.length, durationMs, onDone]);

  const current = cast[index];
  const sheet = useMemo(() => {
    if (!current?.characterKey) return null;
    const found = CharacterSheets.find((c) => c.name === current.characterKey);
    return found || null;
  }, [current]);

  const frontFrame = (sheet?.spritesheetData as any)?.frames?.down?.frame as
    | { x: number; y: number; w: number; h: number }
    | undefined;
  const spriteUrl = useMemo(() => {
    const raw = sheet?.textureUrl;
    if (!raw) return undefined;
    // Normalize known prefix differences (strip repo path prefix if present)
    const normalized = raw.replace(/^\/ai-town/, '');
    const base = (import.meta as any).env?.BASE_URL || '/';
    return normalized.startsWith('/assets')
      ? `${base.replace(/\/$/, '')}${normalized}`
      : normalized;
  }, [sheet]);

  if (!visible) return null;

  return (
    <div
      className={clsx(
        inline ? 'relative w-full flex items-center justify-center z-10' : 'absolute inset-0 flex items-center justify-center pointer-events-none z-30',
        'credits-intro-enter credits-intro-enter-active'
      )}
    >
      <div key={current.name} className={clsx('text-center', inline ? 'w-full max-w-[680px] px-4' : 'w-[92%] max-w-[640px]') }>
        {spriteUrl && frontFrame ? (
          <div
            className="mx-auto rounded-full bg-black/40 border border-white/20 backdrop-blur-sm shadow-2xl overflow-hidden"
            style={{ width: frontFrame.w * 2, height: frontFrame.h * 2 }}
          >
            <img
              src={spriteUrl}
              alt={current.name}
              aria-hidden
              style={{
                width: 'auto',
                height: 'auto',
                objectFit: 'none',
                objectPosition: `-${frontFrame.x}px -${frontFrame.y}px`,
                transformOrigin: 'top left',
                transform: 'scale(2)',
                imageRendering: 'pixelated',
                display: 'block',
              }}
            />
          </div>
        ) : (
          <div className="mx-auto w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-black/40 border border-white/20 backdrop-blur-sm flex items-center justify-center shadow-2xl overflow-hidden">
            <div className="text-5xl sm:text-6xl select-none" aria-hidden>
              {current.emoji}
            </div>
          </div>
        )}
        <div className="mt-4 px-4 py-3 bg-black/45 backdrop-blur-sm rounded-lg border border-white/10 shadow-xl">
          <div className="text-sm uppercase tracking-widest text-white/75">Starring</div>
          <div className="mt-1 text-2xl sm:text-3xl font-display text-yellow-300 drop-shadow">{current.name}</div>
          <div className="mt-2 text-sm sm:text-base text-white/90 leading-relaxed">{current.blurb}</div>
        </div>
        <div className="mt-3 flex items-center gap-2 justify-center opacity-90 text-xs">
          <div className="w-32 h-1 bg-white/15 rounded overflow-hidden">
            <div
              className="h-1 bg-yellow-300/80 rounded"
              style={{ width: `${((index + 1) / cast.length) * 100}%`, transition: 'width 400ms ease' }}
            />
          </div>
          <div className="text-white/70">Intro</div>
        </div>
      </div>
    </div>
  );
}
