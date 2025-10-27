import * as PIXI from 'pixi.js';
import { Container, Graphics, Text, useApp, useTick, Sprite, AnimatedSprite } from '@pixi/react';
import { PlayerComponent } from './Player.tsx'; // Fix: Renamed Player to PlayerComponent
import { useEffect, useRef, useState, useCallback } from 'react';
import { PixiStaticMap } from './PixiStaticMap.tsx';
import PixiViewport from './PixiViewport.tsx';
import { Viewport } from 'pixi-viewport';
import { Id } from '../../convex/_generated/dataModel';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api.js';
import { useSendInput } from '../hooks/sendInput.ts';
import { toastOnError } from '../toasts.ts';
import { DebugPath } from './DebugPath.tsx';
import { PositionIndicator } from './PositionIndicator.tsx';
import { FloatingText } from './FloatingText.tsx';
import { SHOW_DEBUG_UI } from './Game.tsx';
import { ServerGame } from '../hooks/serverGame.ts';
import { SelectElement } from './Player.tsx'; // Fix: Import SelectElement

export const PixiGame = (props: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  historicalTime: number | undefined;
  width: number;
  height: number;
  setSelectedElement: SelectElement;
  isPartyActive: boolean;
  isMeetingActive: boolean;
  // Fix: Add viewportRef to props
  viewportRef: React.MutableRefObject<Viewport | undefined>;
  openPaymentModal: React.Dispatch<any>; // Setter for paymentDetails state in App.tsx
  setIsPaymentModalOpen: React.Dispatch<React.SetStateAction<boolean>>; // Setter for payment modal open state in App.tsx
}) => {
  // PIXI setup.
  const pixiApp = useApp();
  // Fix: Remove local viewportRef, use the one from props
  // const viewportRef = useRef<Viewport | undefined>();

  const humanPlayerDoc = useQuery(api.players.user, { worldId: props.worldId });
  const humanPlayerId = humanPlayerDoc?.id;

  const moveTo = useSendInput(props.engineId, 'moveTo');

  // Interaction for clicking on the world to navigate.
  const dragStart = useRef<{ screenX: number; screenY: number } | null>(null);
  const onMapPointerDown = (e: any) => {
    // https://pixijs.download/dev/docs/PIXI.FederatedPointerEvent.html
    dragStart.current = { screenX: e.screenX, screenY: e.screenY };
  };

  const [lastDestination, setLastDestination] = useState<{
    x: number;
    y: number;
    t: number;
  } | null>(null);
  const onMapPointerUp = async (e: any) => {
    if (dragStart.current) {
      const { screenX, screenY } = dragStart.current;
      dragStart.current = null;
      const [dx, dy] = [screenX - e.screenX, e.screenY - e.screenY];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        console.log(`Skipping navigation on drag event (${dist}px)`);
        return;
      }
    }
    if (!humanPlayerId) {
      return;
    }
    const viewport = props.viewportRef.current;
    if (!viewport) {
      return;
    }
    const gameSpacePx = viewport.toWorld(e.screenX, e.screenY);
    const tileDim = props.game.worldMap.tileDim;
    const gameSpaceTiles = {
      x: gameSpacePx.x / tileDim,
      y: gameSpacePx.y / tileDim,
    };
    setLastDestination({ t: Date.now(), ...gameSpaceTiles });
    const roundedTiles = {
      x: Math.floor(gameSpaceTiles.x),
      y: Math.floor(gameSpaceTiles.y),
    };
    console.log(`Moving to ${JSON.stringify(roundedTiles)}`);
    await toastOnError(moveTo({ playerId: humanPlayerId, destination: roundedTiles }));
  };
  const { width, height, tileDim } = props.game.worldMap;
  const players = [...props.game.world.players.values()];
  // Key by string to avoid branded GameId type mismatches in lookups
  const playersMap = new Map(players.map((p) => [String(p.id), p]));
  // Fix: Pass an empty object for optional arguments when no other args are present
  const recentTransactions = useQuery(api.economy.getRecentTransactions, {} as any);
  const [floatingTexts, setFloatingTexts] = useState<any[]>([]);
  // Track which transaction IDs we've already displayed to avoid re-spawning old ones.
  const shownTxIdsRef = useRef<Set<string>>(new Set());
  // Fix: Pass an empty object for optional arguments when no other args are present
  const meetingNotes = useQuery(api.world.getLatestMeetingNotes as any, props.worldId ? { worldId: props.worldId } : 'skip');
  // Fix: Pass an empty object for optional arguments when no other args are present
  const vState = useQuery(api.world.villageState as any, {} as any);

  useEffect(() => {
    if (!recentTransactions) return;
    for (const transaction of recentTransactions) {
      if (shownTxIdsRef.current.has(transaction._id)) continue; // already shown
      const player = playersMap.get(String(transaction.playerId));
      if (!player) continue;
      shownTxIdsRef.current.add(transaction._id);
      // Prevent unbounded memory growth
      if (shownTxIdsRef.current.size > 500) {
        // Drop oldest ~100 entries
        const it = shownTxIdsRef.current.values();
        for (let i = 0; i < 100; i++) {
          const v = it.next();
          if (v.done) break;
          shownTxIdsRef.current.delete(v.value);
        }
      }
      const isPositive = transaction.amount >= 0;
      const signed = `${isPositive ? '+' : ''}${transaction.amount.toFixed(4)} BTC`;
      const color = isPositive ? '#22c55e' /* green-500 */ : '#ef4444' /* red-500 */;
      const newFloatingText = {
        key: transaction._id,
        x: player.position.x * tileDim + tileDim / 2,
        y: player.position.y * tileDim,
        text: signed,
        color,
        onComplete: () => {
          setFloatingTexts((prev) => prev.filter((ft) => ft.key !== transaction._id));
        },
      } as any;
      setFloatingTexts((prev) => [...prev, newFloatingText]);
    }
  }, [recentTransactions, tileDim]);

  // When meeting starts, flush any lingering floating texts after a short grace period
  useEffect(() => {
    if (!props.isMeetingActive) return;
    const t = setTimeout(() => {
      setFloatingTexts([]);
      shownTxIdsRef.current.clear();
    }, 6000); // 6s fallback flush
    return () => clearTimeout(t);
  }, [props.isMeetingActive]);

  // After party ends, flush any lingering floating texts as safety after 10s
  useEffect(() => {
    if (props.isPartyActive) return;
    const t = setTimeout(() => {
      setFloatingTexts([]);
      shownTxIdsRef.current.clear();
    }, 10000);
    return () => clearTimeout(t);
  }, [props.isPartyActive]);

  const [partyThoughts, setPartyThoughts] = useState<{ id: string; text: string; key: string }[]>([]);
  useTick((ticker) => { // Fix: Explicitly type ticker as Ticker
    if (!props.isPartyActive) return;

    // Logic to add new thoughts
    setPartyThoughts((currentThoughts) => {
      const now = Date.now();
      const activeIds = new Set(currentThoughts.map(t => t.id));
      const availablePlayers = players.filter(p => !activeIds.has(p.id));

      if (availablePlayers.length > 0 && currentThoughts.length < 3) {
        const phrases = [
          '🔥 vibes!', '🥃 one more?', '💃 nice moves', '😂 LMAO did u see?', '🎶 banger', '👀 Bob WTF!?',
          '😵‍💫 getting dizzy', '📸 selfie?', '🤑 booze pricey!', '👀 ICE got moves', '🤫 MS-13 DJ?',
        ];
        const numToAdd = Math.min(availablePlayers.length, Math.floor(Math.random() * 2) + 1);
        for (let i = 0; i < numToAdd; i++) {
          const playerIndex = Math.floor(Math.random() * availablePlayers.length);
          const player = availablePlayers.splice(playerIndex, 1)[0];
          const phrase = phrases[Math.floor(Math.random() * phrases.length)];
          currentThoughts.push({
            id: player.id,
            text: phrase,
            key: `${player.id}-${now}`,
          });
        }
      }
      // Remove old thoughts (e.g., after 10 seconds)
      const filteredThoughts = currentThoughts.filter(t => now - parseInt(t.key.split('-')[2]) < 10000);
      return filteredThoughts;
    });
  });

  const humanPlayer = humanPlayerId ? props.game.world.players.get(humanPlayerId as GameId<'players'>) : undefined;

  // If the signed-in human changes (join/leave), allow panning again
  useEffect(() => {
    hasPanned.current = false;
    panAttempts.current = 0;
  }, [humanPlayerId]);

  // Zoom on the user’s avatar when it is created — retry until viewport is ready.
  const hasPanned = useRef(false);
  const panAttempts = useRef(0);
  useEffect(() => {
    if (!humanPlayer || hasPanned.current) return;

    const tryPan = () => {
      const vp = props.viewportRef.current;
      if (vp) {
        vp.animate({
          position: new PIXI.Point(humanPlayer.position.x * tileDim, humanPlayer.position.y * tileDim),
          scale: 1.5,
          time: 600,
        });
        hasPanned.current = true;
        return;
      }
      if (panAttempts.current < 30) {
        panAttempts.current += 1;
        setTimeout(tryPan, 50);
      }
    };

    tryPan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [humanPlayer?.id]);

  // Ensure children can use zIndex if needed
  useEffect(() => {
    const vp = props.viewportRef.current as any;
    if (vp) {
      vp.sortableChildren = true;
    }
  }, [props.viewportRef]);

  return (
    <PixiViewport
      app={pixiApp}
      screenWidth={props.width}
      screenHeight={props.height}
      worldWidth={width * tileDim}
      worldHeight={height * tileDim}
      viewportRef={props.viewportRef}
    >
      <PixiStaticMap
        map={props.game.worldMap}
        onpointerup={onMapPointerUp}
        onpointerdown={onMapPointerDown}
      />
      {players.map(
        (p) =>
          // Only show the path for the human player in non-debug mode.
          (SHOW_DEBUG_UI || p.id === humanPlayerId) && (
            <DebugPath key={`path-${p.id}`} player={p} tileDim={tileDim} />
          ),
      )}
      {lastDestination && <PositionIndicator destination={lastDestination} tileDim={tileDim} />}
      {players.map((p) => (
        <PlayerComponent // Fix: Use renamed PlayerComponent
          key={`player-${p.id}`}
          game={props.game}
          player={p}
          isViewer={p.id === humanPlayerId}
          onClick={props.setSelectedElement}
          historicalTime={props.historicalTime}
          openPaymentModal={props.openPaymentModal} // Pass to Player
          setIsPaymentModalOpen={props.setIsPaymentModalOpen} // Pass to Player
        />
      ))}
      {/* Party thought bubbles overlay - now using FloatingText for reliability */}
      {props.isPartyActive &&
        partyThoughts.map((pt) => {
          const p = players.find((pp) => pp.id === pt.id);
          if (!p) return null;
          return (
            <FloatingText
              key={pt.key}
              x={p.position.x * tileDim + tileDim / 2}
              y={p.position.y * tileDim}
              text={pt.text}
              color={'#FFFFFF'}
              withBackground={true}
              onComplete={() => {
                setPartyThoughts((prev) => prev.filter((thought) => thought.key !== pt.key));
              }}
            />
          );
        })}
      {props.isMeetingActive && (
        <BukeleMeetingBubble
          game={props.game}
          tileDim={tileDim}
          text={
            (vState as any)?.meeting?.summary || (meetingNotes && (meetingNotes as any).description) || 'Gathering in the plaza…'
          }
        />
      )}
       {props.isPartyActive && <PartyLights tileDim={tileDim} />}
      {/* Overlay actors: crocodiles and statue */}
      <OverlayActors tileDim={tileDim} />
      {floatingTexts.map((ft) => (
        <FloatingText key={ft.key} {...ft} />
      ))}
    </PixiViewport>
  );
}; 
function BukeleMeetingBubble({ game, tileDim, text }: { game: ServerGame; tileDim: number; text: string }) {
  // Find Bukele's player position
  const bukeleDesc = [...game.playerDescriptions.values()].find((d) => d.name === 'President Bukele');
  if (!bukeleDesc) return null;
  const bukele = game.world.players.get(bukeleDesc.playerId as any);
  if (!bukele) return null;
  const x = bukele.position.x * tileDim + tileDim / 2;
  const y = bukele.position.y * tileDim - tileDim; // above head
  const boxWidth = tileDim * 8;
  const padding = 4; // minimal padding

  // Typewriter + auto-scroll state
  const [visibleChars, setVisibleChars] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    setVisibleChars(0);
    setScrollY(0);
  }, [text]);

  useEffect(() => {
    const speed = 35; // chars per second
    let raf: number;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setVisibleChars((c) => Math.min(text.length, c + Math.max(1, Math.floor(speed * dt))));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text]);

  // Measure text to auto-size bubble height within bounds
  const textRef = useRef<PIXI.Text | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(Math.floor(tileDim * 2));
  useEffect(() => {
    const h = (textRef.current as any)?.height ?? Math.floor(tileDim * 1.2);
    const minH = Math.floor(tileDim * 1.6);
    const maxH = Math.floor(tileDim * 3.0);
    setBubbleHeight(Math.max(minH, Math.min(maxH, h + padding * 2)));
  }, [visibleChars, tileDim]);

  const style = new PIXI.TextStyle({
    fontSize: Math.floor(tileDim * 0.4),  // Reduced from 0.5 to 0.4
    fill: '#000000',
    wordWrap: true,
    wordWrapWidth: boxWidth - padding * 2,
    breakWords: true,
    fontFamily: 'Arial',
    fontWeight: 'normal',
    lineHeight: Math.floor(tileDim * 0.5),
    align: 'left',
  }) as any;

  return (
    <Container x={0} y={0} eventMode="none" interactive={false} interactiveChildren={false}>
      {/* Bubble background */}
      <Graphics
        x={x}
        y={y}
        draw={(g) => {
          g.clear();
          g.beginFill(0xffffff, 0.95);
          g.lineStyle(2, 0x333333, 1);
          g.drawRoundedRect(-boxWidth / 2 - padding, -bubbleHeight - padding, boxWidth + padding * 2, bubbleHeight + padding * 2, 8);
          g.endFill();
        }}
      />
      {/* Text with simple typewriter effect */}
      <Text
        ref={(t) => {
          textRef.current = (t as any) ?? null;
        }}
        text={(text || ' ').slice(0, visibleChars)}
        x={x - boxWidth / 2 + padding}
        y={y - bubbleHeight + padding}
        style={style}
        eventMode="none"
      />
    </Container>
  );
}
const PartyLights = ({ tileDim }: { tileDim: number }) => {
  const [t, setT] = useState(0);
  useTick((ticker: PIXI.Ticker) => setT((t) => t + ticker.deltaMS / 1000)); // Fix: Explicitly type ticker as Ticker

  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      const partyCenterX = (40 + 51) / 2 * tileDim;
      const partyCenterY = (9 + 14) / 2 * tileDim;
      const radius = 8 * tileDim;
      
      const time = t / 30; // Slow down the effect
      
      // Pulsating light effect
      const alpha = 0.2 + (Math.sin(time) * 0.5 + 0.5) * 0.2;
      const scale = 1.0 + (Math.sin(time * 0.7) * 0.5 + 0.5) * 0.1;

      g.beginFill(0xffcc00, alpha);
      g.drawCircle(partyCenterX, partyCenterY, radius * scale);
      g.endFill();

    },
    [t, tileDim],
  );

  // Ensure party lights never capture input; keep them visually above but input-transparent
  return <Graphics draw={draw} eventMode="none" interactive={false} interactiveChildren={false} />;
};

// On-map label showing the current party track (reads localStorage broadcast from MusicButton)
function PartyNowPlaying({ tileDim }: { tileDim: number }) {
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        setTitle(localStorage.getItem('partyNowPlaying'));
      } catch {}
    };
    read();
    const iv = setInterval(read, 1000);
    return () => clearInterval(iv);
  }, [title]);
  if (!title) return null;
  const partyCenterX = ((40 + 51) / 2) * tileDim;
  const partyCenterY = ((9 + 14) / 2) * tileDim - tileDim * 2.2;
  return (
    <Container x={partyCenterX} y={partyCenterY} eventMode="none">
      <Graphics
        draw={(g) => {
          g.clear();
          const w = tileDim * 6;
          const h = Math.floor(tileDim * 0.9);
          g.beginFill(0x000000, 0.55);
          g.drawRoundedRect(-w / 2, -h / 2, w, h, 8);
          g.endFill();
        }}
      />
      <Text
        text={`Now Playing: ${title}`}
        anchor={0.5}
        style={new PIXI.TextStyle({ fontSize: Math.floor(tileDim * 0.45), fill: '#ffffff' }) as any}
      />
    </Container>
  );
}

// Fix: Define OverlayActors component
function OverlayActors({ tileDim }: { tileDim: number }) {
  return (
    <>
      {/* Crocodiles near (31,33), (30,37) */}
      <Sprite
        texture={PIXI.Texture.from('/assets/spritesheets/crocodile.png')}
        x={31 * tileDim + 8}
        y={33 * tileDim + 8}
        anchor={0.5}
        scale={0.8}
      />
      <Sprite
        texture={PIXI.Texture.from('/assets/spritesheets/crocodile.png')}
        x={30 * tileDim + 8}
        y={37 * tileDim + 8}
        anchor={0.5}
        scale={0.8}
        alpha={0.7}
      />
      {/* Statue at (42,10) */}
      <Sprite
        texture={PIXI.Texture.from('/assets/spritesheets/statue.png')}
        x={42 * tileDim}
        y={10 * tileDim - 10} // Adjusted Y to place on ground
        anchor={0.5}
        scale={1.2}
        zIndex={1} // Ensure it's above players
      />
    </>
  );
}