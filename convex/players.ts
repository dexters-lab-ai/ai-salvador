import { query } from './_generated/server';
import { v } from 'convex/values';
import { DEFAULT_NAME } from './constants';

export const user = query({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      return null;
    }
    return world.players.find((p) => p.human === identity.tokenIdentifier) ?? null;
  },
});
