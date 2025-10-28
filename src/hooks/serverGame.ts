import { GameId } from '../../convex/aiTown/ids.ts';
import { AgentDescription } from '../../convex/aiTown/agentDescription.ts';
import { PlayerDescription } from '../../convex/aiTown/playerDescription.ts';
import { World } from '../../convex/aiTown/world.ts';
import { WorldMap } from '../../convex/aiTown/worldMap.ts';
import { Id } from '../../convex/_generated/dataModel';
import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { parseMap } from '../../convex/util/object.ts';

export type ServerGame = {
  world: World;
  playerDescriptions: Map<GameId<'players'>, PlayerDescription>;
  agentDescriptions: Map<GameId<'agents'>, AgentDescription>;
  worldMap: WorldMap;
};

// TODO: This hook reparses the game state (even if we're not rerunning the query)
// when used in multiple components. Move this to a context to only parse it once.
export function useServerGame(worldId: Id<'worlds'> | undefined): ServerGame | undefined {
  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const descriptions = useQuery(api.world.gameDescriptions, worldId ? { worldId } : 'skip');
  const game = useMemo(() => {
    if (!worldState || !descriptions) {
      return undefined;
    }
    
    try {
      // Fix: Add explicit type assertion to satisfy ServerGame type.
      const parsedGame = {
        world: new World(worldState),
        agentDescriptions: parseMap(
          // Fix: Provide an empty array as a fallback to avoid passing `undefined`.
          descriptions.agentDescriptions || [],
          AgentDescription,
          (p) => p.agentId,
        ),
        playerDescriptions: parseMap(
          // Fix: Provide an empty array as a fallback.
          descriptions.playerDescriptions || [],
          PlayerDescription,
          (p) => p.playerId,
        ),
        // Fix: Remove `|| {}` as `descriptions.worldMap` is guaranteed to exist here.
        worldMap: new WorldMap(descriptions.worldMap),
      };
      return parsedGame as ServerGame;
    } catch (error) {
      console.error('Error initializing game state:', error);
      return undefined;
    }
  }, [worldState, descriptions]);
  return game;
}
