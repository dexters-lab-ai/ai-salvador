import { ConvexError, v } from 'convex/values';
import { internal, api } from './_generated/api';
import { internalAction, internalMutation, mutation, query, internalQuery } from './_generated/server';
import { characters, Descriptions } from '../data/characters';
import { insertInput } from './aiTown/insertInput';
import {
  DEFAULT_NAME,
  ENGINE_ACTION_DURATION,
  IDLE_WORLD_TIMEOUT,
  WORLD_HEARTBEAT_INTERVAL,
} from './constants';
import { agentId, playerId } from './aiTown/ids';
import { kickEngine, startEngine, stopEngine } from './aiTown/main';
import { engineInsertInput } from './engine/abstractGame';
import { fetchEmbedding } from './util/llm';
import { Doc, Id } from './_generated/dataModel';
import { SerializedConversation } from './aiTown/conversation';

export const defaultWorldStatus = query({
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    return worldStatus;
  },
});

// Re-issue meeting move orders for stragglers a few times (party-style nudge without gating)
export const nudgeMeetingMovers = internalMutation({
  args: { worldId: v.id('worlds'), attempt: v.number() },
  handler: async (ctx, { worldId, attempt }) => {
    const world = await ctx.db.get(worldId);
    if (!world) return;
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const bukele = playerDescriptions.find((d) => d.name === 'President Bukele');
    if (!bukele) return;
    const minX = 42, maxX = 51, minY = 19, maxY = 24, spacing = 2;
    const targets: { x: number; y: number }[] = [];
    for (let y = minY; y <= maxY; y += spacing) {
      for (let x = minX; x <= maxX; x += spacing) targets.push({ x, y });
    }
    const others = world.agents.filter((a: any) => a.playerId !== bukele.playerId);
    let idx = 0;
    for (const agent of others) {
      const p = world.players.find((pl: any) => pl.id === agent.playerId);
      if (!p) continue;
      const atPlaza = Math.floor(p.position.x) >= minX && Math.floor(p.position.x) <= maxX && Math.floor(p.position.y) >= minY && Math.floor(p.position.y) <= maxY;
      if (atPlaza) continue;
      const dest = targets[Math.min(idx, targets.length - 1)];
      idx++;
      await insertInput(ctx, worldId, 'forceMoveTo', { playerId: agent.playerId, destination: dest as any } as any);
    }
    if (attempt < 3) {
      await ctx.scheduler.runAfter(15_000, internal.world.nudgeMeetingMovers, { worldId, attempt: attempt + 1 });
    }
  },
});

// Start the meeting as soon as Bukele reaches the podium (45,17)
export const startMeetingWhenBukeleArrives = internalMutation({
  args: { worldId: v.id('worlds'), attempt: v.number() },
  handler: async (ctx, { worldId, attempt }) => {
    const world = await ctx.db.get(worldId);
    if (!world) return;
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const bukele = playerDescriptions.find((d) => d.name === 'President Bukele');
    if (!bukele) return;
    const speaker = world.players.find((p: any) => p.id === bukele.playerId);
    if (speaker) {
      const x = Math.floor(speaker.position.x);
      const y = Math.floor(speaker.position.y);
      if (Math.abs(x - 45) <= 1 && Math.abs(y - 17) <= 1) {
        await ctx.scheduler.runAfter(0, internal.world.conductMeeting, { worldId });
        return;
      }
    }
    // Retry up to a generous number of times; continue gathering like a party
    if (attempt < 300) {
      await ctx.scheduler.runAfter(1000, (internal.world as any).startMeetingWhenBukeleArrives, {
        worldId,
        attempt: attempt + 1,
      });
    }
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
  handler: async (
    ctx,
    { worldId, icePlayerId, ms13PlayerId, destX, destY, attempt, bothArrivalTs },
  ) => {
    const world = await ctx.db.get(worldId);
    if (!world) return;
    const arrived = (pid: string) => {
      const p = world.players.find((pl: any) => pl.id === pid);
      if (!p) return false;
      const x = Math.floor(p.position.x);
      const y = Math.floor(p.position.y);
      // Consider arrived if within 1-tile radius of destination to avoid pathfinding stalls
      return Math.abs(x - destX) <= 1 && Math.abs(y - destY) <= 1;
    };
    const iceArrived = arrived(icePlayerId);
    const ms13Arrived = arrived(ms13PlayerId);
    const now = Date.now();
    // If one has arrived, make them wait at the cave entrance (hold position)
    if (iceArrived && !ms13Arrived) {
      await insertInput(ctx, worldId, 'setActivity', {
        playerId: icePlayerId,
        description: 'Waiting at cave entrance...'
        , emoji: '⏳', durationMs: 20000,
      } as any);
      await insertInput(ctx, worldId, 'forceMoveTo', { playerId: icePlayerId, destination: null } as any);
    }
    if (ms13Arrived && !iceArrived) {
      await insertInput(ctx, worldId, 'setActivity', {
        playerId: ms13PlayerId,
        description: 'Waiting at cave entrance...'
        , emoji: '⏳', durationMs: 20000,
      } as any);
      await insertInput(ctx, worldId, 'forceMoveTo', { playerId: ms13PlayerId, destination: null } as any);
    }
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
      if (now - bothArrivalTs >= 5_000) {
        await ctx.scheduler.runAfter(0, internal.world.resetChase, {
          worldId,
          icePlayerId,
          ms13PlayerId,
        });
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
    if (attempt >= 60) {
      // allow up to ~60s tracking
      await ctx.scheduler.runAfter(0, internal.world.resetChase, {
        worldId,
        icePlayerId,
        ms13PlayerId,
      });
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

    // NEW: If they're in a conversation, end it first.
    const conversation = world.conversations.find((c) => {
      const participants = c.participants.map((p) => p.playerId);
      return participants.includes(ice.playerId) && participants.includes(ms13.playerId);
    });
    if (conversation) {
      console.log(`Ending conversation ${conversation.id} to start chase...`);
      await insertInput(ctx, worldId, 'leaveConversation', {
        playerId: ice.playerId,
        conversationId: conversation.id,
      });
      await insertInput(ctx, worldId, 'leaveConversation', {
        playerId: ms13.playerId,
        conversationId: conversation.id,
      });
    }

    const dest = { x: 5, y: 45 } as any;
    // Set activities and speed multipliers
    await insertInput(ctx, worldId, 'setActivity', {
      playerId: ice.playerId,
      description: 'Chase MS-13...',
      emoji: '🚔',
      durationMs: 10000,
    } as any);
    await insertInput(ctx, worldId, 'setActivity', {
      playerId: ms13.playerId,
      description: 'Run for border...',
      emoji: '🦹',
      durationMs: 10000,
    } as any);
    await insertInput(ctx, worldId, 'setSpeedMultiplier', {
      playerId: ice.playerId,
      multiplier: 1.8,
    } as any);
    await insertInput(ctx, worldId, 'setSpeedMultiplier', {
      playerId: ms13.playerId,
      multiplier: 2.0,
    } as any);

    // Force both to move to cave destination
    await insertInput(ctx, worldId, 'forceMoveTo', {
      playerId: ice.playerId,
      destination: dest,
    } as any);
    await insertInput(ctx, worldId, 'forceMoveTo', {
      playerId: ms13.playerId,
      destination: dest,
    } as any);

    // Also dispatch President Bukele to a separate emergency location and keep him until reset
    if (bukele) {
      // Send Bukele to the tent area during chase
      const emergency = { x: 40, y: 8 } as any;
      await insertInput(ctx, worldId, 'setActivity', {
        playerId: bukele.playerId,
        description: 'Rushing to emergency room...',
        emoji: '🏥',
        durationMs: 10000,
      } as any);
      // Match speed to ICE for urgency
      await insertInput(ctx, worldId, 'setSpeedMultiplier', {
        playerId: bukele.playerId,
        multiplier: 1.8,
      } as any);
      await insertInput(ctx, worldId, 'forceMoveTo', {
        playerId: bukele.playerId,
        destination: emergency,
      } as any);
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

export const triggerChaseIfNeeded = internalAction({
  args: { worldId: v.id('worlds'), conversationId: v.string() },
  handler: async (ctx, args) => {
    const worldState = await ctx.runQuery(api.world.worldState, { worldId: args.worldId });
    if (!worldState) {
      console.error(`World ${args.worldId} not found for chase trigger.`);
      return;
    }
    const conversationExists = worldState.world.conversations.some(
      (c: SerializedConversation) => c.id === args.conversationId,
    );
    if (conversationExists) {
      console.log(`8s fallback: triggering chase for conversation ${args.conversationId}`);
      await ctx.runMutation(api.world.triggerChase, { worldId: args.worldId });
    } else {
      console.log(`8s fallback: conversation ${args.conversationId} ended, not triggering chase.`);
    }
  },
});

export const resetChase = internalMutation({
  args: { worldId: v.id('worlds'), icePlayerId: v.string(), ms13PlayerId: v.string() },
  handler: async (ctx, { worldId, icePlayerId, ms13PlayerId }) => {
    // Move all BTC from MS-13 to ICE upon arrival/reset
    await ctx.scheduler.runAfter(0, internal.economy.transferAllBalance, {
      fromId: ms13PlayerId,
      toId: icePlayerId,
    });
    await insertInput(ctx, worldId, 'setSpeedMultiplier', {
      playerId: icePlayerId,
      multiplier: null,
    } as any);
    await insertInput(ctx, worldId, 'setSpeedMultiplier', {
      playerId: ms13PlayerId,
      multiplier: null,
    } as any);
    // Clear activity banners quickly
    await insertInput(ctx, worldId, 'setActivity', {
      playerId: icePlayerId,
      description: '',
      emoji: undefined,
      durationMs: 1,
    } as any);
    await insertInput(ctx, worldId, 'setActivity', {
      playerId: ms13PlayerId,
      description: '',
      emoji: undefined,
      durationMs: 1,
    } as any);
    // Stop movement by sending null destination
    await insertInput(ctx, worldId, 'forceMoveTo', {
      playerId: icePlayerId,
      destination: null,
    } as any);
    await insertInput(ctx, worldId, 'forceMoveTo', {
      playerId: ms13PlayerId,
      destination: null,
    } as any);
    // Also clear Bukele's state if present
    const world = await ctx.db.get(worldId);
    if (world) {
      const buk = world.players.find((p: any) => p.name === 'President Bukele');
      if (buk) {
        await insertInput(ctx, worldId, 'setSpeedMultiplier', {
          playerId: buk.id,
          multiplier: null,
        } as any);
        await insertInput(ctx, worldId, 'setActivity', {
          playerId: buk.id,
          description: '',
          emoji: undefined,
          durationMs: 1,
        } as any);
        await insertInput(ctx, worldId, 'forceMoveTo', {
          playerId: buk.id,
          destination: null,
        } as any);
      }
    }
    // Relocate both agents to random spots to resume normal behavior
    const randomDest = () => ({
      x: Math.floor(Math.random() * 50) + 5,
      y: Math.floor(Math.random() * 50) + 5,
    });
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
    await insertInput(ctx, worldId, 'forceMoveTo', {
      playerId: icePlayerId,
      destination: iceDest,
    } as any);
    await insertInput(ctx, worldId, 'forceMoveTo', {
      playerId: ms13PlayerId,
      destination: ms13Dest,
    } as any);
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
    await ctx.scheduler.runAfter(0, internal.world.ensurePoliceAndRobber, {
      worldId: args.worldId,
    });
    await ctx.scheduler.runAfter(0, internal.economy.backfillMissingPortfolios, {
      worldId: args.worldId,
    });
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
      await ctx.scheduler.runAfter(1000, internal.world.completeJoining, {
        worldId,
        tokenIdentifier,
      });
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

// Lightweight: get a player's current activity from the world by playerId
export const getPlayerActivity = query({
  args: { worldId: v.id('worlds'), playerId },
  handler: async (ctx, { worldId, playerId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) throw new Error(`Invalid world ${worldId}`);
    const p = world.players.find((pl: any) => pl.id === playerId);
    return p?.activity ?? null;
  },
});

export const getLatestMeetingNotes = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    // Find any agent's latest meeting memory. They all get the same one.
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    if (!playerDescriptions.length) return null;
    // Just grab the first player to check their memory for meeting notes.
    const anyPlayerId = playerDescriptions[0].playerId;
    const latestMeetingMemory = await ctx.db
      .query('memories')
      .withIndex('playerId_type', (q) => q.eq('playerId', anyPlayerId).eq('data.type', 'meeting'))
      .order('desc')
      .first();
    return latestMeetingMemory;
  },
});

export const gatherAll = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) throw new Error('World not found');
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const bukele = playerDescriptions.find((d) => d.name === 'President Bukele');
    if (!bukele) throw new Error('President Bukele not found to start a meeting.');

    // Do NOT set villageState.meeting yet; setting it early can cause agents to switch
    // to 'meeting' activity and stop moving. Bubble UI shows a client-side placeholder during gather.

    // Force-move Bukele to podium and give him a small speed bump
    await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: bukele.playerId, multiplier: 1.6 } as any);
    await insertInput(ctx, worldId, 'forceMoveTo', {
      playerId: bukele.playerId,
      destination: { x: 45, y: 17 } as any,
    } as any);

    // Force-move all other non-human agents into the designated rectangle (spacing 2)
    const minX = 42, maxX = 51, minY = 19, maxY = 24, spacing = 2;
    const targets: { x: number; y: number }[] = [];
    for (let y = minY; y <= maxY; y += spacing) {
      for (let x = minX; x <= maxX; x += spacing) {
        targets.push({ x, y });
      }
    }
    const others = world.agents.filter((a: any) => a.playerId !== bukele.playerId);
    let idx = 0;
    for (const agent of others) {
      const dest = targets[Math.min(idx, targets.length - 1)];
      idx++;
      await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: agent.playerId, multiplier: 1.6 } as any);
      await insertInput(ctx, worldId, 'forceMoveTo', { playerId: agent.playerId, destination: dest as any } as any);
    }

    // Start the meeting after a fixed delay to allow everyone to arrive
    await ctx.scheduler.runAfter(60_000, internal.world.conductMeeting, { worldId });
    // Gentle nudges to help stragglers: re-issue move orders a couple times
    await ctx.scheduler.runAfter(5_000, internal.world.nudgeMeetingMovers, { worldId, attempt: 0 });
    await ctx.scheduler.runAfter(300_000, internal.world.dismissMeeting, { worldId });
  },
});

export const conductMeeting = internalAction({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const { villageState, recentNews, agents, bukele } = await ctx.runQuery(
      internal.world.getMeetingData,
      { worldId },
    );
    if (!villageState || !agents.length || !bukele) return;

    const agentPortfolios = await ctx.runQuery(api.economy.getAgentPortfolios, { worldId });
    const totalAgentBtc = agentPortfolios.reduce((sum: number, p: { btcBalance: number }) => sum + p.btcBalance, 0);

    const btcNow = villageState.btcPrice;
    const btcPrev = villageState.previousBtcPrice;
    const btcDelta = btcNow - btcPrev;
    const btcPct = btcPrev ? (btcDelta / btcPrev) * 100 : 0;
    const treasuryBtc = villageState.treasury;
    const treasuryUsd = treasuryBtc * btcNow;
    const touristCount = villageState.touristCount ?? 0;

    const headlines = (recentNews ?? []).map((n: Doc<'news'>) => n.headline);
    const topHeadlines = headlines.slice(0, 3);

    const newsText =
      topHeadlines.length > 0
        ? `Recent news: ${topHeadlines.map((h: string, i: number) => `#${i + 1} ${h}`).join(' | ')}`
        : 'No recent news.';

    const trendText = btcDelta === 0
      ? 'BTC price is unchanged since last time.'
      : `BTC is ${btcDelta > 0 ? 'up' : 'down'} ${Math.abs(btcPct).toFixed(2)}% since last time.`;

    const summary =
      `Town Meeting Notes — Treasury: ${treasuryBtc.toFixed(4)} BTC ($${treasuryUsd.toFixed(2)} USD). ` +
      `Tourist visits: ${touristCount}. Combined agent holdings: ${totalAgentBtc.toFixed(4)} BTC. ` +
      `${trendText} ${newsText}`;

    const { embedding } = await fetchEmbedding(summary);

    await ctx.runMutation(internal.world.recordMeeting, {
      worldId,
      summary,
      speakerId: bukele.playerId,
    });

    for (const agent of agents) {
      await ctx.runMutation(internal.agent.memory.insertMemory, {
        playerId: agent.playerId,
        agentId: agent.id,
        description: summary,
        embedding,
        importance: 9,
        lastAccess: Date.now(),
        data: { type: 'meeting' },
      });
    }
  },
});

export const recordMeeting = internalMutation({
  args: {
    worldId: v.id('worlds'),
    summary: v.string(),
    speakerId: playerId,
  },
  handler: async (ctx, { worldId, summary, speakerId }) => {
    // Retry up to 5 times to avoid generationNumber mismatches
    for (let i = 0; i < 5; i++) {
      try {
        const villageState = await ctx.db.query('villageState').unique();
        if (villageState) {
          await ctx.db.patch(villageState._id, {
            meeting: {
              speakerId,
              summary,
              startTime: Date.now(),
            },
          });
        }
        return;
      } catch (e: any) {
        if (String(e?.message || '').includes('generationNumber') || String(e).includes('generationNumber')) {
          await ctx.scheduler.runAfter(100, internal.world.recordMeeting, { worldId, summary, speakerId });
          return;
        }
        throw e;
      }
    }
  },
});

export const getMeetingData = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) {
      return { villageState: null, recentNews: [], agents: [], bukele: null };
    }
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const bukeleDesc = playerDescriptions.find((d) => d.name === 'President Bukele');
    const allNews = await ctx.db.query('news').order('desc').collect();
    const recentNews = allNews.slice(0, 5);
    return {
      villageState: await ctx.db.query('villageState').unique(),
      recentNews,
      agents: world?.agents ?? [],
      bukele: bukeleDesc || null,
    };
  },
});

export const dismissMeeting = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const villageState = await ctx.db.query('villageState').unique();
    if (villageState) {
      await ctx.db.patch(villageState._id, { meeting: undefined });
    }
    // Reset any lingering meeting-related activities and movement
    const world = await ctx.db.get(worldId);
    if (world) {
      for (const p of world.players as any[]) {
        if (p.activity && (p.activity.description?.includes('Meeting') || p.activity.description?.includes('Listening') || p.activity.description?.includes('Leading'))) {
          await insertInput(ctx, worldId, 'setActivity', { playerId: p.id, description: '', emoji: undefined, durationMs: 1 } as any);
        }
        await insertInput(ctx, worldId, 'forceMoveTo', { playerId: p.id, destination: null } as any);
        await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: p.id, multiplier: null } as any);
      }
    }
  },
});

export const triggerParty = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const villageState = await ctx.db.query('villageState').unique();
    if (villageState) {
      await ctx.db.patch(villageState._id, { isPartyActive: true });
    }
    await ctx.scheduler.runAfter(30 * 60 * 1000, internal.world.dismissParty, { worldId });
  },
});

export const stopParty = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    // In a real app, you'd want to add admin-level auth here.
    const villageState = await ctx.db.query('villageState').unique();
    if (villageState && !villageState.isPartyActive) {
      console.log('No party to stop.');
      return;
    }
    // Directly call the internal dismissParty logic.
    await ctx.runMutation(internal.world.dismissParty, { worldId });
  },
});

export const dismissParty = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const villageState = await ctx.db.query('villageState').unique();
    if (villageState && villageState.isPartyActive) {
      await ctx.db.patch(villageState._id, { isPartyActive: false });
      await ctx.scheduler.runAfter(0, internal.economy.transferAllToBukele, { worldId });
      // Reset visuals and states for all players
      const world = await ctx.db.get(worldId);
      if (world) {
        for (const p of world.players as any[]) {
          await insertInput(ctx, worldId, 'setActivity', { playerId: p.id, description: '', emoji: undefined, durationMs: 1 } as any);
          await insertInput(ctx, worldId, 'forceMoveTo', { playerId: p.id, destination: null } as any);
          await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: p.id, multiplier: null } as any);
        }
      }
    }
  },
});

export const getSocialFeed = query({
  handler: async (ctx) => {
    return await ctx.db.query('tweets').withIndex('by_creation_time').order('desc').take(20);
  },
});

export const addTweetToFeed = internalMutation({
  args: {
    worldId: v.id('worlds'),
    authorId: playerId,
    authorName: v.string(),
    text: v.string(),
    twitterTweetId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.twitterTweetId) {
      const existing = await ctx.db.query('tweets').withIndex('by_twitter_id', (q) => q.eq('twitterTweetId', args.twitterTweetId)).first();
      if (existing) {
        console.log(`Tweet ${args.twitterTweetId} already exists, skipping.`);
        return;
      }
    }
    await ctx.db.insert('tweets', {
      worldId: args.worldId,
      authorId: args.authorId,
      authorName: args.authorName,
      text: args.text,
      twitterTweetId: args.twitterTweetId,
    });
  },
});

export const getRecentTweets = internalQuery({
  args: { numTweets: v.optional(v.number()) },
  handler: async (ctx, { numTweets = 1 }) => {
    return await ctx.db.query('tweets').withIndex('by_creation_time').order('desc').take(numTweets);
  },
});

export const createPendingTweet = internalMutation({
  args: { worldId: v.id('worlds'), agentId, text: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert('pendingTweets', {
      worldId: args.worldId,
      agentId: args.agentId,
      text: args.text,
      status: 'pending',
    });
  },
});

export const getPendingTweets = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query('pendingTweets')
      .withIndex('worldId_status', (q) => q.eq('worldId', args.worldId).eq('status', 'pending'))
      .collect();
    
    const world = await ctx.db.get(args.worldId);
    if (!world) {
        return [];
    }

    return Promise.all(
      pending.map(async (tweet) => {
        const agent = world.agents.find((a) => a.id === tweet.agentId);
        if (!agent) return null;
        const player = await ctx.db
          .query('playerDescriptions')
          .withIndex('worldId', q => q.eq('worldId', args.worldId).eq('playerId', agent.playerId))
          .first();
        if (!player) return null;
        return { ...tweet, agent, player };
      }),
    ).then(results => results.filter(Boolean) as NonNullable<typeof results[0]>[]);
  },
});

export const getPendingTweet = internalQuery({
  args: { pendingTweetId: v.id('pendingTweets') },
  handler: async (ctx, { pendingTweetId }) => {
    const tweet = await ctx.db.get(pendingTweetId);
    if (!tweet) return null;
    const world = await ctx.db.get(tweet.worldId);
    if (!world) return null;
    const agent = world.agents.find((a) => a.id === tweet.agentId);
    if (!agent) return null;
    const player = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', q => q.eq('worldId', tweet.worldId).eq('playerId', agent.playerId))
      .first();
    if (!player) return null;
    return { ...tweet, agent, player };
  }
});

export const getPlayerDescriptions = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    return await ctx.db.query('playerDescriptions').withIndex('worldId', q => q.eq('worldId', args.worldId)).collect();
  }
});

export const getBukeleAgentData = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) return null;

    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    const bukeleDesc = playerDescriptions.find((d) => d.name === 'President Bukele');
    if (!bukeleDesc) return null;

    const agent = world.agents.find((a: any) => a.playerId === bukeleDesc.playerId);
    if (!agent) return null;

    return { agent };
  },
});

export const markPendingTweetPosted = internalMutation({
  args: { pendingTweetId: v.id('pendingTweets') },
  handler: async (ctx, { pendingTweetId }) => {
    await ctx.db.patch(pendingTweetId, { status: 'posted' });
  },
});

export const markPendingTweetFailed = internalMutation({
  args: { pendingTweetId: v.id('pendingTweets') },
  handler: async (ctx, { pendingTweetId }) => {
    await ctx.db.patch(pendingTweetId, { status: 'failed' });
  },
});