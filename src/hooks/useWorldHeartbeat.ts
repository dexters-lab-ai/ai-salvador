import { useMutation, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { api } from '../../convex/_generated/api';
import { WORLD_HEARTBEAT_INTERVAL } from '../../convex/constants';
import { Id } from '../../convex/_generated/dataModel';

export function useWorldHeartbeat(worldId?: Id<'worlds'>) {
  const worldStatus = useQuery(api.world.defaultWorldStatus);

  // Send a periodic heartbeat to our world to keep it alive.
  const heartbeat = useMutation(api.world.heartbeatWorld);
  useEffect(() => {
    const sendHeartBeat = () => {
      if (!worldStatus || !worldId) {
        return;
      }
      // Don't send a heartbeat if we've observed one sufficiently close
      // to the present.
      if (Date.now() - WORLD_HEARTBEAT_INTERVAL / 2 < worldStatus.lastViewed) {
        return;
      }
      void heartbeat({ worldId: worldStatus.worldId });
    };
    sendHeartBeat();
    const id = setInterval(sendHeartBeat, WORLD_HEARTBEAT_INTERVAL);
    return () => clearInterval(id);
    // Rerun if the `worldId` changes but not `worldStatus`, since don't want to
    // resend the heartbeat whenever its last viewed timestamp changes.
  }, [worldId, heartbeat, worldStatus]);
}