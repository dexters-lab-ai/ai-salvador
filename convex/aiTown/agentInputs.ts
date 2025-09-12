import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';

export const createAgentPortfolio = internalMutation({
  args: {
    playerId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('portfolios', {
      playerId: args.playerId,
      btcBalance: 0.01,
    });
  },
});
