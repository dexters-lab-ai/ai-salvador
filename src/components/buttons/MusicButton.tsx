import { useCallback, useEffect, useRef, useState } from 'react';
import volumeImg from '../../../assets/volume.svg';
import Button from './Button';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { toast } from 'react-toastify';

export default function MusicButton({ isChaseActive, isPartyActive }: { isChaseActive: boolean, isPartyActive: boolean }) {
  const musicUrl = useQuery(api.music.getBackgroundMusic);
  const [userWantsMusic, setUserWantsMusic] = useState<boolean>(
    () => localStorage.getItem('musicOn') === '1',
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const partyAudioRef = useRef<HTMLAudioElement | null>(null);
  const [currentSong, setCurrentSong] = useState(0);

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
