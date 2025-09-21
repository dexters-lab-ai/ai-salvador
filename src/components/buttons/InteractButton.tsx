import Button from './Button';
import { toast } from 'react-toastify';
import interactImg from '../../../assets/interact.svg';
import { useConvex, useMutation, useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { SignInButton } from '@clerk/clerk-react';
import { ConvexError } from 'convex/values';
import { Id } from '../../../convex/_generated/dataModel';
import { useCallback } from 'react';
import { waitForInput } from '../../hooks/sendInput';
import { useServerGame } from '../../hooks/serverGame';

interface InteractButtonProps {
  className?: string;
}

export default function InteractButton({ className = '' }: InteractButtonProps) {
  const { isAuthenticated } = useConvexAuth();
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const game = useServerGame(worldId);
  const userPlayer = useQuery(api.players.user, worldId ? { worldId } : 'skip');
  const userPlayerId = userPlayer?.id;
  const join = useMutation(api.world.joinWorld);
  const leave = useMutation(api.world.leaveWorld);
  const isPlaying = !!userPlayerId;

  const convex = useConvex();
  const joinInput = useCallback(
    async (worldId: Id<'worlds'>) => {
      let inputId;
      try {
        inputId = await join({ worldId });
      } catch (e: any) {
        if (e instanceof ConvexError) {
          toast.error(e.data);
          return;
        }
        throw e;
      }
      if (!inputId) {
        return;
      }
      try {
        await waitForInput(convex, inputId);
      } catch (e: any) {
        toast.error(e.message);
      }
    },
    [convex],
  );

  const joinOrLeaveGame = () => {
    if (!worldId || !isAuthenticated || game === undefined) {
      return;
    }
    if (isPlaying) {
      console.log(`Leaving game for player ${userPlayerId}`);
      void leave({ worldId });
    } else {
      console.log(`Joining game`);
      void joinInput(worldId);
    }
  };
  if (!isAuthenticated || game === undefined) {
    return (
      <SignInButton mode="modal">
        <Button 
          className="text-sm sm:text-base h-10 px-2 sm:px-3 bg-blue-600 hover:bg-blue-700"
          imgUrl={interactImg}
          imgClassName="h-4 w-4 sm:h-5 sm:w-5 mr-1"
        >
          <span className="text-xs sm:text-sm">Interact</span>
        </Button>
      </SignInButton>
    );
  }
  return isPlaying ? (
    <Button 
      onClick={joinOrLeaveGame} 
      title="Leave the game"
      className={`text-sm sm:text-base h-10 px-2 sm:px-3 ${className}`}
    >
      <span className="text-xs sm:text-sm">Leave</span>
    </Button>
  ) : isAuthenticated ? (
    <Button 
      imgUrl={interactImg} 
      onClick={joinOrLeaveGame} 
      title="Join the game as a tourist"
      className={`text-sm sm:text-base h-10 px-2 sm:px-3 ${className}`}
      imgClassName="h-4 w-4 sm:h-5 sm:w-5 mr-1"
    >
      <span className="text-xs sm:text-sm">Join</span>
    </Button>
  ) : (
    <SignInButton mode="modal">
      <Button 
        imgUrl={interactImg} 
        title="Sign in to play"
        className="text-sm sm:text-base h-10 px-2 sm:px-3 bg-blue-600 hover:bg-blue-700"
        imgClassName="h-4 w-4 sm:h-5 sm:w-5 mr-1"
      >
        <span className="text-xs sm:text-sm">Join</span>
      </Button>
    </SignInButton>
  );
}
