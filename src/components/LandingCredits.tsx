
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

// Each character will be shown for 3.5 seconds (3500ms)
const CHARACTER_DISPLAY_MS = 3500;

export default function LandingCredits({ durationMs = CHARACTER_DISPLAY_MS * 5, onDone, inline = false }: Props) {
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
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [audioError, setAudioError] = useState<Error | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimer = useRef<number | null>(null);

// Fix: Refactor useEffect to correctly handle audio playback, event listeners, and cleanup.
  useEffect(() => {
    if (cast.length === 0) {
      onDone?.();
      return;
    }

    setIndex(0);
    setVisible(true);

    const CHARACTER_DISPLAY_MS_INTERNAL = 5000;
    const AUDIO_MIN_DURATION = 20000;
    const FADE_OUT_MS = 2000;
    const FADE_IN_MS = 2000;

    let isMounted = true;
    // Fix: Cannot find namespace 'NodeJS'.
    let characterInterval: ReturnType<typeof setInterval> | null = null;
    let endTimeout: ReturnType<typeof setTimeout> | null = null;
    let fadeOutTimeout: ReturnType<typeof setTimeout> | null = null;
    let currentIndex = 0;

    const showNextCharacter = () => {
      if (!isMounted) return;
      currentIndex++;
      if (currentIndex < cast.length) {
        setIndex(currentIndex);
      } else if (characterInterval) {
        clearInterval(characterInterval);
      }
    };

    if (cast.length > 1) {
      characterInterval = setInterval(showNextCharacter, CHARACTER_DISPLAY_MS_INTERNAL);
    }

    const totalCharactersTime = cast.length * CHARACTER_DISPLAY_MS_INTERNAL;
    const totalDuration = Math.max(totalCharactersTime, AUDIO_MIN_DURATION);

    endTimeout = setTimeout(() => {
      if (!isMounted) return;
      setVisible(false);
      if (characterInterval) clearInterval(characterInterval);
      setTimeout(() => {
        if (isMounted) onDone?.();
      }, 1000);
    }, totalDuration);

    const fade = (target: number, duration: number) => {
      if (!audioRef.current) return;
      const audio = audioRef.current;
      const startVolume = audio.volume;
      const delta = target - startVolume;
      let startTime: number | null = null;

      const fadeStep = (timestamp: number) => {
        if (!isMounted || !audioRef.current) return;
        if (startTime === null) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(1, elapsed / duration);
        audio.volume = Math.max(0, Math.min(1, startVolume + delta * progress));
        if (progress < 1) {
          fadeTimer.current = requestAnimationFrame(fadeStep);
        } else {
          if (target === 0) {
            audio.pause();
            audio.currentTime = 0;
          }
        }
      };
      if (fadeTimer.current) cancelAnimationFrame(fadeTimer.current);
      fadeTimer.current = requestAnimationFrame(fadeStep);
    };

    const handleAudioError = (error: Event | string) => {
      if (!isMounted) return;
      console.error('Audio error:', error);
      setAudioError(new Error(typeof error === 'string' ? error : 'Audio playback failed'));
      setAudioLoaded(true);
    };

    const handleCanPlay = () => {
      if (!isMounted || !audioRef.current) return;
      setAudioLoaded(true);
      audioRef.current.play().catch(handleAudioError);
      fade(0.7, FADE_IN_MS);
    };

    const audio = new Audio(`${((import.meta as any).env.BASE_URL || '').replace(/\/+$/, '')}/assets/narcos.wav`);
    audio.loop = true;
    audio.volume = 0;
    audio.preload = 'auto';
    audio.addEventListener('canplaythrough', handleCanPlay, { once: true });
    audio.addEventListener('error', handleAudioError);
    audioRef.current = audio;
    audio.load();

    fadeOutTimeout = setTimeout(() => {
      if (isMounted) fade(0, FADE_OUT_MS);
    }, totalDuration - FADE_OUT_MS);

    return () => {
      isMounted = false;
      if (characterInterval) clearInterval(characterInterval);
      if (endTimeout) clearTimeout(endTimeout);
      if (fadeOutTimeout) clearTimeout(fadeOutTimeout);
      if (fadeTimer.current) cancelAnimationFrame(fadeTimer.current);
      if (audioRef.current) {
        audioRef.current.removeEventListener('canplaythrough', handleCanPlay);
        audioRef.current.removeEventListener('error', handleAudioError);
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [cast.length, onDone]);

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

  if (!inline) {
    if (cast.length === 0) {
      return null; // Don't render anything if no cast members
    }

    return (
      <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
        {!audioLoaded && !audioError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white text-lg">Loading...</div>
          </div>
        )}
        {audioError && (
          <div className="absolute top-4 right-4 text-red-400 text-sm bg-black/50 p-2 rounded">
            Audio error: {audioError.message}
          </div>
        )}
        {visible && cast[index] && (
          <div className="text-center px-4 max-w-2xl animate-fadeIn">
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 transition-opacity duration-500">
              {cast[index].name}
            </h2>
            <p className="text-xl sm:text-2xl text-white/80 mb-8 transition-opacity duration-500">
              {cast[index].blurb}
            </p>
            <div className="text-6xl transition-transform duration-500 hover:scale-110">
              {cast[index].emoji}
            </div>
          </div>
        )}
      </div>
    );
  }

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