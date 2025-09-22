import { useCallback, useEffect, useRef, useState } from 'react';
import volumeImg from '../../../assets/volume.svg';
import Button from './Button';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { toast } from 'react-toastify';

// Permissions overlay component
function PermissionsOverlay({ onRequestPermission, isAudioBlocked }: { onRequestPermission: () => void, isAudioBlocked: boolean }) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>('prompt');
  const [showDismiss, setShowDismiss] = useState(false);

  useEffect(() => {
    // Show dismiss button after a delay
    const dismissTimer = setTimeout(() => setShowDismiss(true), 3000);
    
    // Check if the browser supports the permissions API
    if ('permissions' in navigator) {
      // @ts-ignore - autoplay permission is not in the TypeScript lib yet
      const permissionName = 'autoplay' as PermissionName;
      navigator.permissions.query({ name: permissionName })
        .then(permissionStatus => {
          setPermissionState(permissionStatus.state);
          permissionStatus.onchange = () => {
            setPermissionState(permissionStatus.state);
          };
        })
        .catch(console.error);
    }

    // Show overlay after a short delay if audio is blocked
    const showTimer = setTimeout(() => {
      if (isAudioBlocked || permissionState === 'denied') {
        setShowOverlay(true);
      }
    }, 1000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    };
  }, [isAudioBlocked, permissionState]);

  if (!showOverlay || (permissionState === 'granted' && !isAudioBlocked)) return null;

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
  return audio;
};

export default function MusicButton({ isChaseActive, isPartyActive }: { isChaseActive: boolean, isPartyActive: boolean }) {
  const musicUrl = useQuery(api.music.getBackgroundMusic);
  const [userWantsMusic, setUserWantsMusic] = useState<boolean>(
    () => localStorage.getItem('musicOn') === '1',
  );
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const partyAudioRef = useRef<HTMLAudioElement | null>(null);
  const [currentSong, setCurrentSong] = useState(0);
  const hasInteracted = useRef(false);

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
      <button
        onClick={toggleMusic}
        className="button text-white shadow-solid pointer-events-auto text-xs"
        title={userWantsMusic ? 'Turn music off' : 'Turn music on'}
      >
        <div className="inline-block bg-clay-700 px-1.5 py-0.5">
          <div className="flex items-center gap-1">
            <img
              className={`w-3 h-3 ${isPartyActive ? 'animate-pulse' : ''}`}
              src={volumeImg}
              alt="Volume"
            />
            <span>{isPartyActive ? 'Party!' : 'Music'}</span>
          </div>
        </div>
      </button>
      
      <PermissionsOverlay 
        onRequestPermission={handleRequestPermission} 
        isAudioBlocked={isAudioBlocked} 
      />
    </>
  );
}
