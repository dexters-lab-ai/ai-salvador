import { internalMutation } from './_generated/server';

// A stub for fetching real-time BTC price data.
// You can replace this with a real API call in the future.
async function fetchRealTimeBtcPrice(): Promise<number | null> {
  // For now, return null to indicate that we should use the simulation.
  return null;
}

import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { playerId } from './aiTown/ids';

// The INITIAL_TOURIST_BTC, MIN_ENTRY_FEE, MAX_ENTRY_FEE are no longer used here
// as the entry fee is now handled by the x402 payment protocol.

// This mutation is now deprecated and should no longer be called directly.
// The `joinWorld` logic now schedules a call to the x402 payment flow
// which ultimately updates the user's `isJoined` status and logs the payment.
/*
export const joinAndPayFee = mutation({
  args: { playerId: v.string() },
  handler: async (ctx, args) => {
    const villageState = await ctx.db.query('villageState').unique();
    if (!villageState) {
      throw new Error('Village state not found!');
    }

    // Check if a portfolio already exists to prevent double-counting tourists
    const existingPortfolio = await ctx.db
      .query('portfolios')
      .withIndex('by_playerId', (q) => q.eq('playerId', args.playerId))
      .unique();

    if (existingPortfolio) {
      // Player is re-joining, don't charge fee or increment count
      return;
    }

    // Create a portfolio for the new tourist
    await ctx.db.insert('portfolios', {
      playerId: args.playerId,
      btcBalance: INITIAL_TOURIST_BTC,
    });

    // Charge a random entry fee
    const entryFee = MIN_ENTRY_FEE + Math.random() * (MAX_ENTRY_FEE - MIN_ENTRY_FEE);
    const portfolio = await ctx.db
      .query('portfolios')
      .withIndex('by_playerId', (q) => q.eq('playerId', args.playerId))
      .unique();

    if (!portfolio) {
      throw new Error('Tourist portfolio not found!');
    }

    await ctx.db.patch(portfolio._id, { btcBalance: portfolio.btcBalance - entryFee });
    await ctx.db.patch(villageState._id, {
      treasury: villageState.treasury + entryFee,
      touristCount: (villageState.touristCount ?? 0) + 1,
    });

    // Log the transaction
    await ctx.db.insert('transactions', {
      playerId: args.playerId,
      type: 'entry_fee',
      amount: entryFee,
      timestamp: Date.now(),
    });
  },
});
*/

export const updateBtcPrice = internalMutation({
  handler: async (ctx) => {
    const villageState = await ctx.db.query('villageState').unique();
    if (!villageState) {
      console.error('Village state not found!');
      return;
    }

    const oldPrice = villageState.btcPrice;
    let newPrice = oldPrice;

    const realPrice = await fetchRealTimeBtcPrice();
    if (realPrice !== null) {
      newPrice = realPrice;
    } else {
      // Simulate a price change between -5% and +5%
      const percentageChange = (Math.random() - 0.5) * 0.1;
      newPrice = oldPrice * (1 + percentageChange);
    }

    let marketSentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (newPrice > oldPrice) {
      marketSentiment = 'positive';
    } else if (newPrice < oldPrice) {
      marketSentiment = 'negative';
    }

    await ctx.db.patch(villageState._id, {
      btcPrice: newPrice,
      previousBtcPrice: oldPrice,
      marketSentiment,
    });

    await ctx.db.insert('historicalPrices', {
      timestamp: Date.now(),
      price: newPrice,
    });
  },
});