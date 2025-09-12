import { useEffect, useMemo, useRef, useState } from 'react';
import { useConvex, useConvexAuth, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { MAX_HUMAN_PLAYERS } from '../shared/constants';
import ReactModal from 'react-modal';

function useAnimationFrame(callback: (t: number) => void) {
  const cb = useRef(callback);
  const raf = useRef<number | null>(null);
  useEffect(() => { cb.current = callback; }, [callback]);
  useEffect(() => {
    const step = (t: number) => {
      cb.current(t);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);
}

function ParticleCanvas({ count, color = '#6ee7ff' }: { count: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const particles = useRef<{ x: number; y: number; vx: number; vy: number }[]>([]);
  useEffect(() => {
    const canvas = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    };
    resize();
    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    // init particles
    const canvas = ref.current!;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    particles.current = new Array(Math.max(0, count)).fill(0).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() * 1.2 - 0.6),
      vy: (Math.random() * 1.2 - 0.6),
    }));
  }, [count]);

  useAnimationFrame(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.floor(canvas.clientWidth);
    const cssH = Math.floor(canvas.clientHeight);
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    const r = 2 * dpr;
    for (const p of particles.current) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > cssW) p.vx *= -1;
      if (p.y < 0 || p.y > cssH) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x * dpr, p.y * dpr, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  return <canvas ref={ref} className="block w-full h-full" />;
}

export default function UserPoolWidget() {
  const { isAuthenticated } = useConvexAuth();
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const userPlayer = useQuery(api.players.user, worldId ? { worldId } : 'skip');

  // Phase 2: live counts from waitingPool
  const counts = useQuery(api.waitingPool.getPoolCounts, worldId ? { worldId } : 'skip');
  const myPool = useQuery(api.waitingPool.getMyPoolStatus, worldId ? { worldId } : 'skip');
  const activeHumans = counts?.activeHumans ?? 0;
  const poolSize = counts?.poolCount ?? 0;

  const [showLoginMode, setShowLoginMode] = useState(true);
  useEffect(() => {
    if (isAuthenticated) return; // only rotate when logged out
    const iv = setInterval(() => setShowLoginMode((v) => !v), 60_000);
    return () => clearInterval(iv);
  }, [isAuthenticated]);

  const [modalOpen, setModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  // Default expanded on desktop (>= sm), collapsed on mobile
  useEffect(() => {
    const decide = () => setIsExpanded(window.innerWidth >= 640);
    decide();
    window.addEventListener('resize', decide);
    return () => window.removeEventListener('resize', decide);
  }, []);

  // Announce when capacity opens (law of the jungle)
  const prevHadCapacity = useRef<boolean | null>(null);
  useEffect(() => {
    if (!worldId) return;
    const had = prevHadCapacity.current;
    const hasCapacity = activeHumans < MAX_HUMAN_PLAYERS;
    prevHadCapacity.current = hasCapacity;
    // Announce only on transition to having capacity
    if (had === false && hasCapacity) {
      // quick beep via WebAudio
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.value = 0.05;
        o.connect(g); g.connect(ctx.destination);
        o.start();
        setTimeout(() => { try { o.stop(); ctx.close(); } catch {} }, 180);
      } catch {}
      // TTS announcement
      try {
        const synth = window.speechSynthesis;
        const utter = new SpeechSynthesisUtterance('A slot just opened. Tap take slot to join.');
        utter.rate = 1.05;
        utter.pitch = 1.0;
        synth.speak(utter);
      } catch {}
    }
    if (had === null) {
      // initialize without announcing on first render
      prevHadCapacity.current = hasCapacity;
    }
  }, [activeHumans, worldId]);

  const convex = useConvex();
  const joinPool = async () => {
    if (!worldId) return;
    try { await convex.mutation(api.waitingPool.joinWaitingPool, { worldId }); } catch {}
  };
  const leavePool = async () => {
    if (!worldId) return;
    try { await convex.mutation(api.waitingPool.leaveWaitingPool, { worldId }); } catch {}
  };

  const container = (
    <div
      className="pointer-events-auto bg-brown-800 text-white rounded-lg shadow-lg cursor-pointer transition-all duration-300 z-50"
      onClick={() => setIsExpanded((v) => !v)}
      style={{ width: isExpanded ? (window.innerWidth >= 640 ? 240 : 260) : undefined }}
    >
      {/* Desktop (sm and up): original horizontal expanded layout */}
      <div className={`hidden sm:flex items-center ${isExpanded ? 'p-2' : 'sm:p-2'}`}>
        {!isExpanded && (
          <div className="w-12 h-12 flex items-center justify-center">
            <span role="img" aria-label="pool" className="text-2xl">🏊</span>
          </div>
        )}
        {isExpanded && (
          <div className="flex-1">
            <div className="text-xs uppercase tracking-widest text-white/70">Player Pools</div>
            {!isAuthenticated && showLoginMode ? (
              <div className="mt-1 text-sm">
                <div className="font-display text-lg">Join to get notified</div>
                <div className="opacity-80 text-xs">Login then tap Wait to be notified when slots open.</div>
              </div>
            ) : (
              <>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="relative rounded bg-black/30 p-2 text-center overflow-hidden">
                    <div className="absolute inset-0"><ParticleCanvas count={activeHumans} color="#fbbf24" /></div>
                    <div className="relative">
                      <div className="text-xs opacity-80">Active</div>
                      <div className="text-2xl font-display text-yellow-300">{activeHumans}</div>
                    </div>
                  </div>
                  <div className="relative rounded bg-black/30 p-2 text-center overflow-hidden">
                    <div className="absolute inset-0"><ParticleCanvas count={poolSize} color="#60a5fa" /></div>
                    <div className="relative">
                      <div className="text-xs opacity-80">Pool <span title="Waiting pool (not a queue) — the law of the jungle to take free space as it comes">ℹ️</span></div>
                      <div className="text-2xl font-display text-blue-300">{poolSize}</div>
                    </div>
                  </div>
                </div>
                {/* Controls on next line, aligned right */}
                <div className="mt-2 w-full flex justify-end" onClick={(e) => e.stopPropagation()}>
                  {!isAuthenticated && showLoginMode ? (
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    <div className="flex items-center justify-center">
                      <div className="button text-white text-sm" style={{ cursor: 'pointer' }} onClick={() => setModalOpen(true)}>
                        <span>Login</span>
                      </div>
                    </div>
                  ) : myPool?.inPool ? (
                    <div className="flex items-center gap-3">
                      <button className="text-sm underline opacity-90 hover:opacity-100" onClick={leavePool}>Leave</button>
                      <button className="text-sm underline opacity-90 hover:opacity-100" onClick={() => setModalOpen(true)}>
                        <span className="max-w-[140px] truncate inline-block align-bottom">{userPlayer?.name ?? 'Details'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button className="text-sm underline opacity-90 hover:opacity-100" onClick={joinPool}>Wait</button>
                      <button className="text-sm underline opacity-90 hover:opacity-100" onClick={() => setModalOpen(true)}>
                        <span className="max-w-[140px] truncate inline-block align-bottom">{userPlayer?.name ?? 'Details'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {/* Side controls are hidden when expanded; kept only for collapsed desktop if needed */}
        <div className={`ml-2 ${isExpanded ? 'hidden' : ''}`} onClick={(e) => e.stopPropagation()}>
          {!isAuthenticated && showLoginMode ? (
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            <div className="flex items-center justify-center">
              <div className="button text-white text-sm" style={{ cursor: 'pointer' }} onClick={() => setModalOpen(true)}>
                <span>Login</span>
              </div>
            </div>
          ) : myPool?.inPool ? (
            <div className="flex items-center gap-2">
              <button className="text-xs underline opacity-90 hover:opacity-100" onClick={leavePool}>Leave</button>
              <button className="text-xs underline opacity-90 hover:opacity-100" onClick={() => setModalOpen(true)}><span className="max-w-[100px] truncate inline-block align-bottom">{userPlayer?.name ?? 'Details'}</span></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button className="text-xs underline opacity-90 hover:opacity-100" onClick={joinPool}>Wait</button>
              <button className="text-xs underline opacity-90 hover:opacity-100" onClick={() => setModalOpen(true)}><span className="max-w-[100px] truncate inline-block align-bottom">{userPlayer?.name ?? 'Details'}</span></button>
            </div>
          )}
        </div>
      </div>
      {/* Mobile: compact vertical */}
      <div className={`sm:hidden flex flex-col ${isExpanded ? 'p-2' : 'sm:p-2'}`}>
        {!isExpanded && (
          <div className="w-12 h-12 flex items-center justify-center">
            <span role="img" aria-label="pool" className="text-2xl">🏊</span>
          </div>
        )}
        {isExpanded && (
          <div className="flex flex-col gap-2">
            <div className="text-xs uppercase tracking-widest text-white/70">Player Pools</div>
            {!isAuthenticated && showLoginMode ? (
              <div className="text-sm">
                <div className="font-display text-lg">Join to get notified</div>
                <div className="opacity-80 text-xs">Login then tap Wait to be notified when slots open.</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="relative rounded bg-black/30 px-3 py-2 text-center overflow-hidden min-w-[140px]">
                  <div className="absolute inset-0"><ParticleCanvas count={activeHumans} color="#fbbf24" /></div>
                  <div className="relative">
                    <div className="text-xs opacity-80">Active</div>
                    <div className="text-2xl font-display text-yellow-300">{activeHumans}</div>
                  </div>
                </div>
                <div className="relative rounded bg-black/30 px-3 py-2 text-center overflow-hidden min-w=[140px]">
                  <div className="absolute inset-0"><ParticleCanvas count={poolSize} color="#60a5fa" /></div>
                  <div className="relative">
                    <div className="text-xs opacity-80">Pool <span title="Waiting pool (not a queue) — the law of the jungle to take free space as it comes">ℹ️</span></div>
                    <div className="text-2xl font-display text-blue-300">{poolSize}</div>
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
              {!isAuthenticated && showLoginMode ? (
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                <div className="flex items-center justify-center">
                  <div className="button text-white text-sm" style={{ cursor: 'pointer' }} onClick={() => setModalOpen(true)}>
                    <span>Login</span>
                  </div>
                </div>
              ) : myPool?.inPool ? (
                <div className="flex flex-col items-end gap-1">
                  <button className="text-xs underline opacity-90 hover:opacity-100" onClick={leavePool}>Leave</button>
                  <button className="text-xs underline opacity-90 hover:opacity-100" onClick={() => setModalOpen(true)}>
                    <span className="max-w-[160px] truncate inline-block align-bottom">{userPlayer?.name ?? 'Details'}</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <button className="text-xs underline opacity-90 hover:opacity-100" onClick={joinPool}>Wait</button>
                  <button className="text-xs underline opacity-90 hover:opacity-100" onClick={() => setModalOpen(true)}>
                    <span className="max-w-[160px] truncate inline-block align-bottom">{userPlayer?.name ?? 'Details'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="absolute top-4 right-4 z-50" onClick={(e) => e.stopPropagation()}>
        {container}
      </div>
      <ReactModal
        isOpen={modalOpen}
        onRequestClose={() => setModalOpen(false)}
        ariaHideApp={false}
        style={{
          overlay: { backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 60 },
          content: {
            inset: '50% auto auto 50%', transform: 'translate(-50%, -50%)',
            maxWidth: 420, border: '10px solid rgb(23,20,33)', background: 'rgb(35,38,58)', color: 'white', borderRadius: 0,
          },
        }}
      >
        <div className="font-body">
          <div className="text-2xl font-display mb-2">Player Pools</div>
          <div className="text-sm opacity-90">{isAuthenticated ? `Welcome, ${userPlayer?.name ?? 'Player'}` : 'Login to join the town and start chatting with AI citizens.'}</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded bg-black/30 p-2 text-center">
              <div className="text-xs opacity-80">Active</div>
              <div className="text-3xl font-display text-yellow-300">{activeHumans}</div>
              <div className="mt-1 h-16"><ParticleCanvas count={activeHumans} color="#fbbf24" /></div>
            </div>
            <div className="rounded bg-black/30 p-2 text-center">
              <div className="text-xs opacity-80">Pool</div>
              <div className="text-3xl font-display text-blue-300">{poolSize}</div>
              <div className="mt-1 h-16"><ParticleCanvas count={poolSize} color="#60a5fa" /></div>
            </div>
          </div>
          {!isAuthenticated && (
            <div className="mt-4">
              {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
              {/* @ts-ignore */}
              <div className="button text-white text-lg" style={{ cursor: 'pointer' }}>
                <span>Login</span>
              </div>
            </div>
          )}
        </div>
      </ReactModal>
    </>
  );
}
