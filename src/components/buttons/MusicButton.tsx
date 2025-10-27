import { useCallback, useEffect, useRef, useState } from 'react';
import volumeImg from '../../../assets/volume.svg';
import Button from './Button';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { toast } from 'react-toastify';

// Check if audio is allowed to play
const checkAudioPermission = async (): Promise<boolean> => {
  try {
    // Try to play a silent audio element
    const audio = new Audio();
    audio.muted = true; // Start muted to avoid any sound
    await audio.play();
    audio.pause();
    return true;
  } catch (e) {
    return false;
  }
};

// Permissions overlay component
function PermissionsOverlay({ onRequestPermission, isAudioBlocked }: { onRequestPermission: () => void, isAudioBlocked: boolean }) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [showDismiss, setShowDismiss] = useState(false);

  useEffect(() => {
    // Show dismiss button after a delay
    const dismissTimer = setTimeout(() => setShowDismiss(true), 3000);
    
    // Show overlay after a short delay if audio is blocked
    const showTimer = setTimeout(() => {
      if (isAudioBlocked) {
        setShowOverlay(true);
      }
    }, 1000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    };
  }, [isAudioBlocked]);

  if (!showOverlay) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-clay-800 bg-opacity-95 text-white p-4 rounded-lg shadow-lg z-[100] max-w-xs border border-clay-600">
      <div className="flex items-start">
        <div className="flex-1">
          <p className="text-sm font-medium mb-2">🔊 Allow Audio</p>
          <p className="text-xs text-clay-200 mb-3">To enable background music, please allow audio playback in your browser.</p>
          <div className="flex gap-2">
            <button
              onClick={onRequestPermission}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded transition-colors"
            >
              Allow Audio
            </button>
            {showDismiss && (
              <button
                onClick={() => setShowOverlay(false)}
                className="text-xs px-3 py-1.5 rounded border border-clay-600 hover:bg-clay-700 transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
        <button 
          onClick={() => setShowOverlay(false)}
          className="ml-2 text-clay-400 hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// Helper function to handle audio playback with autoplay support
const createAudioElement = (src?: string) => {
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.volume = 0.5;
  audio.muted = true; // This enables autoplay in most browsers
  return audio;
};

export default function MusicButton({ isChaseActive, isPartyActive }: { isChaseActive: boolean, isPartyActive: boolean }) {
  const musicUrl = useQuery(api.music.getBackgroundMusic);
  const [userWantsMusic, setUserWantsMusic] = useState<boolean>(
    () => localStorage.getItem('musicOn') === '1',
  );
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [showEnableButton, setShowEnableButton] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const partyAudioRef = useRef<HTMLAudioElement | null>(null);
  const [currentSong, setCurrentSong] = useState(0);
  const hasInteracted = useRef(false);
  const userInitiatedPlay = useRef(false);

  // Use assets that exist in public/assets
  const partyPlaylist = [
    { src: '/assets/mariachi.mp3', title: 'Mariachi' },
    { src: '/assets/partyrockers.mp3', title: 'Party Rockers' },
    { src: '/assets/makarenca.mp3', title: 'Makarenca' },
    { src: '/assets/narcos.mp3', title: 'Narcos' },
  ];

  const isPlaying = userWantsMusic && !isChaseActive && !isPartyActive;

  // Create/replace audio element when URL changes with multi-source fallback
  useEffect(() => {
    if (!musicUrl) return;
    // Clean up old element
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {}
    }
    let revokedUrl: string | null = null;
    (async () => {
      try {
        const base = (import.meta as any).env?.BASE_URL || '/';
        const withBase = (p: string) => {
          const normalizedBase = base.endsWith('/') ? base : `${base}/`;
          return p.replace(/^\//, '').startsWith('assets/')
            ? `${normalizedBase}${p.replace(/^\//, '')}`
            : p;
        };
        const candidates = Array.from(
          new Set([
            musicUrl,
            withBase('assets/background.mp3'),
            withBase('assets/background.ogg'),
            withBase('assets/background.wav'),
            // relative fallbacks
            'assets/background.mp3',
            'assets/background.ogg',
            'assets/background.wav',
          ]),
        );

        let created = false;
        for (const url of candidates) {
          try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) continue;
            const blob = await res.blob();
            if (!blob || blob.size === 0) continue;
            const objUrl = URL.createObjectURL(blob);
            revokedUrl = objUrl;
            const audio = new Audio(objUrl);
            audio.loop = true;
            audio.preload = 'auto';
            audio.volume = 0.5;
            audioRef.current = audio;
            created = true;
            break;
          } catch {}
        }
        if (!created) throw new Error('No playable audio sources found');
      } catch (e) {
        console.error('Failed to initialize audio element:', e);
        toast.error('Music unavailable. Tap the Music button again or try later.');
      }
    })();
    return () => {
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [musicUrl]);

  // Party music handler
  useEffect(() => {
    if (isPartyActive && userWantsMusic && !isChaseActive) {
      if (!partyAudioRef.current) {
        partyAudioRef.current = new Audio();
        partyAudioRef.current.volume = 0.5;
        partyAudioRef.current.addEventListener('ended', () => {
          setCurrentSong((prev) => (prev + 1) % partyPlaylist.length);
        });
      }
      const track = partyPlaylist[currentSong % partyPlaylist.length];
      // Broadcast now playing for on-map overlay
      try {
        localStorage.setItem('partyNowPlaying', track.title);
      } catch {}
      partyAudioRef.current.src = track.src;
      partyAudioRef.current.play().catch(console.error);
    } else {
      partyAudioRef.current?.pause();
      try { localStorage.removeItem('partyNowPlaying'); } catch {}
    }
    return () => {
      partyAudioRef.current?.pause();
    };
  }, [isPartyActive, userWantsMusic, currentSong, isChaseActive]);

  // Keep play/pause in sync with state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      // Fade in to target volume
      const target = 0.5;
      audio.volume = 0;
      audio.play().catch(() => {});
      const step = 0.05;
      const iv = setInterval(() => {
        audio.volume = Math.min(target, audio.volume + step);
        if (audio.volume >= target) clearInterval(iv);
      }, 50);
      return () => clearInterval(iv);
    } else {
      // Fade out then pause
      const step = 0.05;
      const iv = setInterval(() => {
        audio.volume = Math.max(0, audio.volume - step);
        if (audio.volume <= 0) {
          try {
            audio.pause();
          } catch {}
          clearInterval(iv);
        }
      }, 50);
      return () => clearInterval(iv);
    }
  }, [isPlaying]);

  const flipSwitch = async () => {
    setUserWantsMusic((wants) => {
      const newValue = !wants;
      localStorage.setItem('musicOn', newValue ? '1' : '0');
      return newValue;
    });
  };

  const handleKeyPress = useCallback(
    (event: { key: string }) => {
      if (event.key === 'm' || event.key === 'M') {
        void flipSwitch();
      }
    },
    [flipSwitch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // Handle audio permission and initialization
  useEffect(() => {
    // Check if audio is blocked on initial load
    const checkAudio = async () => {
      const canPlay = await checkAudioPermission();
      setIsAudioBlocked(!canPlay);
      setShowEnableButton(!canPlay);
    };
    
    checkAudio();
    
    // Set up global click handler to enable audio on first interaction
    const handleFirstInteraction = async () => {
      if (!userInitiatedPlay.current) {
        userInitiatedPlay.current = true;
        const canPlay = await checkAudioPermission();
        setIsAudioBlocked(!canPlay);
        
        if (canPlay && userWantsMusic) {
          // User has interacted, we can try to play audio
          if (audioRef.current) {
            try {
              audioRef.current.muted = false;
              await audioRef.current.play();
            } catch (e) {
              console.warn('Failed to play audio after interaction:', e);
            }
          }
        }
      }
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };

    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [userWantsMusic]);

  const toggleMusic = async () => {
    if (!hasInteracted.current) {
      hasInteracted.current = true;
      // Try to play audio on first interaction to unlock audio context
      try {
        if (audioRef.current) {
          await audioRef.current.play().catch(() => {});
          await audioRef.current.pause();
          setIsAudioBlocked(false);
        }
      } catch (e) {
        console.error('Audio playback failed:', e);
        setIsAudioBlocked(true);
      }
    }
    flipSwitch();
  };

  const handleRequestPermission = () => {
    if (audioRef.current) {
      audioRef.current.play()
        .then(() => {
          audioRef.current?.pause();
          setIsAudioBlocked(false);
        })
        .catch((e) => {
          console.error('Permission request failed:', e);
          setIsAudioBlocked(true);
        });
    }
  };

  return (
    <>
      {showEnableButton && (
        <Button
          onClick={handleRequestPermission}
          title="Enable audio"
          className="text-xs sm:text-sm bg-yellow-600 hover:bg-yellow-700"
        >
          <span>🔊 Enable Audio</span>
        </Button>
      )}
      <Button
        onClick={toggleMusic}
        title={userWantsMusic ? 'Turn off music' : 'Turn on music'}
        className={`text-xs sm:text-sm ${showEnableButton ? 'opacity-50' : ''}`}
        disabled={showEnableButton}
      >
        <img src={volumeImg} alt="" className="w-4 h-4" />
        <span>{userWantsMusic ? 'Music On' : 'Music Off'}</span>
      </Button>
      <PermissionsOverlay 
        onRequestPermission={handleRequestPermission} 
        isAudioBlocked={isAudioBlocked && userWantsMusic} 
      />
    </>
  );
}
