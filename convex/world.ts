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
import { playerId } from './aiTown/ids';
import { kickEngine, startEngine, stopEngine } from './aiTown/main';
import { engineInsertInput } from './engine/abstractGame';
import { fetchEmbedding } from './util/llm';
import { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { GameId } from './aiTown/ids';

export const defaultWorldStatus = query({
  handler: async (ctx: QueryCtx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    return worldStatus;
  },
});

// New internal mutation to manage chase trigger fallback
export const triggerChaseIfNeeded = internalMutation({
  args: {
    worldId: v.id('worlds'),
    conversationId: v.string(), // The conversation that might trigger the chase
  },
  handler: async (ctx: MutationCtx, { worldId, conversationId }: { worldId: Id<'worlds'>; conversationId: string }) => {
    const world: Doc<'worlds'> | null = await ctx.db.get(worldId);
    if (!world) return;

    // Check if the conversation is still active
    const activeConversation = world.conversations.find((c) => c.id === conversationId);
    if (!activeConversation) {
      console.log(`Conversation ${conversationId} ended before chase trigger.`);
      return;
    }

    // Find ICE and MS-13 in the current conversation
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const ice = playerDescriptions.find((p) => p.name === 'ICE');
    const ms13 = playerDescriptions.find((p) => p.name === 'MS-13');

    if (ice && ms13 && activeConversation.participants.some(p => p.playerId === ice.playerId) && activeConversation.participants.some(p => p.playerId === ms13.playerId)) {
      console.log('Fallback: Triggering chase due to 8s timeout in ICE/MS-13 conversation.');
      await ctx.runMutation(api.world.triggerChase, { worldId });
    }
  },
});


// Re-issue meeting move orders for stragglers a few times (party-style nudge without gating)
export const nudgeMeetingMovers = internalMutation({
  args: { worldId: v.id('worlds'), attempt: v.number() },
  handler: async (ctx: MutationCtx, { worldId, attempt }: { worldId: Id<'worlds'>; attempt: number }) => {
    const world: Doc<'worlds'> | null = await ctx.db.get(worldId);
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
    const others = world.agents.filter((a) => a.playerId !== bukele.playerId); // Explicitly type a
    let idx = 0;
    for (const agent of others) {
      const p = world.players.find((pl) => pl.id === agent.playerId); // Explicitly type pl
      if (!p) continue;
      const atPlaza = Math.floor(p.position.x) >= minX && Math.floor(p.position.x) <= maxX && Math.floor(p.position.y) >= minY && Math.floor(p.position.y) <= maxY;
      if (atPlaza) continue;
      const dest = targets[Math.min(idx, targets.length - 1)];
      idx++;
      await insertInput(ctx, worldId, 'forceMoveTo', { playerId: agent.playerId, destination: dest });
    }
    if (attempt < 3) {
      await ctx.scheduler.runAfter(15_000, internal.world.nudgeMeetingMovers, { worldId, attempt: attempt + 1 });
    }
  },
});

// Start the meeting as soon as Bukele reaches the podium (45,17)
export const startMeetingWhenBukeleArrives = internalMutation({
  args: { worldId: v.id('worlds'), attempt: v.number() },
  handler: async (ctx: MutationCtx, { worldId, attempt }: { worldId: Id<'worlds'>; attempt: number }) => {
    const world: Doc<'worlds'> | null = await ctx.db.get(worldId);
    if (!world) return;
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const bukele = playerDescriptions.find((d) => d.name === 'President Bukele');
    if (!bukele) return;
    const speaker = world.players.find((p) => p.id === bukele.playerId); // Explicitly type p
    if (speaker) {
      const x = Math.floor(speaker.position.x);
      const y = Math.floor(speaker.position.y);
      if (Math.abs(x - 45) <= 1 && Math.abs(y - 17) <= 1) {
        // Fix: Call the newly added `conductMeeting` internal mutation
        await ctx.scheduler.runAfter(0, internal.world.conductMeeting, { worldId });
        return;
      }
    }
    // Retry up to a generous number of times; continue gathering like a party
    if (attempt < 300) {
      await ctx.scheduler.runAfter(1000, internal.world.startMeetingWhenBukeleArrives, {
        worldId,
        attempt: attempt + 1,
      });
    }
  },
});

// New internal mutation to conduct the actual town meeting
export const conductMeeting = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: MutationCtx, { worldId }: { worldId: Id<'worlds'> }) => {
    const villageState = await ctx.db.query('villageState').unique();
    if (!villageState) throw new Error('Village state not found.');

    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const bukele = playerDescriptions.find((d) => d.name === 'President Bukele');
    if (!bukele) throw new Error('President Bukele not found.');

    const summary = 'The town meeting covered the strong Bitcoin price performance, encouraging citizens to continue holding BTC and supporting local economic activities. President Bukele emphasized continued growth and stability.';

    await ctx.db.patch(villageState._id, {
      meeting: {
        speakerId: bukele.playerId,
        summary,
        startTime: Date.now(),
      },
      lastMeetingTime: Date.now(), // Update cooldown
    });
    console.log(`Town meeting started, Bukele is speaking: ${summary}`);

    // Schedule the meeting to end after a duration, e.g., 5 minutes
    await ctx.scheduler.runAfter(300_000, internal.world.endMeeting, { worldId }); // 5 minutes
  },
});

// New internal mutation to end the town meeting
export const endMeeting = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: MutationCtx, { worldId }: { worldId: Id<'worlds'> }) => {
    const villageState = await ctx.db.query('villageState').unique();
    if (villageState && villageState.meeting) {
      await ctx.db.patch(villageState._id, { meeting: undefined }); // Set to undefined to clear optional field
      console.log('Town meeting ended.');
      // After the meeting, transfer all balances to Bukele.
      await ctx.scheduler.runAfter(0, internal.economy.transferAllToBukele, { worldId });
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
    ctx: MutationCtx,
    { worldId, icePlayerId, ms13PlayerId, destX, destY, attempt, bothArrivalTs }: { worldId: Id<'worlds'>; icePlayerId: string; ms13PlayerId: string; destX: number; destY: number; attempt: number; bothArrivalTs?: number },
  ) => {
    const world: Doc<'worlds'> | null = await ctx.db.get(worldId);
    if (!world) return;
    const arrived = (pid: string) => {
      const p = world.players.find((pl) => pl.id === pid); // Explicitly type pl
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
      });
      await insertInput(ctx, worldId, 'forceMoveTo', { playerId: icePlayerId, destination: null });
    }
    if (ms13Arrived && !iceArrived) {
      await insertInput(ctx, worldId, 'setActivity', {
        playerId: ms13PlayerId,
        description: 'Waiting at cave entrance...'
        , emoji: '⏳', durationMs: 20000,
      });
      await insertInput(ctx, worldId, 'forceMoveTo', { playerId: ms13PlayerId, destination: null });
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
        // Fix: Call the newly added `resetChase` internal mutation
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
      // Fix: Call the newly added `resetChase` internal mutation
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

// New internal mutation to reset chase status
export const resetChase = internalMutation({
  args: {
    worldId: v.id('worlds'),
    icePlayerId: v.string(),
    ms13PlayerId: v.string(),
  },
  handler: async (ctx: MutationCtx, { worldId, icePlayerId, ms13PlayerId }: { worldId: Id<'worlds'>; icePlayerId: string; ms13PlayerId: string }) => {
    // Reset any chase-related activities or speed multipliers
    await insertInput(ctx, worldId, 'setActivity', {
      playerId: icePlayerId as GameId<'players'>,
      description: 'Patrolling for MS-13',
      emoji: '🚔',
      durationMs: 300000, // 5 minutes
    });
    await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: icePlayerId as GameId<'players'>, multiplier: null });
    await insertInput(ctx, worldId, 'forceMoveTo', { playerId: icePlayerId as GameId<'players'>, destination: null });

    await insertInput(ctx, worldId, 'setActivity', {
      playerId: ms13PlayerId as GameId<'players'>,
      description: 'Blending in',
      emoji: '🦹',
      durationMs: 300000, // 5 minutes
    });
    await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: ms13PlayerId as GameId<'players'>, multiplier: null });
    await insertInput(ctx, worldId, 'forceMoveTo', { playerId: ms13PlayerId as GameId<'players'>, destination: null });

    console.log('Chase reset.');
  },
});

// New internal mutation to ensure ICE and MS-13 exist
export const ensurePoliceAndRobber = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: MutationCtx, { worldId }: { worldId: Id<'worlds'> }) => {
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const ice = playerDescriptions.find((p) => p.name === 'ICE');
    const ms13 = playerDescriptions.find((p) => p.name === 'MS-13');
    if (!ice) {
      const iceDescIndex = Descriptions.findIndex(d => d.name === 'ICE');
      if (iceDescIndex !== -1) {
        console.log('Creating missing ICE agent...');
        await insertInput(ctx, worldId, 'createAgent', { descriptionIndex: iceDescIndex });
      }
    }
    if (!ms13) {
      const ms13DescIndex = Descriptions.findIndex(d => d.name === 'MS-13');
      if (ms13DescIndex !== -1) {
        console.log('Creating missing MS-13 agent...');
        await insertInput(ctx, worldId, 'createAgent', { descriptionIndex: ms13DescIndex });
      }
    }
  },
});

// Admin/public trigger to start a cave chase between ICE and MS-13.
export const triggerChase = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: MutationCtx, { worldId }: { worldId: Id<'worlds'> }) => {
    // Check cooldown
    const villageState = await ctx.db.query('villageState').unique();
    const now = Date.now();
    const cooldownMs = (villageState?.cooldownMinutes || 60) * 60 * 1000;
    
    if (villageState?.lastChaseTime && now - villageState.lastChaseTime < cooldownMs) {
      const remainingMinutes = Math.ceil((villageState.lastChaseTime + cooldownMs - now) / (60 * 1000));
      throw new Error(`Chase is on cooldown. Please wait ${remainingMinutes} more minutes.`);
    }
    
    // Update last chase time
    if (villageState) {
      await ctx.db.patch(villageState._id, { lastChaseTime: now });
    }
    const world: Doc<'worlds'> | null = await ctx.db.get(worldId);
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
      // Fix: Call the newly added `ensurePoliceAndRobber` internal mutation
      await ctx.scheduler.runAfter(0, internal.world.ensurePoliceAndRobber, { worldId });
      throw new Error('ICE or MS-13 missing; ensured and please retry');
    }

    // NEW: If they're in a conversation, end it first.
    const conversation = world.conversations.find((c) => {
      const participants = [...c.participants.values()].map((p) => p.playerId); // Get playerIds from ConversationMembership objects
      return participants.includes(ice.playerId) && participants.includes(ms13.playerId);
    });
    if (conversation) {
      console.log(`Ending conversation ${conversation.id} between ICE and MS-13 to start chase.`);
      await insertInput(ctx, worldId, 'leaveConversation', { playerId: ice.playerId, conversationId: conversation.id });
      await insertInput(ctx, worldId, 'leaveConversation', { playerId: ms13.playerId, conversationId: conversation.id });
      // Wait a moment for the leave to process
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Assign chase activity, speed multiplier, and destination
    await insertInput(ctx, worldId, 'setActivity', {
      playerId: ice.playerId,
      description: 'Chase MS-13...',
      emoji: '🚨',
      durationMs: 60000, // 1 minute
    });
    await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: ice.playerId, multiplier: 1.5 });
    await insertInput(ctx, worldId, 'forceMoveTo', { playerId: ice.playerId, destination: { x: 32, y: 31 } }); // Cave entrance

    await insertInput(ctx, worldId, 'setActivity', {
      playerId: ms13.playerId,
      description: 'Run for border...',
      emoji: '🏃',
      durationMs: 60000,
    });
    await insertInput(ctx, worldId, 'setSpeedMultiplier', { playerId: ms13.playerId, multiplier: 1.8 });
    await insertInput(ctx, worldId, 'forceMoveTo', { playerId: ms13.playerId, destination: { x: 33, y: 30 } }); // Border tunnel
    
    // Start monitoring the chase
    await ctx.scheduler.runAfter(1000, internal.world.monitorChase, {
      worldId,
      icePlayerId: ice.playerId,
      ms13PlayerId: ms13.playerId,
      destX: 33, // Target X for the cave/border
      destY: 30, // Target Y for the cave/border
      attempt: 0,
    });

    console.log(`Chase started in world ${worldId} between ${ice.name} and ${ms13.name}`);
    return { success: true };
  },
});


// Admin/public trigger to start a town meeting
export const gatherAll = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: MutationCtx, { worldId }: { worldId: Id<'worlds'> }) => {
    const villageState = await ctx.db.query('villageState').unique();
    const now = Date.now();
    const cooldownMs = (villageState?.cooldownMinutes || 60) * 60 * 1000;

    if (villageState?.lastMeetingTime && now - villageState.lastMeetingTime < cooldownMs) {
      const remainingMinutes = Math.ceil((villageState.lastMeetingTime + cooldownMs - now) / (60 * 1000));
      throw new Error(`Meeting is on cooldown. Please wait ${remainingMinutes} more minutes.`);
    }

    const world: Doc<'worlds'> | null = await ctx.db.get(worldId);
    if (!world) throw new Error(`Invalid world ID: ${worldId}`);
    const playerDescriptions = await ctx.db.query('playerDescriptions').withIndex('worldId', (q) => q.eq('worldId', worldId)).collect();
    const bukele = playerDescriptions.find(d => d.name === 'President Bukele');
    if (!bukele) throw new Error('President Bukele not found for the meeting.');

    // Announce the meeting (this is a separate message in the chat feed)
    // All other agents will be moved by the agent tick logic to the meeting spot.
    await insertInput(ctx, worldId, 'setActivity', {
      playerId: bukele.playerId,
      description: 'Calling town meeting...',
      emoji: '📢',
      durationMs: 60000,
    });

    // Schedule Bukele to move to the podium (45,17)
    await insertInput(ctx, worldId, 'forceMoveTo', { playerId: bukele.playerId, destination: { x: 45, y: 17 } });

    // Start monitoring Bukele's arrival to trigger the actual meeting start
    await ctx.scheduler.runAfter(1000, internal.world.startMeetingWhenBukeleArrives, { worldId, attempt: 0 });

    // Nudge other agents towards the meeting plaza (this will be an ongoing nudge)
    await ctx.scheduler.runAfter(10000, internal.world.nudgeMeetingMovers, { worldId, attempt: 0 });

    console.log(`Town meeting called by President Bukele in world ${worldId}.`);
    return { success: true };
  },
});

// Admin/public trigger to start a town party
export const triggerParty = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: MutationCtx, { worldId }: { worldId: Id<'worlds'> }) => {
    const villageState = await ctx.db.query('villageState').unique();
    const now = Date.now();
    const cooldownMs = (villageState?.cooldownMinutes || 60) * 60 * 1000;

    if (villageState?.lastPartyTime && now - villageState.lastPartyTime < cooldownMs) {
      const remainingMinutes = Math.ceil((villageState.lastPartyTime + cooldownMs - now) / (60 * 1000));
      throw new Error(`Party is on cooldown. Please wait ${remainingMinutes} more minutes.`);
    }

    if (villageState) {
      await ctx.db.patch(villageState._id, { isPartyActive: true, lastPartyTime: now });
    } else {
      throw new Error('Village state not found.');
    }
    console.log(`Party started in world ${worldId}`);
    return { success: true };
  },
});

// Admin/public trigger to stop a town party
export const stopParty = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: MutationCtx, { worldId }: { worldId: Id<'worlds'> }) => {
    const villageState = await ctx.db.query('villageState').unique();
    if (villageState && villageState.isPartyActive) {
      await ctx.db.patch(villageState._id, { isPartyActive: false });
      // When the party ends, all agents transfer their earnings to Bukele.
      await ctx.scheduler.runAfter(0, internal.economy.transferAllToBukele, { worldId });
      console.log(`Party ended in world ${worldId}`);
    } else {
      throw new Error('No active party to stop.');
    }
    return { success: true };
  },
});


// Query for UI to get the world's current state
export const worldState = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: QueryCtx, args: { worldId: Id<'worlds'> }) => {
    const worldDoc = await ctx.db.get(args.worldId);
    if (!worldDoc) return null;
    
    // Return the world data in the format expected by the World class
    return {
      nextId: worldDoc.nextId,
      conversations: worldDoc.conversations || {},
      players: worldDoc.players || {},
      agents: worldDoc.agents || {},
      historicalLocations: worldDoc.historicalLocations,
    };
  },
});

// Query for UI to get player and agent descriptions and map
export const gameDescriptions = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: QueryCtx, args: { worldId: Id<'worlds'> }) => {
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
      .unique();
    if (!worldMap) {
      throw new Error(`No map found for world ${args.worldId}`);
    }
    return { playerDescriptions, agentDescriptions, worldMap };
  },
});


export const villageState = query({
  handler: async (ctx: QueryCtx) => {
    return await ctx.db.query('villageState').unique();
  },
});

export const getLatestMeetingNotes = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: QueryCtx, { worldId }: { worldId: Id<'worlds'> }) => {
    // Get the actual meeting notes from villageState if available
    const vState = await ctx.db.query('villageState').unique();
    if (vState?.meeting) {
      return {
        _id: 'meeting-notes', // Dummy ID
        _creationTime: vState.meeting.startTime,
        description: vState.meeting.summary,
      };
    }
    // If no active meeting, return the latest archived meeting notes or null
    // The 'worldId' index on 'memories' is only for 'playerId_type'
    // A direct query on 'worldId' for 'memories' would require a dedicated index
    // Assuming a 'meeting' type memory could exist and using an existing index if possible,
    // or adapting the query. For now, we'll return null if no active meeting notes.
    return null;
  },
});

export const getPlayerActivity = query({
  args: { worldId: v.id('worlds'), playerId: playerId },
  handler: async (ctx: QueryCtx, { worldId, playerId }: { worldId: Id<'worlds'>; playerId: GameId<'players'> }) => {
    const world: Doc<'worlds'> | null = await ctx.db.get(worldId);
    if (!world) return null;
    const player = world.players.find(p => p.id === playerId);
    return player?.activity ?? null;
  },
});

export const previousConversation = query({
  args: { worldId: v.id('worlds'), playerId: playerId },
  handler: async (ctx: QueryCtx, args: { worldId: Id<'worlds'>; playerId: GameId<'players'> }) => {
    const lastParticipated = await ctx.db
      .query('participatedTogether')
      .withIndex('playerHistory', (q) =>
        q.eq('worldId', args.worldId).eq('player1', args.playerId),
      )
      .order('desc')
      .first();
    if (!lastParticipated) {
      return null;
    }
    const conversation = await ctx.db
      .query('archivedConversations')
      .withIndex('worldId', (q) =>
        q.eq('worldId', args.worldId).eq('id', lastParticipated.conversationId),
      )
      .first();
    if (!conversation) {
      throw new Error(`Conversation ${lastParticipated.conversationId} not found`);
    }
    return conversation;
  },
});

// Mutations for controlling the engine from the client.
export const joinWorld = mutation({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx: MutationCtx, args: { worldId: Id<'worlds'> }): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError('Not logged in');
    }
    // Correctly query the 'worlds' table and then check players within the document
    const world: Doc<'worlds'> | null = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`World ${args.worldId} not found`);
    }
    const player = world.players.find((p) => p.human === identity.tokenIdentifier);
    if (player) {
      throw new ConvexError('Already in this world');
    }
    // Submit an input to the game engine to add the player
    return await ctx.runMutation(api.aiTown.main.sendInput, { 
      worldId: args.worldId, 
      name: 'join', 
      args: {
        name: identity.nickname ?? DEFAULT_NAME,
        characterName: 'f1', // default character
        description: 'A human tourist in X402 AI Town.',
        character: 'f1', // default character
        tokenIdentifier: identity.tokenIdentifier,
      }
    });
  },
});

export const leaveWorld = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: MutationCtx, args: { worldId: Id<'worlds'> }): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError('Not logged in');
    }
    // Correctly query the 'worlds' table and then find the player within the document
    const world: Doc<'worlds'> | null = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`World ${args.worldId} not found`);
    }
    const player = world.players.find((p) => p.human === identity.tokenIdentifier);
    if (!player) {
      throw new ConvexError('Not in this world');
    }
    // Submit an input to the game engine to remove the player
    return await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'leave',
      args: {
        playerId: player.id,
      }
    });
  },
});

export const sendWorldInput = mutation({
  args: {
    engineId: v.id('engines'),
    name: v.string(),
    args: v.any(),
  },
  handler: async (ctx: MutationCtx, args: { engineId: Id<'engines'>; name: string; args: any }) => {
    return await engineInsertInput(ctx, args.engineId, args.name as any, args.args);
  },
});

export const heartbeatWorld = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx: MutationCtx, args: { worldId: Id<'worlds'> }) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .unique();
    if (!worldStatus) {
      throw new Error(`World ${args.worldId} not found`);
    }
    await ctx.db.patch(worldStatus._id, { lastViewed: Date.now() });
  },
});

// For crons to stop inactive worlds
export const stopInactiveWorlds = internalMutation({
  handler: async (ctx: MutationCtx) => {
    const now = Date.now();
    const inactiveWorlds = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .filter((q) => q.eq(q.field('status'), 'running'))
      .filter((q) => q.lt(q.field('lastViewed'), now - IDLE_WORLD_TIMEOUT))
      .collect();
    for (const worldStatus of inactiveWorlds) {
      console.log(`Stopping inactive world ${worldStatus.worldId}`);
      await stopEngine(ctx, worldStatus.worldId);
      await ctx.db.patch(worldStatus._id, { status: 'inactive' });
    }
  },
});

// For crons to restart dead worlds
export const restartDeadWorlds = internalMutation({
  handler: async (ctx: MutationCtx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .filter((q) => q.eq(q.field('status'), 'inactive'))
      .first();
    if (worldStatus) {
      console.log(`Restarting inactive world ${worldStatus.worldId}`);
      await ctx.db.patch(worldStatus._id, { status: 'running' });
      await startEngine(ctx, worldStatus.worldId);
    }
  },
});