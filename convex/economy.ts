import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';

const HUSTLE_SUCCESS_RATE = 0.1;
const EARNING_RATE = 0.1;

export const hustle = internalMutation({
  args: {
    agentId: v.string(),
    touristId: v.string(),
  },
  handler: async (ctx, args) => {
    const touristPortfolio = await ctx.db
      .query('portfolios')
      .withIndex('by_playerId', (q) => q.eq('playerId', args.touristId))
      .unique();

    if (touristPortfolio) {
      const amount = touristPortfolio.btcBalance * EARNING_RATE;
      await ctx.db.insert('hustles', {
        agentId: args.agentId,
        touristId: args.touristId,
        amount,
        status: 'pending',
      });
    }
  },
});

// Robber takes 10% protection fee from a victim agent.
export const robProtectionFee = internalMutation({
  args: {
    robberId: v.string(),
    victimId: v.string(),
  },
  handler: async (ctx, { robberId, victimId }) => {
    const victimPortfolio = await ctx.db
      .query('portfolios')
      .withIndex('by_playerId', (q) => q.eq('playerId', victimId))
      .unique();
    const robberPortfolio = await ctx.db
      .query('portfolios')
      .withIndex('by_playerId', (q) => q.eq('playerId', robberId))
      .unique();
    if (!victimPortfolio || !robberPortfolio) return;
    if (victimPortfolio.btcBalance <= 0) return;
    const amount = victimPortfolio.btcBalance * 0.1;
    if (amount <= 0) return;
    await ctx.db.patch(victimPortfolio._id, { btcBalance: victimPortfolio.btcBalance - amount });
    await ctx.db.patch(robberPortfolio._id, { btcBalance: robberPortfolio.btcBalance + amount });
    // Record transactions for UI floating texts
    await ctx.db.insert('transactions', {
      playerId: robberId,
      type: 'earning',
      amount,
      timestamp: Date.now(),
    });
    await ctx.db.insert('transactions', {
      playerId: victimId,
      type: 'earning',
      amount: -amount,
      timestamp: Date.now(),
    });
  },
});

// Ensure every player in a world has a portfolio. Safe to run repeatedly.
export const backfillMissingPortfolios = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    for (const pd of playerDescriptions) {
      const existing = await ctx.db
        .query('portfolios')
        .withIndex('by_playerId', (q) => q.eq('playerId', pd.playerId))
        .unique();
      if (!existing) {
        await ctx.db.insert('portfolios', { playerId: pd.playerId, btcBalance: 0.01 });
      }
    }
  },
});

export const getPortfolio = query({
  args: {
    playerId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('portfolios')
      .withIndex('by_playerId', (q) => q.eq('playerId', args.playerId))
      .unique();
  },
});

export const getHistoricalPrices = query({
  handler: async (ctx) => {
    return await ctx.db.query('historicalPrices').withIndex('by_timestamp').order('desc').take(100);
  },
});

export const getAgentPortfolios = query({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      return [];
    }
    const agentPortfolios = [];
    for (const agent of world.agents) {
      const portfolio = await ctx.db
        .query('portfolios')
        .withIndex('by_playerId', (q) => q.eq('playerId', agent.playerId))
        .unique();
      const playerDescription = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) =>
          q.eq('worldId', args.worldId).eq('playerId', agent.playerId),
        )
        .unique();

      if (portfolio && playerDescription) {
        agentPortfolios.push({
          name: playerDescription.name,
          btcBalance: portfolio.btcBalance,
        });
      }
    }
    return agentPortfolios;
  },
});

export const getRecentTransactions = query({
  handler: async (ctx) => {
    const tenSecondsAgo = Date.now() - 10000;
    return await ctx.db
      .query('transactions')
      .filter((q) => q.gt(q.field('timestamp'), tenSecondsAgo))
      .collect();
  },
});

// Transfer entire BTC balance from one player to another.
export const transferAllBalance = internalMutation({
  args: {
    fromId: v.string(),
    toId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { fromId, toId }) => {
    if (fromId === toId) return;
    const from = await ctx.db
      .query('portfolios')
      .withIndex('by_playerId', (q) => q.eq('playerId', fromId))
      .unique();
    const to = await ctx.db
      .query('portfolios')
      .withIndex('by_playerId', (q) => q.eq('playerId', toId))
      .unique();
    if (!from || !to) return;
    const amount = from.btcBalance;
    if (amount <= 0) return;
    await ctx.db.patch(from._id, { btcBalance: 0 });
    await ctx.db.patch(to._id, { btcBalance: to.btcBalance + amount });
    await ctx.db.insert('transactions', {
      playerId: toId,
      type: 'earning',
      amount,
      timestamp: Date.now(),
    });
    await ctx.db.insert('transactions', {
      playerId: fromId,
      type: 'earning',
      amount: -amount,
      timestamp: Date.now(),
    });
  },
});

export const transferAllToBukele = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const bukele = playerDescriptions.find((d) => d.name === 'President Bukele');
    if (!bukele) return;

    const world = await ctx.db.get(worldId);
    if (!world) return;

    for (const agent of world.agents) {
      if (agent.playerId !== bukele.playerId) {
        await ctx.scheduler.runAfter(0, internal.economy.transferAllBalance, {
          fromId: agent.playerId,
          toId: bukele.playerId,
        });
      }
    }
  },
});

export const getPendingHustle = query({
  args: {
    touristId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('hustles')
      .withIndex('by_touristId', (q) => q.eq('touristId', args.touristId).eq('status', 'pending'))
      .first();
  },
});

export const acceptHustle = mutation({
  args: {
    hustleId: v.id('hustles'),
  },
  handler: async (ctx, args) => {
    const hustle = await ctx.db.get(args.hustleId);
    if (!hustle || hustle.status !== 'pending') {
      return;
    }

    const touristPortfolio = await ctx.db
      .query('portfolios')
      .withIndex('by_playerId', (q) => q.eq('playerId', hustle.touristId))
      .unique();

    const agentPortfolio = await ctx.db
      .query('portfolios')
      .withIndex('by_playerId', (q) => q.eq('playerId', hustle.agentId))
      .unique();

    if (touristPortfolio && agentPortfolio) {
      await ctx.db.patch(touristPortfolio._id, {
        btcBalance: touristPortfolio.btcBalance - hustle.amount,
      });
      await ctx.db.patch(agentPortfolio._id, { btcBalance: agentPortfolio.btcBalance + hustle.amount });
      await ctx.db.patch(hustle._id, { status: 'accepted' });

      await ctx.db.insert('transactions', {
        playerId: hustle.agentId,
        type: 'hustle',
        amount: hustle.amount,
        timestamp: Date.now(),
      });
      // Record the corresponding debit for the tourist (negative amount)
      await ctx.db.insert('transactions', {
        playerId: hustle.touristId,
        type: 'hustle',
        amount: -hustle.amount,
        timestamp: Date.now(),
      });
    }
  },
});

export const rejectHustle = mutation({
  args: {
    hustleId: v.id('hustles'),
  },
  handler: async (ctx, args) => {
    const hustle = await ctx.db.get(args.hustleId);
    if (hustle && hustle.status === 'pending') {
      await ctx.db.patch(hustle._id, { status: 'rejected' });
    }
  },
});

export const earnFromConversation = internalMutation({
  args: {
    agentId: v.string(),
    touristId: v.string(),
  },
  handler: async (ctx, args) => {
    const touristPortfolio = await ctx.db
      .query('portfolios')
      .withIndex('by_playerId', (q) => q.eq('playerId', args.touristId))
      .unique();

    if (touristPortfolio) {
      const agentPortfolio = await ctx.db
        .query('portfolios')
        .withIndex('by_playerId', (q) => q.eq('playerId', args.agentId))
        .unique();

      if (agentPortfolio) {
        const amount = touristPortfolio.btcBalance * EARNING_RATE;
        await ctx.db.patch(touristPortfolio._id, {
          btcBalance: touristPortfolio.btcBalance - amount,
        });
        await ctx.db.patch(agentPortfolio._id, { btcBalance: agentPortfolio.btcBalance + amount });

        await ctx.db.insert('transactions', {
          playerId: args.agentId,
          type: 'earning',
          amount,
          timestamp: Date.now(),
        });
        // Tourist debit record for UI (negative amount)
        await ctx.db.insert('transactions', {
          playerId: args.touristId,
          type: 'earning',
          amount: -amount,
          timestamp: Date.now(),
        });
      }
    }
  },
});