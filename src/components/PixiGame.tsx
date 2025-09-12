import * as PIXI from 'pixi.js';
import { Container, Graphics, Text, useApp } from '@pixi/react';
import { Player, SelectElement } from './Player.tsx';
import { useEffect, useRef, useState } from 'react';
import { PixiStaticMap } from './PixiStaticMap.tsx';
import PixiViewport from './PixiViewport.tsx';
import { Viewport } from 'pixi-viewport';
import { Id } from '../../convex/_generated/dataModel';
import { GameId } from '../../convex/aiTown/ids';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api.js';
import { useSendInput } from '../hooks/sendInput.ts';
import { toastOnError } from '../toasts.ts';
import { DebugPath } from './DebugPath.tsx';
import { PositionIndicator } from './PositionIndicator.tsx';
import { FloatingText } from './FloatingText.tsx';
import { SHOW_DEBUG_UI } from './Game.tsx';
import { ServerGame } from '../hooks/serverGame.ts';

export const PixiGame = (props: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  historicalTime: number | undefined;
  width: number;
  height: number;
  setSelectedElement: SelectElement;
}) => {
  // PIXI setup.
  const pixiApp = useApp();
  const viewportRef = useRef<Viewport | undefined>();

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
    const viewport = viewportRef.current;
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
  const recentTransactions = useQuery(api.economy.getRecentTransactions);
  const [floatingTexts, setFloatingTexts] = useState<any[]>([]);

  useEffect(() => {
    if (recentTransactions) {
      for (const transaction of recentTransactions) {
        if (!floatingTexts.some((ft) => ft.key === transaction._id)) {
          const player = players.find((p) => p.id === transaction.playerId);
          if (player) {
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
        }
      }
    }
  }, [recentTransactions, players, floatingTexts, tileDim]);

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
      const vp = viewportRef.current;
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
    const vp = viewportRef.current as any;
    if (vp) {
      vp.sortableChildren = true;
    }
  }, []);

  return (
    <PixiViewport
      app={pixiApp}
      screenWidth={props.width}
      screenHeight={props.height}
      worldWidth={width * tileDim}
      worldHeight={height * tileDim}
      viewportRef={viewportRef}
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
        <Player
          key={`player-${p.id}`}
          game={props.game}
          player={p}
          isViewer={p.id === humanPlayerId}
          onClick={props.setSelectedElement}
          historicalTime={props.historicalTime}
        />
      ))}
      {/* Overlay actors: crocodiles and statue */}
      <OverlayActors tileDim={tileDim} />
      {floatingTexts.map((ft) => (
        <FloatingText key={ft.key} {...ft} />
      ))}
    </PixiViewport>
  );
}; 

export default PixiGame;

// --- Overlay Actors Layer ---
function OverlayActors({ tileDim }: { tileDim: number }) {
  const app = useApp();
  const tRef = useRef(0);
  const [, force] = useState(0);
  useEffect(() => {
    if (!app || !(app as any).ticker) return;
    const tick = (delta: number) => {
      tRef.current += delta / 60; // seconds-ish
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
      style={new PIXI.TextStyle({ fontSize: Math.floor(tileDim * 1.4), stroke: '#000000', strokeThickness: 3 })}
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
    const tick = (delta: number) => {
      tRef.current += delta / 60;
      rerender((v) => v + 1);
    };
    app.ticker.add(tick);
    return () => { try { app.ticker.remove(tick); } catch {} };
  }, [app]);

  const amp = tileDim * 2; // 2 tiles amplitude
  const baseX = tileX * tileDim + tileDim / 2;
  const baseY = tileY * tileDim + tileDim / 2;
  const w = tileDim;
  const t = tRef.current + phaseOffset;
  const x = baseX + Math.sin(t * 1.2) * amp;
  const y = baseY + Math.cos(t * 0.8) * (tileDim * 0.2); // tiny vertical wobble
  const dx = Math.cos(t * 1.2);
  const facingRight = dx >= 0;
  const croc = '🐊';
  const bubbleText = 'tick... tock..';
  const bubbleYOffset = -tileDim * (1.4 + 0.1 * Math.sin(t * 2));

  return (
    <Container>
      {/* Thought bubble text (animated) */}
      <Text
        text={bubbleText}
        x={x}
        y={y + bubbleYOffset}
        anchor={0.5}
        style={new PIXI.TextStyle({ fontSize: Math.floor(tileDim * 0.7), fill: '#ffffff', stroke: '#000000', strokeThickness: 3 })}
      />
      {/* Croc emoji with left/right facing via scaleX */}
      <Container
        x={x}
        y={y}
        interactive
        pointerover={() => setHover(true)}
        pointerout={() => setHover(false)}
      >
        <Container scale={{ x: facingRight ? 1 : -1, y: 1 }}>
          <Text text={croc} anchor={0.5} style={new PIXI.TextStyle({ fontSize: Math.floor(w * 1.2), stroke: '#000000', strokeThickness: 3 })} />
        </Container>
        {hover && (
          <Text
            text={'i said, tick-tock mf'}
            x={0}
            y={-tileDim * 1.2}
            anchor={0.5}
            style={new PIXI.TextStyle({ fontSize: Math.floor(tileDim * 0.6), fill: '#ffe08a', stroke: '#000000', strokeThickness: 3 })}
          />
        )}
      </Container>
    </Container>
  );
}
