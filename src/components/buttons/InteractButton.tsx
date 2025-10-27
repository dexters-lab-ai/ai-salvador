import Button from './Button';
import { useMutation, useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useServerGame } from '../../hooks/serverGame';

interface InteractButtonProps {
  onJoin: () => void;
}

export default function InteractButton({ onJoin }: InteractButtonProps) {
  const { isAuthenticated } = useConvexAuth();
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const game = useServerGame(worldId);
  const userPlayer = useQuery(api.players.user, worldId ? { worldId } : 'skip');
  const userPlayerId = userPlayer?.id;
  const leave = useMutation(api.world.leaveWorld);
  const isPlaying = !!userPlayerId;

  // Show nothing if not authenticated or game not loaded
  if (!isAuthenticated || game === undefined) {
    return null;
  }

  const handleClick = () => {
    if (!worldId) return;
    
    if (isPlaying) {
      console.log(`Leaving game for player ${userPlayerId}`);
      void leave({ worldId });
    } else {
      // Call the onJoin callback when not playing
      onJoin();
    }
  };

  return (
    <Button 
      onClick={handleClick} 
      title={isPlaying ? "Leave the game" : "Join the game"}
      className="text-xs sm:text-sm"
    >
      {isPlaying ? "Leave" : "Join"}
    </Button>
  );
}