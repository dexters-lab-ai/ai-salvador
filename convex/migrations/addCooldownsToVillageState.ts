import { mutation } from '../_generated/server';
import { v } from 'convex/values';

export const addCooldownsToVillageState = mutation({
  args: {},
  handler: async (ctx) => {
    const villageState = await ctx.db.query('villageState').unique();
    if (villageState) {
      await ctx.db.patch(villageState._id, {
        lastChaseTime: 0,
        lastPartyTime: 0,
        lastMeetingTime: 0,
        cooldownMinutes: 15, // Default to 15 minutes
      });
      console.log('Successfully added cooldown fields to villageState.');
    } else {
      console.log('villageState does not exist yet.');
    }
  },
});
