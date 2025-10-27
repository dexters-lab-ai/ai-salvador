import Button from './Button';
import { useMutation, useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useServerGame } from '../../hooks/serverGame';

export default function InteractButton() {
  const { isAuthenticated } = useConvexAuth();
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const game = useServerGame(worldId);
  const userPlayer = useQuery(api.players.user, worldId ? { worldId } : 'skip');
  const userPlayerId = userPlayer?.id;
  // Fix: Call the newly added `leaveWorld` mutation
  const leave = useMutation(api.world.leaveWorld);
  const isPlaying = !!userPlayerId;

  // This component no longer directly triggers "Join", as it's handled by PaymentModal
  // It should only be used for "Leave" functionality for existing players.
  if (!isAuthenticated || game === undefined || !isPlaying) {
    return null; // Don't render if not authenticated, game not loaded, or not playing
  }

  const joinOrLeaveGame = () => {
    if (!worldId || !isAuthenticated || game === undefined) {
      return;
    }
    if (isPlaying) {
      console.log(`Leaving game for player ${userPlayerId}`);
      void leave({ worldId });
    }
  };

  return (
    <Button onClick={joinOrLeaveGame} title="Leave the game" className="text-xs sm:text-sm">
      Leave
    </Button>
  );
}