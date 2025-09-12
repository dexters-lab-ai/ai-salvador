import { ConvexError, v } from 'convex/values';
import { internal, api } from './_generated/api';
import { internalMutation, mutation, query } from './_generated/server';
import { characters, Descriptions } from '../data/characters';
import { insertInput } from './aiTown/insertInput';
import {
  DEFAULT_NAME,
  ENGINE_ACTION_DURATION,
  IDLE_WORLD_TIMEOUT,
  WORLD_HEARTBEAT_INTERVAL,
} from './constants';
import { playerId } from './aiTown/ids';
import { kickEngine, startEngine, stopEngine } from './aiTown/main';
import { engineInsertInput } from './engine/abstractGame';

export const defaultWorldStatus = query({
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    return worldStatus;
  },
});

export const monitorChase = internalMutation({
  args: {
    worldId: v.id('worlds'),
    icePlayerId: v.string(),
    ms13PlayerId: v.string(),
    destX: v.number(),
    destY: v.number(),
    attempt: v.number(),
    bothArrivalTs: v.optional(v.number()),
  },
  handler: async (ctx, { worldId, icePlayerId, ms13PlayerId, destX, destY, attempt, bothArrivalTs }) => {
    const world = await ctx.db.get(worldId);
    if (!world) return;
    const arrived = (pid: string) => {
      const p = world.players.find((pl: any) => pl.id === pid);
      if (!p) return false;
      const x = Math.floor(p.position.x);
      const y = Math.floor(p.position.y);
      return x === destX && y === destY;
    };
    const iceArrived = arrived(icePlayerId);
    const ms13Arrived = arrived(ms13PlayerId);
    const now = Date.now();
    // If both have arrived, start or check a 10s dwell timer before reset
    if (iceArrived && ms13Arrived) {
      const started = bothArrivalTs ?? now;
      if (!bothArrivalTs) {
        await ctx.scheduler.runAfter(1000, internal.world.monitorChase, {
          worldId,
          icePlayerId,
          ms13PlayerId,
          destX,
          destY,
          attempt: attempt + 1,
          bothArrivalTs: started,
        });
        return;
      }
      if (now - bothArrivalTs >= 10_000) {
        await ctx.scheduler.runAfter(0, internal.world.resetChase, { worldId, icePlayerId, ms13PlayerId });
        return;
      }
      await ctx.scheduler.runAfter(1000, internal.world.monitorChase, {
        worldId,
        icePlayerId,
        ms13PlayerId,
        destX,
        destY,
        attempt: attempt + 1,
        bothArrivalTs,
      });
      return;
    }
    // Safety cap to avoid infinite loops (e.g., 30s total)
    if (attempt >= 60) { // allow up to ~60s tracking
      await ctx.scheduler.runAfter(0, internal.world.resetChase, { worldId, icePlayerId, ms13PlayerId });
      return;
    }
    // Keep monitoring until both arrive
    await ctx.scheduler.runAfter(1000, internal.world.monitorChase, {
      worldId,
      icePlayerId,
      ms13PlayerId,
      destX,
      destY,
      attempt: attempt + 1,
      bothArrivalTs,
    });
  },
});

// Admin/public trigger to start a cave chase between ICE and MS-13.
export const triggerChase = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) throw new Error(`Invalid world ID: ${worldId}`);
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .unique();
    if (!worldStatus) throw new Error(`Missing world status for ${worldId}`);

    // Find ICE and MS-13 playerIds
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const ice = playerDescriptions.find((p) => p.name === 'ICE');
    const ms13 = playerDescriptions.find((p) => p.name === 'MS-13');
    const bukele = playerDescriptions.find((p) => p.name === 'President Bukele');
    if (!ice || !ms13) {
      // Ensure they exist then return; next heartbeat can retrigger
      await ctx.scheduler.runAfter(0, internal.world.ensurePoliceAndRobber, { worldId });
      throw new Error('ICE or MS-13 missing; ensured and please retry');
    }

    const dest = { x: 5, y: 45 } as any;
    // Set activities and speed multipliers
    await insertInput(ctx, worldId, 'setActivity', {
      playerId: ice.playerId,
      description: 'Chase MS-13...',
      emoji: '🚔',
      durationMs: 6000,
    } as any);
    await insertInput(ctx, worldId, 'setActivity', {
      playerId: ms13.playerId,
      description: 'Run for border...',
      emoji: '🦹',
      durationMs: 6000,
    } as any);
    await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: ice.playerId, multiplier: 1.8 } as any);
    await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: ms13.playerId, multiplier: 2.0 } as any);

    // Force both to move to cave destination
    await insertInput(ctx, worldId, 'forceMoveTo', { playerId: ice.playerId, destination: dest } as any);
    await insertInput(ctx, worldId, 'forceMoveTo', { playerId: ms13.playerId, destination: dest } as any);

    // Also dispatch President Bukele to a separate emergency location and keep him until reset
    if (bukele) {
      const emergency = { x: 44, y: 13 } as any;
      await insertInput(ctx, worldId, 'setActivity', {
        playerId: bukele.playerId,
        description: 'Rushing to emergency room...',
        emoji: '🏥',
        durationMs: 6000,
      } as any);
      // Match speed to ICE for urgency
      await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: bukele.playerId, multiplier: 1.8 } as any);
      await insertInput(ctx, worldId, 'forceMoveTo', { playerId: bukele.playerId, destination: emergency } as any);
    }

    // Monitor arrival and then reset; avoids prematurely cutting off the chase
    await ctx.scheduler.runAfter(1000, internal.world.monitorChase, {
      worldId,
      icePlayerId: ice.playerId,
      ms13PlayerId: ms13.playerId,
      destX: 5,
      destY: 45,
      attempt: 0,
      bothArrivalTs: undefined,
    });
  },
});

export const resetChase = internalMutation({
  args: { worldId: v.id('worlds'), icePlayerId: v.string(), ms13PlayerId: v.string() },
  handler: async (ctx, { worldId, icePlayerId, ms13PlayerId }) => {
    // Move all BTC from MS-13 to ICE upon arrival/reset
    await ctx.scheduler.runAfter(0, internal.economy.transferAllBalance, { fromId: ms13PlayerId, toId: icePlayerId });
    await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: icePlayerId, multiplier: null } as any);
    await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: ms13PlayerId, multiplier: null } as any);
    // Clear activity banners quickly
    await insertInput(ctx, worldId, 'setActivity', { playerId: icePlayerId, description: '', emoji: undefined, durationMs: 1 } as any);
    await insertInput(ctx, worldId, 'setActivity', { playerId: ms13PlayerId, description: '', emoji: undefined, durationMs: 1 } as any);
    // Stop movement by sending null destination
    await insertInput(ctx, worldId, 'forceMoveTo', { playerId: icePlayerId, destination: null } as any);
    await insertInput(ctx, worldId, 'forceMoveTo', { playerId: ms13PlayerId, destination: null } as any);
    // Also clear Bukele's state if present
    const world = await ctx.db.get(worldId);
    if (world) {
      const buk = world.players.find((p: any) => p.name === 'President Bukele');
      if (buk) {
        await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: buk.id, multiplier: null } as any);
        await insertInput(ctx, worldId, 'setActivity', { playerId: buk.id, description: '', emoji: undefined, durationMs: 1 } as any);
        await insertInput(ctx, worldId, 'forceMoveTo', { playerId: buk.id, destination: null } as any);
      }
    }
    // Relocate both agents to random spots to resume normal behavior
    const randomDest = () => ({ x: Math.floor(Math.random() * 50) + 5, y: Math.floor(Math.random() * 50) + 5 });
    await ctx.scheduler.runAfter(500, internal.world.relocateAfterChase, {
      worldId,
      icePlayerId,
      ms13PlayerId,
      iceDest: randomDest(),
      ms13Dest: randomDest(),
    });
  },
});

export const relocateAfterChase = internalMutation({
  args: {
    worldId: v.id('worlds'),
    icePlayerId: v.string(),
    ms13PlayerId: v.string(),
    iceDest: v.object({ x: v.number(), y: v.number() }),
    ms13Dest: v.object({ x: v.number(), y: v.number() }),
  },
  handler: async (ctx, { worldId, icePlayerId, ms13PlayerId, iceDest, ms13Dest }) => {
    await insertInput(ctx, worldId, 'forceMoveTo', { playerId: icePlayerId, destination: iceDest } as any);
    await insertInput(ctx, worldId, 'forceMoveTo', { playerId: ms13PlayerId, destination: ms13Dest } as any);
  },
});

// Ensure ICE and MS-13 exist in this world; create if missing.
export const ensurePoliceAndRobber = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .unique();
    if (!worldStatus) return;
    const engineId = worldStatus.engineId;

    // Helper to ensure by name
    const ensureByName = async (name: string) => {
      const existing = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', worldId))
        .filter((q) => q.eq(q.field('name'), name))
        .first();
      if (existing) return;
      const idx = Descriptions.findIndex((d: { name: string }) => d.name === name);
      if (idx < 0) return;
      await engineInsertInput(ctx, engineId, 'createAgent', { descriptionIndex: idx });
    };

    await ensureByName('ICE');
    await ensureByName('MS-13');
  },
});

// Ensure President Bukele exists in this world; create if missing.
export const ensureBukele = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .unique();
    if (!worldStatus) return;
    const engineId = worldStatus.engineId;
    const existing = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .filter((q) => q.eq(q.field('name'), 'President Bukele'))
      .first();
    if (existing) return;

    const idx = Descriptions.findIndex((d: { name: string }) => d.name === 'President Bukele');
    if (idx < 0) return;

    // Ask engine to create the agent from description index.
    await engineInsertInput(ctx, engineId, 'createAgent', { descriptionIndex: idx });
  },
});
export const heartbeatWorld = mutation({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    if (!worldStatus) {
      throw new Error(`Invalid world ID: ${args.worldId}`);
    }
    const now = Date.now();

    // Skip the update (and then potentially make the transaction readonly)
    // if it's been viewed sufficiently recently..
    if (!worldStatus.lastViewed || worldStatus.lastViewed < now - WORLD_HEARTBEAT_INTERVAL / 2) {
      await ctx.db.patch(worldStatus._id, {
        lastViewed: Math.max(worldStatus.lastViewed ?? now, now),
      });
    }

    // Restart inactive worlds, but leave worlds explicitly stopped by the developer alone.
    if (worldStatus.status === 'stoppedByDeveloper') {
      console.debug(`World ${worldStatus._id} is stopped by developer, not restarting.`);
    }
    if (worldStatus.status === 'inactive') {
      console.log(`Restarting inactive world ${worldStatus._id}...`);
      await ctx.db.patch(worldStatus._id, { status: 'running' });
      await startEngine(ctx, worldStatus.worldId);
    }

    // Ensure core NPCs and data exist.
    await ctx.scheduler.runAfter(0, internal.world.ensureBukele, { worldId: args.worldId });
    await ctx.scheduler.runAfter(0, internal.world.ensurePoliceAndRobber, { worldId: args.worldId });
    await ctx.scheduler.runAfter(0, internal.economy.backfillMissingPortfolios, { worldId: args.worldId });
  },
});

export const stopInactiveWorlds = internalMutation({
  handler: async (ctx) => {
    const cutoff = Date.now() - IDLE_WORLD_TIMEOUT;
    const worlds = await ctx.db.query('worldStatus').collect();
    for (const worldStatus of worlds) {
      if (cutoff < worldStatus.lastViewed || worldStatus.status !== 'running') {
        continue;
      }
      console.log(`Stopping inactive world ${worldStatus._id}`);
      await ctx.db.patch(worldStatus._id, { status: 'inactive' });
      await stopEngine(ctx, worldStatus.worldId);
    }
  },
});

export const restartDeadWorlds = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    // Restart an engine if it hasn't run for 2x its action duration.
    const engineTimeout = now - ENGINE_ACTION_DURATION * 2;
    const worlds = await ctx.db.query('worldStatus').collect();
    for (const worldStatus of worlds) {
      if (worldStatus.status !== 'running') {
        continue;
      }
      const engine = await ctx.db.get(worldStatus.engineId);
      if (!engine) {
        throw new Error(`Invalid engine ID: ${worldStatus.engineId}`);
      }
      if (engine.currentTime && engine.currentTime < engineTimeout) {
        console.warn(`Restarting dead engine ${engine._id}...`);
        await kickEngine(ctx, worldStatus.worldId);
      }
    }
  },
});


export const completeJoining = internalMutation({
  args: { worldId: v.id('worlds'), tokenIdentifier: v.string() },
  handler: async (ctx, { worldId, tokenIdentifier }) => {
    const world = await ctx.db.get(worldId);
    if (!world) {
      return;
    }
    const player = world.players.find((p) => p.human === tokenIdentifier);
    if (!player) {
      // Player hasn't been created yet, try again in a bit.
      await ctx.scheduler.runAfter(1000, internal.world.completeJoining, { worldId, tokenIdentifier });
      return;
    }
    // Ensure village state exists before attempting to join and pay fee
    const existingVillageState = await ctx.db.query('villageState').unique();
    if (!existingVillageState) {
      await ctx.db.insert('villageState', {
        treasury: 0,
        btcPrice: 110000,
        previousBtcPrice: 108000,
        marketSentiment: 'neutral',
        touristCount: 0,
      });
    }
    await ctx.runMutation(api.village.joinAndPayFee, { playerId: player.id });
  },
});

export const joinWorld = mutation({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError('You must be logged in to join the world.');
    }
    const name = identity.name ?? DEFAULT_NAME;
    const tokenIdentifier = identity.tokenIdentifier;

    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new ConvexError(`Invalid world ID: ${args.worldId}`);
    }

    // Check if the player already exists.
    const existingPlayer = world.players.find((p) => p.human === tokenIdentifier);
    if (existingPlayer) {
      // If they exist, ensure they have a portfolio via the join completion flow.
      await ctx.scheduler.runAfter(0, internal.world.completeJoining, {
        worldId: args.worldId,
        tokenIdentifier,
      });
      return;
    }

    const character = characters[Math.floor(Math.random() * characters.length)];
    await insertInput(ctx, world._id, 'join', {
      name,
      characterName: character.name,
      character: character.name,
      description: `${DEFAULT_NAME} is a human player`,
      tokenIdentifier: tokenIdentifier,
    });
    // Defer portfolio creation and fee logic to the completion task once the player document exists.
    await ctx.scheduler.runAfter(0, internal.world.completeJoining, {
      worldId: args.worldId,
      tokenIdentifier,
    });
  },
});

export const leaveWorld = mutation({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('not logged in');
    }
    const { tokenIdentifier } = identity;
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`Invalid world ID: ${args.worldId}`);
    }
    const existingPlayer = world.players.find((p) => p.human === tokenIdentifier);
    if (!existingPlayer) {
      return;
    }
    await insertInput(ctx, world._id, 'leave', {
      playerId: existingPlayer.id,
    });
  },
});

export const sendWorldInput = mutation({
  args: {
    engineId: v.id('engines'),
    name: v.string(),
    args: v.any(),
  },
  handler: async (ctx, args) => {
    // const identity = await ctx.auth.getUserIdentity();
    // if (!identity) {
    //   throw new Error(`Not logged in`);
    // }
    return await engineInsertInput(ctx, args.engineId, args.name as any, args.args);
  },
});

export const worldState = query({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`Invalid world ID: ${args.worldId}`);
    }
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', world._id))
      .unique();
    if (!worldStatus) {
      throw new Error(`Invalid world status ID: ${world._id}`);
    }
    const engine = await ctx.db.get(worldStatus.engineId);
    if (!engine) {
      throw new Error(`Invalid engine ID: ${worldStatus.engineId}`);
    }
    return { world, engine };
  },
});

export const gameDescriptions = query({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    const agentDescriptions = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    const worldMap = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    if (!worldMap) {
      throw new Error(`No map for world: ${args.worldId}`);
    }
    return { worldMap, playerDescriptions, agentDescriptions };
  },
});

export const previousConversation = query({
  args: {
    worldId: v.id('worlds'),
    playerId,
  },
  handler: async (ctx, args) => {
    // Walk the player's history in descending order, looking for a nonempty
    // conversation.
    const members = ctx.db
      .query('participatedTogether')
      .withIndex('playerHistory', (q) => q.eq('worldId', args.worldId).eq('player1', args.playerId))
      .order('desc');

    for await (const member of members) {
      const conversation = await ctx.db
        .query('archivedConversations')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('id', member.conversationId))
        .unique();
      if (!conversation) {
        throw new Error(`Invalid conversation ID: ${member.conversationId}`);
      }
      if (conversation.numMessages > 0) {
        return conversation;
      }
    }
    return null;
  },
});

export const getAgentDescription = query({
  args: { agentId: v.id('agents') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('agentDescriptions')
      .withIndex('agentId', (q) => q.eq('agentId', args.agentId))
      .unique();
  },
});

export const villageState = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('villageState').unique();
  },
});

