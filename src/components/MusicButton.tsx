import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import volumeImg from '../../assets/volume.svg';
import Button from './buttons/Button';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { toast } from 'react-toastify';

// Memoize the component to prevent unnecessary re-renders
const MusicButton = React.memo(({ isChaseActive, isPartyActive }: { 
  isChaseActive: boolean; 
  isPartyActive: boolean 
}) => {
  const musicUrl = useQuery(api.music.getBackgroundMusic);
  const [userWantsMusic, setUserWantsMusic] = useState<boolean>(
    () => localStorage.getItem('musicOn') === '1',
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const partyAudioRef = useRef<HTMLAudioElement | null>(null);
  const [currentSong, setCurrentSong] = useState(0);
  
  // Memoize the isPlaying calculation
  const isPlaying = useMemo(() => {
    return userWantsMusic && !isChaseActive && !isPartyActive;
  }, [userWantsMusic, isChaseActive, isPartyActive]);

  const partyPlaylist = [
    '/assets/mariachi.wav',
    '/assets/cumbia.wav',
    '/assets/salsa.wav',
  ];

  // Create audio element once and reuse it
  useEffect(() => {
    if (!musicUrl || audioRef.current) return;
    
    const loadAudio = async () => {
      try {
        const base = (import.meta as any).env?.BASE_URL || '/';
        const withBase = (p: string) => {
          const normalizedBase = base.endsWith('/') ? base : `${base}/`;
          return p.replace(/^\//, '').startsWith('assets/')
            ? `${normalizedBase}${p.replace(/^\//, '')}`
            : p;
        };
        
        const candidates = [
          musicUrl,
          withBase('assets/background.mp3'),
          withBase('assets/background.ogg'),
          withBase('assets/background.wav'),
          'assets/background.mp3',
          'assets/background.ogg',
          'assets/background.wav',
        ];

        for (const url of candidates) {
          try {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.loop = true;
            audio.volume = 0.5;
            
            // Wait for the audio to be ready
            await new Promise<void>((resolve, reject) => {
              audio.oncanplaythrough = () => resolve();
              audio.onerror = () => reject(new Error(`Failed to load ${url}`));
              audio.src = url;
              
              // Try to preload
              audio.load();
            });
            
            audioRef.current = audio;
            console.log('Audio loaded successfully from:', url);
            return;
          } catch (e) {
            console.warn(`Failed to load audio from ${url}:`, e);
          }
        }
        
        throw new Error('No playable audio sources found');
      } catch (e) {
        console.error('Failed to initialize audio:', e);
        toast.error('Music unavailable. Tap the Music button again or try later.');
      }
    };

    loadAudio();

    return () => {
      // Don't clean up the audio element here, we want to reuse it
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
      partyAudioRef.current.src = partyPlaylist[currentSong];
      partyAudioRef.current.play().catch(console.error);
    } else {
      partyAudioRef.current?.pause();
    }
    return () => {
      partyAudioRef.current?.pause();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPartyActive, userWantsMusic, currentSong, isChaseActive]);

  // Keep play/pause in sync with state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = async () => {
      try {
        // Reset the audio to the beginning if it's already at the end
        if (audio.ended) {
          audio.currentTime = 0;
        }
        await audio.play();
        console.log('Audio playback started');
      } catch (e) {
        console.error('Error playing audio:', e);
      }
    };

    if (isPlaying) {
      // Fade in to target volume
      const target = 0.5;
      audio.volume = 0;
      handlePlay();
      
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
          } catch (e) {
            console.error('Error pausing audio:', e);
          }
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

  // Memoize the button to prevent re-renders
  const button = useMemo(() => (
    <Button
      onClick={flipSwitch}
      className="hidden lg:block"
      title="Play AI generated music (press m to play/mute)"
      imgUrl={volumeImg}
    >
      {userWantsMusic ? 'Mute' : 'Music'}
    </Button>
  ), [userWantsMusic]);

  return button;
});

export default MusicButton;
