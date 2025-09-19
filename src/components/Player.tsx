import { Character } from './Character.tsx';
import { Text, Graphics } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { orientationDegrees } from '../../convex/util/geometry.ts';
import { characters } from '../../data/characters.ts';
import { toast } from 'react-toastify';
import { Player as ServerPlayer } from '../../convex/aiTown/player.ts';
import { GameId } from '../../convex/aiTown/ids.ts';
import { Id } from '../../convex/_generated/dataModel';
import { Location, locationFields, playerLocation } from '../../convex/aiTown/location.ts';
import { useHistoricalValue } from '../hooks/useHistoricalValue.ts';
import { useCallback } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { PlayerDescription } from '../../convex/aiTown/playerDescription.ts';
import { WorldMap } from '../../convex/aiTown/worldMap.ts';
import { ServerGame } from '../hooks/serverGame.ts';

export type SelectElement = (element?: { kind: 'player'; id: GameId<'players'> }) => void;

const logged = new Set<string>();

export const Player = ({
  game,
  isViewer,
  player,
  onClick,
  historicalTime,
}: {
  game: ServerGame;
  isViewer: boolean;
  player: ServerPlayer;

  onClick: SelectElement;
  historicalTime?: number;
}) => {
  const playerDescription = game.playerDescriptions.get(player.id);
  const playerCharacter = playerDescription?.character;
  if (!playerCharacter) {
    throw new Error(`Player ${player.id} has no character`);
  }
  const character = characters.find((c) => c.name === playerCharacter);

  const locationBuffer = game.world.historicalLocations?.get(player.id);
  const historicalLocation = useHistoricalValue<Location>(
    locationFields,
    historicalTime,
    playerLocation(player),
    locationBuffer,
  );
  if (!character) {
    if (!logged.has(playerCharacter)) {
      logged.add(playerCharacter);
      toast.error(`Unknown character ${playerCharacter}`);
    }
    return null;
  }

  if (!historicalLocation) {
    return null;
  }

  const isSpeaking = !![...game.world.conversations.values()].find(
    (c) => c.isTyping?.playerId === player.id,
  );
  const isThinking =
    !isSpeaking &&
    !![...game.world.agents.values()].find(
      (a) => a.playerId === player.id && !!a.inProgressOperation,
    );
  const isDancing =
    !!player.activity?.description.includes('Partying') &&
    (player.activity.until > (historicalTime ?? Date.now()));
  const tileDim = game.worldMap.tileDim;
  const historicalFacing = { dx: historicalLocation.dx, dy: historicalLocation.dy };
  const portfolio = useQuery(api.economy.getPortfolio, { playerId: player.id });
  const isBukele = playerDescription?.name === 'President Bukele';
  const isICE = playerDescription?.name === 'ICE';
  const isMS13 = playerDescription?.name === 'MS-13';
  // Quick reaction: show 🤑 briefly when a positive transaction lands for this player.
  const recentTransactions = useQuery(api.economy.getRecentTransactions);
  const now = Date.now();
  const hasRecentPositive = !!recentTransactions?.some(
    (t: any) => t.playerId === player.id && t.amount > 0 && t.timestamp > now - 5000,
  );
  // Determine displayed emoji priority:
  // 1) Active activity emoji
  // 2) Recent positive tx reaction
  // 3) Permanent fallbacks: Bukele crown / ICE police / MS-13 robber
  const activeEmoji =
    player.activity && player.activity.until > (historicalTime ?? Date.now())
      ? player.activity?.emoji
      : undefined;
  const displayEmoji =
    activeEmoji ??
    (hasRecentPositive
      ? '🤑'
      : isBukele
      ? '👑'
      : isICE
      ? '🚔'
      : isMS13
      ? '🦹'
      : undefined);

  return (
    <>
      {/* Colored circle under all human tourists for visual distinction */}
      {player.human && (
        <HumanIndicator
          x={historicalLocation.x * tileDim + tileDim / 2}
          y={historicalLocation.y * tileDim + tileDim / 2 + 10}
          id={player.id}
        />
      )}
      <Character
        x={historicalLocation.x * tileDim + tileDim / 2}
        y={historicalLocation.y * tileDim + tileDim / 2}
        orientation={orientationDegrees(historicalFacing)}
        isMoving={historicalLocation.speed > 0}
        isThinking={isThinking}
        isSpeaking={isSpeaking}
        isDancing={isDancing}
        emoji={displayEmoji}
        isViewer={isViewer}
        textureUrl={character.textureUrl}
        spritesheetData={character.spritesheetData}
        speed={character.speed}
        btcBalance={portfolio?.btcBalance ?? 0}
        onClick={() => {
          onClick({ kind: 'player', id: player.id });
        }}
      />
    </>
  );
};
function HumanIndicator({ x, y, id }: { x: number; y: number; id: string }) {
  const draw = useCallback((g: PIXI.Graphics) => {
    g.clear();
    const color = colorFromId(id);
    g.beginFill(color, 0.45);
    g.drawCircle(0, 10, 12);
    g.endFill();
  }, [id]);
  return <Graphics x={x} y={y} draw={draw} />;
}

function colorFromId(id: string): number {
  // Simple stable hash to HSL -> convert to hex number for PIXI
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  const [r, g, b] = hslToRgb(hue / 360, 0.65, 0.55);
  return (r << 16) + (g << 8) + b;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toC = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const r = Math.round(toC(h + 1 / 3) * 255);
  const g = Math.round(toC(h) * 255);
  const b = Math.round(toC(h - 1 / 3) * 255);
  return [r, g, b];
}
