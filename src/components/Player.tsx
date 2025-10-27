import { Character } from './Character.tsx';
import { Text, Graphics, Sprite } from '@pixi/react';
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

export const PlayerComponent = ({ // Fix: Renamed Player to PlayerComponent
  game,
  isViewer,
  player,
  onClick,
  historicalTime,
  openPaymentModal, // New prop
  setIsPaymentModalOpen, // New prop
}: {
  game: ServerGame;
  isViewer: boolean;
  player: ServerPlayer;
  onClick: SelectElement;
  historicalTime: number | undefined;
  openPaymentModal: React.Dispatch<any>;
  setIsPaymentModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const { worldId, worldMap, playerDescriptions } = game;

  const playerDescription = playerDescriptions.get(player.id);
  if (!playerDescription) {
    // We don't have a description for this player yet, so don't render them.
    return null;
  }
  const tileDim = worldMap.tileDim;

  const char = characters.find((c) => c.name === player.characterName);
  if (!char) {
    return null; // Don't render if character not found.
  }
  const { textureUrl, spritesheetData, speed } = char;

  const historicalPlayer = useHistoricalValue(
    locationFields,
    historicalTime,
    playerLocation(player),
    game.world.historicalLocations?.get(player.id),
  );
  if (!historicalPlayer) {
    if (!logged.has(player.id)) {
      console.warn(`No historical player for ${player.id}`);
      logged.add(player.id);
    }
    return null;
  }

  const { x, y, dx, dy, speed: currentSpeed } = historicalPlayer;

  let emoji = player.activity?.emoji;
  if (currentSpeed > 0) {
    emoji = '💨'; // Override activity emoji with speed burst
  }
  if (player.id === 'p:0' && isViewer) {
    // Only President Bukele can have a meeting bubble
    const villageState = useQuery(api.world.villageState as any, {});
    if (villageState?.meeting) {
      emoji = '👑';
    }
  }

  const isMoving = currentSpeed > 0;
  const rotation = orientationDegrees({ dx, dy });
  const isDancing = game.world.players.get(player.id)?.activity?.description.includes('Partying') || false;

  const isThinking =
    game.world.conversations.get(player.id) === undefined &&
    game.world.agents.get(player.id)?.inProgressOperation !== undefined;
  const isSpeaking = game.world.playerConversation(player)?.isTyping?.playerId === player.id;

  const portfolio = useQuery(api.economy.getPortfolio, { playerId: player.id });

  const onClickCallback = useCallback(() => {
    onClick({ kind: 'player', id: player.id });
  }, [onClick, player.id]);

  return (
    <Character
      textureUrl={textureUrl}
      spritesheetData={spritesheetData}
      x={x * tileDim}
      y={y * tileDim}
      orientation={rotation}
      isMoving={isMoving}
      isThinking={isThinking}
      isSpeaking={isSpeaking}
      isDancing={isDancing}
      emoji={emoji}
      isViewer={isViewer}
      speed={speed}
      btcBalance={portfolio?.btcBalance}
      onClick={onClickCallback}
    />
  );
};