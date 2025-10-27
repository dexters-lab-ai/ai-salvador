import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';
import { Id, Doc } from './_generated/dataModel';
import type { QueryCtx, MutationCtx } from './_generated/server';

export const getPoolCounts = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: QueryCtx, { worldId }: { worldId: Id<'worlds'> }) => {
    const world = await ctx.db.get(worldId);
    const activeHumans = world ? world.players.filter((p) => !!p.human).length : 0;
    const poolCount = await ctx.db
      .query('waitingPool')
      .withIndex('by_worldId', (q) => q.eq('worldId', worldId))
      .collect()
      .then((rows: Doc<'waitingPool'>[]) => rows.length); // Explicitly type rows
    return { activeHumans, poolCount };
  },
});

export const getMyPoolStatus = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: QueryCtx, { worldId }: { worldId: Id<'worlds'> }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { inPool: false };
    const existing = await ctx.db
      .query('waitingPool')
      .withIndex('by_token', (q) => q.eq('worldId', worldId).eq('tokenIdentifier', identity.tokenIdentifier!)) // Added non-null assertion for tokenIdentifier
      .first();
    return { inPool: !!existing };
  },
});

export const joinWaitingPool = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: MutationCtx, { worldId }: { worldId: Id<'worlds'> }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not logged in');
    const existing = await ctx.db
      .query('waitingPool')
      .withIndex('by_token', (q) => q.eq('worldId', worldId).eq('tokenIdentifier', identity.tokenIdentifier!)) // Added non-null assertion
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert('waitingPool', {
      worldId,
      tokenIdentifier: identity.tokenIdentifier!, // Added non-null assertion
      createdAt: Date.now(),
    });
  },
});

export const leaveWaitingPool = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: MutationCtx, { worldId }: { worldId: Id<'worlds'> }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not logged in');
    const existing = await ctx.db
      .query('waitingPool')
      .withIndex('by_token', (q) => q.eq('worldId', worldId).eq('tokenIdentifier', identity.tokenIdentifier!)) // Added non-null assertion
      .first();
    if (!existing) return null;
    await ctx.db.delete(existing._id);
    return existing._id;
  },
});

export const attemptTakeSlot = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: MutationCtx, { worldId }: { worldId: Id<'worlds'> }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not logged in');
    const world = await ctx.db.get(worldId);
    if (!world) throw new Error('Invalid world');
    const activeHumans = world.players.filter((p) => !!p.human).length;
    // MAX_HUMAN_PLAYERS lives in src/shared/constants; mirror value here to avoid import from frontend.
    const MAX = 8; // keep in sync with src/shared/constants
    if (activeHumans >= MAX) {
      return { taken: false };
    }
    // If capacity exists, try to join via the public mutation logic
    try {
      // Avoid duplicate joins if already present
      const existing = world.players.find((p) => p.human === identity.tokenIdentifier);
      if (existing) return { taken: true };
      // Fix: Call the newly added `joinWorld` mutation with necessary arguments
      await ctx.runMutation(api.world.joinWorld, { worldId });
    } catch (e) {
      console.error("Failed to take slot:", e); // Log the error for debugging
      return { taken: false };
    }
    // Remove from pool if present
    const existingPool = await ctx.db
      .query('waitingPool')
      .withIndex('by_token', (q) => q.eq('worldId', worldId).eq('tokenIdentifier', identity.tokenIdentifier!)) // Added non-null assertion
      .first();
    if (existingPool) await ctx.db.delete(existingPool._id);
    return { taken: true };
  },
});