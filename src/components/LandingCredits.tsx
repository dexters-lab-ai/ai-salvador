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
  const cleanupRef = useRef<() => void>();
  const audioInitialized = useRef(false);
  const handleCanPlayRef = useRef<() => void>();
  const handleAudioErrorRef = useRef<(error: Error) => void>();
  const effectRun = useRef(false);
  const fadeOutAtRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Prevent multiple effect runs
    if (effectRun.current) return;
    effectRun.current = true;
    
    if (cast.length === 0) {
      onDone?.();
      return;
    }
    
    // Reset state
    setIndex(0);
    setVisible(true);

    // Timing constants - using module-level constant for consistency
    const CHARACTER_DISPLAY_MS = 5000; // 5 seconds per character
    const AUDIO_MIN_DURATION = 20000; // Minimum 20 seconds of audio
    const FADE_OUT_MS = 2000; // 2 seconds fade out
    const AUDIO_FADE_IN_MS = 2000; // 2 seconds fade in
    
    // Track state with refs to avoid dependency on React state in effects
    const state = {
      currentIndex: 0,
      totalCharacters: cast.length,
      characterInterval: null as NodeJS.Timeout | null,
      endTimeout: null as NodeJS.Timeout | null,
      fadeOutTimeout: null as NodeJS.Timeout | null,
      isMounted: true,
      effectRun: false
    };
    
    // Show first character immediately
    setIndex(0);
    
    // Function to advance to next character
    const showNextCharacter = () => {
      if (!state.isMounted) return;
      
      state.currentIndex++;
      if (state.currentIndex < state.totalCharacters) {
        setIndex(state.currentIndex);
      } else {
        // Reached the end, keep showing last character
        if (state.characterInterval) {
          clearInterval(state.characterInterval);
          state.characterInterval = null;
        }
      }
    };
    
    // Start character rotation if we have multiple characters
    if (state.totalCharacters > 1) {
      state.characterInterval = setInterval(showNextCharacter, CHARACTER_DISPLAY_MS);
    }
    
    // Calculate total duration based on max of character display or minimum audio time
    const totalCharactersTime = state.totalCharacters * CHARACTER_DISPLAY_MS;
    const totalDuration = Math.max(totalCharactersTime, AUDIO_MIN_DURATION) + FADE_OUT_MS;

    // Set up the final timeout to end the credits
    state.endTimeout = setTimeout(() => {
      if (!state.isMounted) return;
      
      console.log('Ending credits sequence');
      setVisible(false);
      
      // Clear the character rotation interval
      if (state.characterInterval) {
        clearInterval(state.characterInterval);
        state.characterInterval = null;
      }
      
      // Delay the onDone callback to allow for fade out
      setTimeout(() => {
        if (state.isMounted) {
          console.log('Calling onDone callback');
          onDone?.();
        }
      }, 1000);
    }, totalDuration);
    
    // Set up fade out for audio - only set this once at the end
    if (state.fadeOutTimeout) clearTimeout(state.fadeOutTimeout);
    state.fadeOutTimeout = setTimeout(() => {
      if (audioRef.current && state.isMounted) {
        console.log('Starting audio fade out at', Date.now());
        fade(0, FADE_OUT_MS);
      }
    }, Math.max(0, totalDuration - FADE_OUT_MS));
    
    // Clear any existing fade out timers
    if (fadeOutAtRef.current) {
      clearTimeout(fadeOutAtRef.current);
      fadeOutAtRef.current = null;
    }
    
    console.log(`Credits started: ${state.totalCharacters} characters, ${CHARACTER_DISPLAY_MS}ms each, total: ${totalDuration}ms`);

    // Initialize audio with longer duration to match character display
    if (!audioInitialized.current && audioRef.current === null) {
      const basePath = ((import.meta as any).env.BASE_URL || '').replace(/\/+$/, '');
      const audioSrc = `${basePath}/assets/narcos.wav`;
      const audio = new Audio(audioSrc);
      
      // Store handlers in refs for cleanup
      const handleAudioError = (error: Error) => {
        if (!state.isMounted) return;
        console.error('Audio error:', error);
        setAudioError(error);
        setAudioLoaded(true);
      };
      
      // Configure audio
      audio.loop = true;
      audio.volume = 0; // Start with volume 0 for fade in
      audio.preload = 'auto';

      const handleCanPlay = () => {
        if (!state.isMounted) return;
        
        setAudioLoaded(true);
        if (audioRef.current === audio) {
          // Only start playing if the user has already interacted with the page
          const playAudio = () => {
            audio.play().then(() => {
              console.log('Audio started playing');
              // Fade in audio
              fade(0.7, AUDIO_FADE_IN_MS);
            }).catch(handleAudioError);
          };
          
          // If the page has already received some user interaction, play immediately
          if (document.visibilityState === 'visible' && document.hasFocus()) {
            playAudio();
          } else {
            // Otherwise, wait for user interaction
            const playOnInteraction = () => {
              document.removeEventListener('click', playOnInteraction);
              document.removeEventListener('keydown', playOnInteraction);
              document.removeEventListener('touchstart', playOnInteraction);
              playAudio();
            };
            
            document.addEventListener('click', playOnInteraction, { once: true });
            document.addEventListener('keydown', playOnInteraction, { once: true });
            document.addEventListener('touchstart', playOnInteraction, { once: true });
          }
        }
      };

      // Store handlers in refs for cleanup
      handleAudioErrorRef.current = handleAudioError;
      handleCanPlayRef.current = handleCanPlay;

      audio.preload = 'auto';
      audio.volume = 0;
      audio.loop = true;
      
      // Set up event listeners with stored handlers
      audio.addEventListener('canplaythrough', handleCanPlay, { once: true });
      audio.addEventListener('error', () => handleAudioError(new Error(`Failed to load audio`)));
      
      audioRef.current = audio;
      audio.load();
      audioInitialized.current = true;
    }
    
    const fade = (target: number, duration: number) => {
      if (!audioRef.current) return;
      
      const startVolume = Math.max(0, Math.min(1, audioRef.current.volume));
      const targetVolume = Math.max(0, Math.min(1, target));
      const delta = targetVolume - startVolume;
      const startTime = performance.now();
      
      const fadeStep = (timestamp: number) => {
        if (!audioRef.current) return;
        
        const elapsed = timestamp - startTime;
        const progress = Math.min(1, Math.max(0, elapsed / duration));
        
        // Calculate new volume with easing and clamp it
        const easedProgress = 1 - Math.pow(1 - progress, 2); // Ease-out cubic
        const newVolume = Math.max(0, Math.min(1, startVolume + delta * easedProgress));
        
        try {
          if (audioRef.current) {
            audioRef.current.volume = newVolume;
          }
        } catch (e) {
          console.error('Error setting volume:', e);
          return; // Stop the animation if there's an error
        }
        
        // Continue fading if not complete
        if (progress < 1) {
          fadeTimer.current = requestAnimationFrame(fadeStep);
        } else {
          fadeTimer.current = null;
          
          // If fading out, pause the audio when done
          if (target === 0 && audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
        }
      };
      
      // Start the fade animation
      fadeTimer.current = requestAnimationFrame(fadeStep);
    };
    // Initial fade in - smoother and faster
    fade(0.7, 1500);
    
    // Clear any existing fade out timers to prevent interference
    if (fadeOutAtRef.current) {
      clearTimeout(fadeOutAtRef.current);
      fadeOutAtRef.current = null;
    }

    // Cleanup function
    const cleanup = () => {
      if (!state.isMounted) return;
      
      console.log('Cleaning up credits component');
      state.isMounted = false;
      effectRun.current = false;
      
      // Clear all timeouts and intervals
      if (state.characterInterval) {
        clearInterval(state.characterInterval);
        state.characterInterval = null;
      }
      if (state.endTimeout) {
        clearTimeout(state.endTimeout);
        state.endTimeout = null;
      }
      if (state.fadeOutTimeout) {
        clearTimeout(state.fadeOutTimeout);
        state.fadeOutTimeout = null;
      }
      
      // Clean up audio
      if (audioRef.current) {
        try {
          const audio = audioRef.current;
          audio.pause();
          audio.currentTime = 0;
          if (handleCanPlayRef.current) {
            audio.removeEventListener('canplaythrough', handleCanPlayRef.current);
          }
          if (handleAudioErrorRef.current) {
            audio.removeEventListener('error', () => handleAudioErrorRef.current?.(new Error('Audio error')));
          }
          audioRef.current = null;
        } catch (e) {
          console.error('Error cleaning up audio:', e);
        }
      }
      
      // Clear any pending fade animations
      if (fadeTimer.current) {
        cancelAnimationFrame(fadeTimer.current);
        fadeTimer.current = null;
      }
    };
  }, [cast.length, onDone]); // Removed durationMs from dependencies to prevent re-runs

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