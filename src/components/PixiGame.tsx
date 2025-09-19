
import * as PIXI from 'pixi.js';
import { Container, Graphics, Text, useApp, useTick } from '@pixi/react';
import { Player, SelectElement } from './Player.tsx';
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
import { PartyEffects } from './PartyEffects.tsx';

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
  viewportRef: React.MutableRefObject<Viewport | undefined>;
}) => {
  const pixiApp = useApp();

  const humanPlayerDoc = useQuery(api.players.user, { worldId: props.worldId });
  const humanPlayerId = humanPlayerDoc?.id;

  const moveTo = useSendInput(props.engineId, 'moveTo');

  const dragStart = useRef<{ screenX: number; screenY: number } | null>(null);
  const onMapPointerDown = (e: any) => {
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
      const [dx, dy] = [screenX - e.screenX, screenY - e.screenY];
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
  const playersMap = new Map(players.map((p) => [String(p.id), p]));
  const recentTransactions = useQuery(api.economy.getRecentTransactions);
  const [floatingTexts, setFloatingTexts] = useState<any[]>([]);
  const shownTxIdsRef = useRef<Set<string>>(new Set());
  const meetingNotes = useQuery(api.world.getLatestMeetingNotes, props.worldId ? { worldId: props.worldId } : 'skip');
  const vState = useQuery(api.world.villageState, {});

  useEffect(() => {
    if (!recentTransactions) return;
    for (const transaction of recentTransactions) {
      if (shownTxIdsRef.current.has(transaction._id)) continue;
      const player = playersMap.get(String(transaction.playerId));
      if (!player) continue;
      shownTxIdsRef.current.add(transaction._id);
      if (shownTxIdsRef.current.size > 500) {
        const it = shownTxIdsRef.current.values();
        for (let i = 0; i < 100; i++) {
          const v = it.next();
          if (v.done) break;
          shownTxIdsRef.current.delete(v.value);
        }
      }
      const isPositive = transaction.amount >= 0;
      const signed = `${isPositive ? '+' : ''}${transaction.amount.toFixed(4)} BTC`;
      const color = isPositive ? '#22c55e' : '#ef4444';
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

  useEffect(() => {
    if (!props.isMeetingActive) return;
    const t = setTimeout(() => {
      setFloatingTexts([]);
      shownTxIdsRef.current.clear();
    }, 6000);
    return () => clearTimeout(t);
  }, [props.isMeetingActive]);

  useEffect(() => {
    if (props.isPartyActive) return;
    const t = setTimeout(() => {
      setFloatingTexts([]);
      shownTxIdsRef.current.clear();
    }, 10000);
    return () => clearTimeout(t);
  }, [props.isPartyActive]);

  const [partyThoughts, setPartyThoughts] = useState<{ id: string; text: string; key: string }[]>([]);
  useEffect(() => {
    if (!props.isPartyActive) {
      setPartyThoughts([]);
      return;
    }
    if (players.length === 0) return;

    const phrases = [
      '🔥 vibes!', '🥃 one more?', '💃 nice moves', '😂 LMAO did u see?', '🎶 banger', '👀 Lucky WTF!?😂',
    '😵‍💫 getting dizzy', '📸 selfie?', '🤑 booze pricey!', '👀 ICE got moves', '🤫 MS-13 DJ?', 'Bezos ugly ass ***', '🤫 ****!'
    ];

    const interval = setInterval(() => {
      setPartyThoughts((currentThoughts) => {
        const now = Date.now();
        const activeIds = new Set(currentThoughts.map(t => t.id));
        const availablePlayers = players.filter(p => !activeIds.has(p.id));
        
        if (availablePlayers.length > 0 && currentThoughts.length < 3) {
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
        return [...currentThoughts];
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [props.isPartyActive, players.length]);

  const humanPlayer = humanPlayerId ? props.game.world.players.get(humanPlayerId as GameId<'players'>) : undefined;

  useEffect(() => {
    hasPanned.current = false;
    panAttempts.current = 0;
  }, [humanPlayerId]);

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
  }, [humanPlayer?.id]);

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
          (SHOW_DEBUG_UI || p.id === humanPlayerId) && (
            <DebugPath key={`path-${p.id}`} player={p} tileDim={tileDim} />
          ),
      )}
      {lastDestination && <PositionIndicator destination={lastDestination} tileDim={tileDim} />}
      {players.map((p) => (
        <Player
          key={`player-${p.id}`}
          game={props.game}
          player={p}
          isViewer={p.id === humanPlayerId}
          onClick={props.setSelectedElement}
          historicalTime={props.historicalTime}
        />
      ))}
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
       {props.isPartyActive && <PartyEffects isPartyActive={props.isPartyActive} tileDim={tileDim} />}
      <OverlayActors tileDim={tileDim} />
      {floatingTexts.map((ft) => (
        <FloatingText key={ft.key} {...ft} />
      ))}
    </PixiViewport>
  );
}; 
function BukeleMeetingBubble({ game, tileDim, text }: { game: ServerGame; tileDim: number; text: string }) {
  const bukeleDesc = [...game.playerDescriptions.values()].find((d) => d.name === 'President Bukele');
  if (!bukeleDesc) return null;
  const bukele = game.world.players.get(bukeleDesc.playerId as any);
  if (!bukele) return null;
  const x = bukele.position.x * tileDim + tileDim / 2;
  const y = bukele.position.y * tileDim - tileDim;
  const boxWidth = tileDim * 8;
  const padding = 4;

  const [visibleChars, setVisibleChars] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    setVisibleChars(0);
    setScrollY(0);
  }, [text]);

  useEffect(() => {
    const speed = 35;
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

  const textRef = useRef<PIXI.Text | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(Math.floor(tileDim * 2));
  useEffect(() => {
    const h = (textRef.current as any)?.height ?? Math.floor(tileDim * 1.2);
    const minH = Math.floor(tileDim * 1.6);
    const maxH = Math.floor(tileDim * 3.0);
    setBubbleHeight(Math.max(minH, Math.min(maxH, h + padding * 2)));
  }, [visibleChars, tileDim]);

  const style = new PIXI.TextStyle({
    fontSize: Math.floor(tileDim * 0.5),
    fill: '#000000',
    wordWrap: true,
    wordWrapWidth: boxWidth - padding * 2,
    align: 'left',
  }) as any;

  return (
    <Container x={0} y={0} eventMode="none" interactive={false} interactiveChildren={false}>
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

function OverlayActors({ tileDim }: { tileDim: number }) {
  const app = useApp();
  const tRef = useRef(0);
  const [, force] = useState(0);
  useEffect(() => {
    if (!app || !(app as any).ticker) return;
    const tick = (deltaTime: number) => {
      tRef.current += deltaTime / 60;
      force((v) => v + 1);
    };
    app.ticker.add(tick);
    return () => {
      try { app.ticker.remove(tick); } catch {}
    };
  }, [app]);

  const crocs = [
    { x: 31, y: 33, id: 'c1' },
    { x: 30, y: 37, id: 'c2' },
  ];
  const statue = { x: 42, y: 10, id: 's1' };

  return (
    <Container>
      {crocs.map((c, idx) => (
        <CrocActor key={c.id} tileX={c.x} tileY={c.y} tileDim={tileDim} phaseOffset={idx * Math.PI / 2} />
      ))}
      <EmojiActor tileX={statue.x} tileY={statue.y} tileDim={tileDim} emoji="🗽" />
    </Container>
  );
}

function EmojiActor({ tileX, tileY, tileDim, emoji }: { tileX: number; tileY: number; tileDim: number; emoji: string }) {
  const x = tileX * tileDim + tileDim / 2;
  const y = tileY * tileDim + tileDim / 2;
  return (
    <Text
      text={emoji}
      anchor={0.5}
      x={x}
      y={y}
      style={new PIXI.TextStyle({ fontSize: Math.floor(tileDim * 1.4), stroke: '#000000', strokeThickness: 3 }) as any}
    />
  );
}

function CrocActor({ tileX, tileY, tileDim, phaseOffset = 0 }: { tileX: number; tileY: number; tileDim: number; phaseOffset?: number }) {
  const app = useApp();
  const tRef = useRef(0);
  const [hover, setHover] = useState(false);
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!app || !(app as any).ticker) return;
    const tick = (deltaTime: number) => {
      tRef.current += deltaTime / 60;
      rerender((v) => v + 1);
    };
    app.ticker.add(tick);
    return () => { try { app.ticker.remove(tick); } catch {} };
  }, [app]);

  const amp = tileDim * 2;
  const baseX = tileX * tileDim + tileDim / 2;
  const baseY = tileY * tileDim + tileDim / 2;
  const w = tileDim;
  const t = tRef.current + phaseOffset;
  const x = baseX + Math.sin(t * 1.2) * amp;
  const y = baseY + Math.cos(t * 0.8) * (tileDim * 0.2);
  const dx = Math.cos(t * 1.2);
  const facingRight = dx >= 0;
  const croc = '🐊';
  const bubbleText = 'tick... tock..';
  const bubbleYOffset = -tileDim * (1.4 + 0.1 * Math.sin(t * 2));

  return (
    <Container>
      <Text
        text={bubbleText}
        x={x}
        y={y + bubbleYOffset}
        anchor={0.5}
        style={new PIXI.TextStyle({ fontSize: Math.floor(tileDim * 0.7), fill: '#ffffff', stroke: '#000000', strokeThickness: 3 }) as any}
      />
      <Container
        x={x}
        y={y}
        interactive
        pointerover={() => setHover(true)}
        pointerout={() => setHover(false)}
      >
        <Container scale={{ x: facingRight ? 1 : -1, y: 1 }}>
          <Text text={croc} anchor={0.5} style={new PIXI.TextStyle({ fontSize: Math.floor(w * 1.2), stroke: '#000000', strokeThickness: 3 }) as any} />
        </Container>
        {hover && (
          <Text
            text={'i said, tick-tock mf'}
            x={0}
            y={-tileDim * 1.2}
            anchor={0.5}
            style={new PIXI.TextStyle({ fontSize: Math.floor(tileDim * 0.6), fill: '#ffe08a', stroke: '#000000', strokeThickness: 3 }) as any}
          />
        )}
      </Container>
    </Container>
  );
}
