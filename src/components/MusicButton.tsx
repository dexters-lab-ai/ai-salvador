import { useCallback, useEffect, useRef, useState } from 'react';
import volumeImg from '../../assets/volume.svg';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

// Simple button component since we can't find the original Button component
const Button = ({ children, onClick, className = '', ...props }: any) => (
  <button 
    onClick={onClick} 
    className={`px-4 py-2 rounded-md ${className}`}
    {...props}
  >
    {children}
  </button>
);
import { toast } from 'react-toastify';
import { audioContextManager } from '../utils/audioContextManager';

// Permissions overlay component
function PermissionsOverlay({ onRequestPermission, isAudioBlocked, setShowOverlay }: { onRequestPermission: () => void, isAudioBlocked: boolean, setShowOverlay: (show: boolean) => void }) {
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
  }, [isAudioBlocked, permissionState, setShowOverlay]);

  if (!isAudioBlocked && permissionState === 'granted') return null; // Don't show if audio is not blocked and permission is granted

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
  const musicUrl = useQuery(api.music.getBackgroundMusic, {}); // Fix: Pass an empty object for optional arguments
  const [userWantsMusic, setUserWantsMusic] = useState<boolean>(
    () => localStorage.getItem('musicOn') === '1',
  );
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [showPermissionsOverlay, setShowPermissionsOverlay] = useState(false); // State for showing the PermissionsOverlay

  // First-time audio permission prompt
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const hasPrompted = localStorage.getItem('audioPromptShown') === 'true';
    const isAudioDisabled = localStorage.getItem('musicOn') === '0';
    
    if (!hasPrompted && !isAudioDisabled) {
      // Using a custom confirmation dialog or an overlay for better UX
      // For now, it will simply set showPermissionsOverlay to true
      setShowPermissionsOverlay(true);
      localStorage.setItem('audioPromptShown', 'true');
    }
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const partyAudioRef = useRef<HTMLAudioElement | null>(null);
  const [currentSong, setCurrentSong] = useState(0);

  const partyPlaylist = [
    '/assets/mariachi.wav',
    '/assets/cumbia.wav',
    '/assets/salsa.wav',
  ];

  const isPlaying = userWantsMusic && !isChaseActive && !isPartyActive;

  // Initialize audio context on first interaction
  useEffect(() => {
    const handleFirstInteraction = () => {
      // This will set up the audio context and unlock it
      audioContextManager.getAudioContext();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };

    document.addEventListener('click', handleFirstInteraction, { once: true });
    document.addEventListener('keydown', handleFirstInteraction, { once: true });

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  // Main audio effect with improved error handling
  useEffect(() => {
    if (!musicUrl) return;
    
    // Clean up old element
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {}
    }
    
    let revokedUrl: string | null = null;
    
    const initializeAudio = async () => {
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
            
            // Try to play to warm up the audio context
            if (isPlaying) {
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                playPromise.catch(() => {
                  // Autoplay was prevented, we'll handle this in the play/pause effect
                });
              }
            }
            
            created = true;
            break;
          } catch (e) {
            console.warn(`Failed to load audio from ${url}`, e);
          }
        }
        
        if (!created) throw new Error('No playable audio sources found');
      } catch (e) {
        console.error('Failed to initialize audio element:', e);
        toast.error('Music unavailable. Tap the Music button again or try later.');
      }
    };
    
    initializeAudio();
    
    return () => {
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [musicUrl, isPlaying]);

  // Party music handler with improved autoplay
  useEffect(() => {
    if (!isPartyActive || !userWantsMusic || isChaseActive) {
      partyAudioRef.current?.pause();
      try { localStorage.removeItem('partyNowPlaying'); } catch {}
      return;
    }

    const playPartyMusic = async () => {
      if (!partyAudioRef.current) {
        partyAudioRef.current = new Audio();
        partyAudioRef.current.volume = 0.5;
        partyAudioRef.current.preload = 'auto';
        partyAudioRef.current.addEventListener('ended', () => {
          setCurrentSong((prev) => (prev + 1) % partyPlaylist.length);
        });
      }

      try {
        // Only try to play if we don't have a source or if the source is different
        if (!partyAudioRef.current.src || 
            !partyAudioRef.current.src.endsWith(partyPlaylist[currentSong])) {
          partyAudioRef.current.src = partyPlaylist[currentSong];
          
          // Try to play immediately
          const playPromise = partyAudioRef.current.play();
          
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.log('Autoplay prevented, will start after user interaction');
              // Set up a one-time play on user interaction
              const playOnInteraction = () => {
                document.removeEventListener('click', playOnInteraction);
                document.removeEventListener('keydown', playOnInteraction);
                partyAudioRef.current?.play().catch(console.error);
              };
              document.addEventListener('click', playOnInteraction, { once: true });
              document.addEventListener('keydown', playOnInteraction, { once: true });
            });
          }
        } else if (partyAudioRef.current.paused) {
          // If we already have the right source but it's paused, try to play
          await partyAudioRef.current.play().catch(console.error);
        }
        // Broadcast now playing for on-map overlay
        try {
          localStorage.setItem('partyNowPlaying', partyPlaylist[currentSong].split('/').pop()?.split('.')[0] || 'Unknown');
        } catch {}

      } catch (e) {
        console.error('Error playing party music:', e);
      }
    };

    // Try to play when component mounts or dependencies change
    playPartyMusic();

    // Also try to play when page becomes visible (e.g., after tab switch)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPartyActive && userWantsMusic && !isChaseActive) {
        playPartyMusic();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPartyActive, userWantsMusic, currentSong, partyPlaylist, isChaseActive]);

  // Keep play/pause in sync with state with improved audio context handling
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const playAudio = async () => {
      try {
        // Ensure audio context is ready
        await audioContextManager.resumeContext();
        
        // Set volume before playing to avoid potential iOS issues
        audio.volume = 0.5;
        
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.log('Autoplay prevented, will start after user interaction');
            
            // Set up a one-time play on user interaction
            const playOnInteraction = () => {
              document.removeEventListener('click', playOnInteraction);
              document.removeEventListener('keydown', playOnInteraction);
              audio.play().catch(console.error);
            };
            
            document.addEventListener('click', playOnInteraction, { once: true });
            document.addEventListener('keydown', playOnInteraction, { once: true });
            
            // Update state to reflect that we're waiting for interaction
            setUserWantsMusic(false);
            localStorage.setItem('musicOn', '0');
          });
        }
      } catch (e) {
        console.error('Error playing audio:', e);
        setUserWantsMusic(false);
        localStorage.setItem('musicOn', '0');
      }
    };
    
    if (isPlaying) {
      playAudio();
    } else {
      audio.pause();
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

  const handleRequestPermission = () => {
    audioContextManager.resumeContext().then(() => {
      setIsAudioBlocked(false);
      setShowPermissionsOverlay(false);
      // If user wants music, try to play it now that context is resumed
      if (userWantsMusic && audioRef.current) {
        audioRef.current.play().catch(console.error);
      }
    }).catch(e => {
      console.error('Failed to resume context after permission:', e);
      setIsAudioBlocked(true);
      toast.error('Failed to enable audio. Please check browser permissions.');
    });
  };

  return (
    <>
      <button
        onClick={flipSwitch}
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
      
      {showPermissionsOverlay && (
        <PermissionsOverlay 
          onRequestPermission={handleRequestPermission} 
          isAudioBlocked={isAudioBlocked} 
          setShowOverlay={setShowPermissionsOverlay}
        />
      )}
    </>
  );
}