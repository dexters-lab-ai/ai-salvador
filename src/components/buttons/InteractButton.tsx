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

export default function InteractButton() {
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
      <div className="text-xs sm:text-sm">
        <SignInButton mode="modal">
          <Button imgUrl={interactImg}>Interact</Button>
        </SignInButton>
      </div>
    );
  }
  return isPlaying ? (
    <Button onClick={joinOrLeaveGame} title="Leave the game" className="text-xs sm:text-sm">
      Leave
    </Button>
  ) : isAuthenticated ? (
    <Button imgUrl={interactImg} onClick={joinOrLeaveGame} title="Join the game as a tourist" className="text-xs sm:text-sm">
      Join
    </Button>
  ) : (
    <div className="text-xs sm:text-sm">
      <SignInButton mode="modal">
        <Button imgUrl={interactImg} title="Sign in to play">
          Join
        </Button>
      </SignInButton>
    </div>
  );
}
