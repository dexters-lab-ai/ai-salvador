import { useCallback, useEffect, useRef, useState } from 'react';
import volumeImg from '../../assets/volume.svg';
import Button from './buttons/Button';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { toast } from 'react-toastify';
import { audioContextManager } from '../utils/audioContextManager';

export default function MusicButton({ isChaseActive, isPartyActive }: { isChaseActive: boolean, isPartyActive: boolean }) {
  const musicUrl = useQuery(api.music.getBackgroundMusic);
  const [userWantsMusic, setUserWantsMusic] = useState<boolean>(
    () => localStorage.getItem('musicOn') === '1',
  );

  // First-time audio permission prompt
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const hasPrompted = localStorage.getItem('audioPromptShown') === 'true';
    const isAudioDisabled = localStorage.getItem('musicOn') === '0';
    
    if (!hasPrompted && !isAudioDisabled) {
      const enableAudio = window.confirm(
        'Enable audio for the full experience? You can change this later using the music button.'
      );
      
      if (enableAudio) {
        setUserWantsMusic(true);
        localStorage.setItem('musicOn', '1');
      } else {
        localStorage.setItem('musicOn', '0');
      }
      
      localStorage.setItem('audioPromptShown', 'true');
    }
  }, []);

  // Audio permission prompt on first visit
  useEffect(() => {
    // Only show prompt if this is first visit and audio isn't explicitly disabled
    if (typeof window !== 'undefined' && 
        localStorage.getItem('audioPromptShown') !== 'true' && 
        localStorage.getItem('musicOn') === null) {
      const enableAudio = window.confirm(
        'Enable audio for the full experience? You can change this later using the music button.'
      );
      if (enableAudio) {
        setUserWantsMusic(true);
        localStorage.setItem('musicOn', '1');
      } else {
        setUserWantsMusic(false);
        localStorage.setItem('musicOn', '0');
      }
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
    return () => {
      partyAudioRef.current?.pause();
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

  return (
    <>
      <Button
        onClick={() => void flipSwitch()}
        className="hidden lg:block"
        title="Play AI generated music (press m to play/mute)"
        imgUrl={volumeImg}
      >
        {userWantsMusic ? 'Mute' : 'Music'}
      </Button>
    </>
  );
}