import { mutation } from './_generated/server';

export const addTouristCountToVillageState = mutation({
  handler: async (ctx) => {
    const villageState = await ctx.db.query('villageState').unique();
    if (villageState && villageState.touristCount === undefined) {
      await ctx.db.patch(villageState._id, { touristCount: 0 });
      console.log('Successfully added touristCount to villageState.');
    } else {
      console.log('villageState already has touristCount or does not exist.');
    }
  },
});
