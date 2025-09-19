
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { PixiGame } from './PixiGame';

import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useQuery } from 'convex/react';
import PlayerDetails from './PlayerDetails.tsx';
import { api } from '../../convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import closeImg from '../../assets/close.svg';
import { useServerGame } from '../hooks/serverGame.ts';
import { Viewport } from 'pixi-viewport';
import * as PIXI from 'pixi.js';

// Fix: Cast `import.meta` to `any` to access `env` without a type error.
export const SHOW_DEBUG_UI = !!(import.meta as any).env.VITE_SHOW_DEBUG_UI;

export default function Game({
  isExpanded,
  setIsExpanded,
  isChaseActive,
  isMeetingActive,
  isPartyActive,
}: {
  isExpanded: boolean;
  setIsExpanded: Dispatch<SetStateAction<boolean>>;
  isChaseActive: boolean;
  isMeetingActive: boolean;
  isPartyActive: boolean;
}) {
  const convex = useConvex();
  const [selectedElement, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();
  const [gameWrapperRef, { width = 0, height = 0 }] = useElementSize();

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);
  // Fix: Correctly type viewportRef with Viewport from pixi-viewport and initialize.
  const viewportRef = useRef<Viewport | undefined>(undefined);

  // Send a periodic heartbeat to our world to keep it alive.
  useWorldHeartbeat(worldId);

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);
  const scrollViewRef = useRef<HTMLDivElement>(null);

  const userPlayerDoc = useQuery(api.players.user, worldId ? { worldId } : 'skip');
  const userPlayer =
    userPlayerDoc && game ? game.world.players.get(userPlayerDoc.id as GameId<'players'>) : undefined;

  useEffect(() => {
    // When the user joins, select them and pan the camera over.
    if (userPlayer && !selectedElement) {
      setSelectedElement({ kind: 'player', id: userPlayer.id });
    }
    // Only run this when the user player joins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPlayer?.id]);

  // Debug view to diagnose rendering issues.
  const debugInfo = {
    worldStatus: JSON.stringify(worldStatus),
    worldId: worldId ?? 'undefined',
    engineId: engineId ?? 'undefined',
    game: game ? 'loaded' : 'undefined',
    worldState: worldState ? 'loaded' : 'undefined',
    historicalTime: historicalTime === undefined ? 'undefined' : historicalTime,
  };

  const hasPannedForChase = useRef(false);
  useEffect(() => {
    if (!isChaseActive) {
      hasPannedForChase.current = false;
      return;
    }
    if (!game || hasPannedForChase.current) return;
    const ms13Desc = [...game.playerDescriptions.values()].find((d) => d.name === 'MS-13');
    if (!ms13Desc) return;
    const ms13 = game.world.players.get(ms13Desc.playerId as GameId<'players'>);
    const vp = viewportRef.current;
    if (ms13 && vp) {
      hasPannedForChase.current = true;
      vp.animate({
        position: new PIXI.Point(
          ms13.position.x * game.worldMap.tileDim,
          ms13.position.y * game.worldMap.tileDim,
        ),
        scale: 1,
        time: 1000,
      });
    }
  }, [isChaseActive, game]);

  const hasPannedForMeeting = useRef(false);
  useEffect(() => {
    if (!isMeetingActive) {
      hasPannedForMeeting.current = false;
      return;
    }
    if (hasPannedForMeeting.current) return;
    const vp = viewportRef.current;
    if (vp) {
      hasPannedForMeeting.current = true;
      vp.animate({
        // Pan to center of designated meeting area ~ (47,22)
        position: new PIXI.Point(47 * 32, 22 * 32),
        scale: 1.2,
        time: 2000,
      });
    }
  }, [isMeetingActive]);

  if (!worldId || !engineId || !game || historicalTime === undefined) {
    return (
      <div className="absolute inset-0 z-10 bg-black/80 text-white p-4 font-mono text-xs overflow-auto">
        <h2 className="text-lg font-bold mb-2">Debug: Waiting for data...</h2>
        <pre className="whitespace-pre-wrap">{JSON.stringify(debugInfo, null, 2)}</pre>
        <p className="mt-4 opacity-70">
          The game canvas will not render until all values above are loaded (not 'undefined' or
          'null'). If this persists, check the Convex dashboard for your production deployment to
          ensure the world has been initialized (run `npx convex run init --prod`).
        </p>
      </div>
    );
  }
  return (
    <>
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      <div
        className={`mx-auto w-full grid lg:grow max-w-[1400px] game-frame box-content ${
          isExpanded
            ? 'h-[700px] lg:grid-cols-[1fr_auto]'
            : 'h-[480px] grid-rows-[240px_1fr] lg:grid-rows-[1fr] lg:grid-cols-[1fr_auto]'
        }`}
      >
        {/* Game area */}
        <div
          className="relative overflow-hidden bg-brown-900 cursor-pointer"
          ref={gameWrapperRef}
          onClick={() => !isExpanded && setIsExpanded(true)}
        >
          {isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
              className="absolute top-4 right-4 z-10 bg-brown-800 rounded-full p-2"
            >
              <img src={closeImg} alt="Close" className="w-6 h-6" />
            </button>
          )}
          <div className="absolute inset-0">
            <div className="container">
              {width > 0 && height > 0 && (
                <Stage
                  width={width}
                  height={height}
                  options={{ backgroundColor: 0x7ab5ff, preserveDrawingBuffer: true }}
                >
                  {/* Re-propagate context because contexts are not shared between renderers.
https://github.com/michalochman/react-pixi-fiber/issues/145#issuecomment-531549215 */}
                  <ConvexProvider client={convex}>
                    <PixiGame
                      game={game}
                      worldId={worldId}
                      engineId={engineId}
                      width={width}
                      height={height}
                      historicalTime={historicalTime}
                      setSelectedElement={setSelectedElement}
                      viewportRef={viewportRef}
                      isPartyActive={isPartyActive}
                      isMeetingActive={isMeetingActive}
                    />
                  </ConvexProvider>
                </Stage>
              )}
            </div>
          </div>
        </div>
        {/* Right column area */}
        <div
          className={`flex-col overflow-y-auto custom-scroll shrink-0 px-4 py-6 sm:px-6 lg:w-96 xl:pr-6 border-t-8 sm:border-t-0 sm:border-l-8 border-brown-900 bg-brown-800 text-brown-100 ${
            isExpanded ? 'hidden lg:flex' : 'flex'
          }`}
          ref={scrollViewRef}
        >
          <PlayerDetails
            worldId={worldId}
            engineId={engineId}
            game={game}
            playerId={selectedElement?.id}
            setSelectedElement={setSelectedElement}
            scrollViewRef={scrollViewRef}
            isMeetingActive={isMeetingActive}
          />
        </div>
      </div>
    </>
  );
}
