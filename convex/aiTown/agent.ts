import { ObjectType, v } from 'convex/values';
import { GameId, parseGameId } from './ids';
import { agentId, conversationId, playerId } from './ids';
import { serializedPlayer } from './player';
import { Game } from './game';
import {
  ACTION_TIMEOUT,
  AWKWARD_CONVERSATION_TIMEOUT,
  CONVERSATION_COOLDOWN,
  CONVERSATION_DISTANCE,
  INVITE_ACCEPT_PROBABILITY,
  INVITE_TIMEOUT,
  MAX_CONVERSATION_DURATION,
  MAX_CONVERSATION_MESSAGES,
  MESSAGE_COOLDOWN,
  MIDPOINT_THRESHOLD,
  PLAYER_CONVERSATION_COOLDOWN,
} from '../constants';
import { FunctionArgs } from 'convex/server';
import { MutationCtx, internalMutation, internalQuery } from '../_generated/server';
import { distance } from '../util/geometry';
import { internal } from '../_generated/api';
import { movePlayer, blocked } from './movement';
import { insertInput } from './insertInput';
import { inputHandler } from './inputHandler';
import { Point, point } from '../util/types';
import { Descriptions } from '../../data/characters';
import { Player, activity } from './player';
import { Conversation, conversationInputs } from './conversation';
import { AgentDescription } from './agentDescription';

export class Agent {
  id: GameId<'agents'>;
  playerId: GameId<'players'>;
  toRemember?: GameId<'conversations'>;
  lastConversation?: number;
  lastInviteAttempt?: number;
  nextPartyMoveTs?: number;
  // Cooldown to avoid spamming pathfinding during walkingOver.
  lastWalkingOverMoveAttempt?: number;
  inProgressOperation?: {
    name: string;
    operationId: string;
    started: number;
  };

  constructor(serialized: SerializedAgent) {
    const { id, lastConversation, lastInviteAttempt, inProgressOperation, nextPartyMoveTs } =
      serialized;
    const playerId = parseGameId('players', serialized.playerId);
    this.id = parseGameId('agents', id);
    this.playerId = playerId;
    this.toRemember =
      serialized.toRemember !== undefined
        ? parseGameId('conversations', serialized.toRemember)
        : undefined;
    this.lastConversation = lastConversation;
    this.lastInviteAttempt = lastInviteAttempt;
    this.nextPartyMoveTs = nextPartyMoveTs;
    this.inProgressOperation = inProgressOperation;
  }

  tick(game: Game, now: number) {
    const player = game.world.players.get(this.playerId);
    if (!player) {
      throw new Error(`Invalid player ID ${this.playerId}`);
    }
    const villageState = game.villageState;

    // Decentralized event handling (pull model)
    // Check for active world events and react accordingly.
    if (villageState?.isPartyActive) {
      const isPartying = player.activity?.description.includes('Partying');
      if (isPartying && !player.pathfinding && (!this.nextPartyMoveTs || now > this.nextPartyMoveTs)) {
        const partyMin = { x: 40, y: 9 };
        const partyMax = { x: 51, y: 14 };
        const dest = {
          x: Math.floor(Math.random() * (partyMax.x - partyMin.x + 1)) + partyMin.x,
          y: Math.floor(Math.random() * (partyMax.y - partyMin.y + 1)) + partyMin.y,
        };
        movePlayer(game, now, player, dest, true);
        // Mingle every 5-10s
        this.nextPartyMoveTs = now + 5000 + Math.random() * 5000;
      } else if (!isPartying) {
        // If not already partying, join the party.
        const partyMin = { x: 40, y: 9 };
        const partyMax = { x: 51, y: 14 };
        const dest = {
          x: Math.floor(Math.random() * (partyMax.x - partyMin.x + 1)) + partyMin.x,
          y: Math.floor(Math.random() * (partyMax.y - partyMin.y + 1)) + partyMin.y,
        };
        movePlayer(game, now, player, dest, true); // Allow moving even if in a convo
        player.activity = {
          description: 'Partying! 🥳',
          until: now + 30 * 60 * 1000, // Party for 30 mins
        };
        // End any current conversation to join the party
        const conversation = game.world.playerConversation(player);
        if (conversation) {
          conversation.stop(game, now);
        }
        this.nextPartyMoveTs = now + 5000 + Math.random() * 5000;
      }
      // If we are at the party, we should be dancing, not just standing.
      // This will be handled by the frontend animation logic.
      return; // Prioritize party over other actions
    } else if (villageState?.meeting) {
      const meeting = villageState.meeting;
      const isSpeaker = player.id === meeting.speakerId;
      const isAttending = player.activity?.description.includes('Meeting');
      const isListening = player.activity?.description.includes('Listening');
      
      if (!isAttending && !isListening) {
         // End any current conversation to join the meeting
        const conversation = game.world.playerConversation(player);
        if (conversation) {
          conversation.stop(game, now);
        }
        if (isSpeaker) {
          movePlayer(game, now, player, { x: 45, y: 17 }, true);
          player.activity = {
            description: 'Leading the town meeting...',
            emoji: '👑',
            until: meeting.startTime + 300000,
          };
        } else {
          const crowdPositions = this.computeCrowdPositions(game);
          const mySpot = crowdPositions.get(player.id);
          if (mySpot) {
            movePlayer(game, now, player, mySpot, true);
            player.activity = {
              description: 'Attending town meeting',
              emoji: '🧑‍🏫',
              until: meeting.startTime + 300000,
            };
          }
        }
      } else if (isAttending && !player.pathfinding && !isSpeaker) {
        // Arrived at the meeting, now listening.
        player.activity = {
          description: 'Listening...',
          emoji: '👂',
          until: meeting.startTime + 300000,
        };
      }
      return; // Prioritize meeting over other actions
    }

    // If we have a pending human invitation, preempt any in-progress operation to accept it.
    const pendingConversation = game.world.playerConversation(player);
    const pendingMember = pendingConversation?.participants.get(player.id);
    if (
      pendingConversation &&
      pendingMember?.status.kind === 'invited'
    ) {
      const [otherId] = [...pendingConversation.participants.keys()].filter((id) => id !== player.id);
      const inviter = otherId && game.world.players.get(otherId);
      if (inviter && inviter.human) {
        // End any current activity/pathfinding and preempt the current operation to accept humans immediately
        if (player.activity) {
          player.activity.until = now; // cancel activity
        }
        if (player.pathfinding) {
          delete player.pathfinding;
        }
        if (this.inProgressOperation) {
          delete this.inProgressOperation;
          console.log(`Agent ${player.id} preempting op to accept human invite from ${inviter.id}`);
        } else {
          console.log(`Agent ${player.id} accepting human invite from ${inviter.id}`);
        }
        pendingConversation.acceptInvite(game, player);
      }
    }
    if (this.inProgressOperation) {
      if (now < this.inProgressOperation.started + ACTION_TIMEOUT) {
        // Wait on the operation to finish.
        return;
      }
      console.log(`Timing out ${JSON.stringify(this.inProgressOperation)}`);
      delete this.inProgressOperation;
    }
    const conversation = game.world.playerConversation(player);
    const member = conversation?.participants.get(player.id);

    const recentlyAttemptedInvite =
      this.lastInviteAttempt && now < this.lastInviteAttempt + CONVERSATION_COOLDOWN;
    const doingActivity = player.activity && player.activity.until > now;
    if (doingActivity && (conversation || player.pathfinding)) {
      player.activity!.until = now;
    }
    // If we're not in a conversation, do something.
    // If we aren't doing an activity or moving, do something.
    // If we have been wandering but haven't thought about something to do for
    // a while, do something.
    if (!conversation && !doingActivity && (!player.pathfinding || !recentlyAttemptedInvite)) {
      this.startOperation(game, now, 'agentDoSomething', {
        worldId: game.worldId,
        player: player.serialize(),
        otherFreePlayers: [...game.world.players.values()]
          .filter((p) => p.id !== player.id)
          .filter(
            (p) => ![...game.world.conversations.values()].find((c) => c.participants.has(p.id)),
          )
          .map((p) => p.serialize()),
        agent: this.serialize(),
        map: game.worldMap.serialize(),
      });
      return;
    }
    // Check to see if we have a conversation we need to remember.
    if (this.toRemember) {
      // Fire off the action to remember the conversation.
      console.log(`Agent ${this.id} remembering conversation ${this.toRemember}`);
      this.startOperation(game, now, 'agentRememberConversation', {
        worldId: game.worldId,
        playerId: this.playerId,
        agentId: this.id,
        conversationId: this.toRemember,
      });
      delete this.toRemember;
      return;
    }
    if (conversation && member) {
      const [otherPlayerId, otherMember] = [...conversation.participants.entries()].find(
        ([id]) => id !== player.id,
      )!;
      const otherPlayer = game.world.players.get(otherPlayerId)!;
      if (member.status.kind === 'invited') {
        // Accept a conversation with another agent with some probability and with
        // a human unconditionally.
        if (otherPlayer.human || Math.random() < INVITE_ACCEPT_PROBABILITY) {
          console.log(`Agent ${player.id} accepting invite from ${otherPlayer.id}`);
          conversation.acceptInvite(game, player);
          // Stop moving so we can start walking towards the other player.
          if (player.pathfinding) {
            delete player.pathfinding;
          }
        } else {
          console.log(`Agent ${player.id} rejecting invite from ${otherPlayer.id}`);
          conversation.rejectInvite(game, now, player);
        }
        return;
      }
      if (member.status.kind === 'walkingOver') {
        // Leave a conversation if we've been waiting for too long.
        if (member.invited + INVITE_TIMEOUT < now) {
          console.log(`Giving up on invite to ${otherPlayer.id}`);
          conversation.leave(game, now, player);
          return;
        }

        // Don't keep moving around if we're near enough.
        const playerDistance = distance(player.position, otherPlayer.position);
        if (playerDistance < CONVERSATION_DISTANCE) {
          return;
        }

        // Keep moving towards the other player, but rate-limit attempts to avoid pathfinding spam.
        if (this.lastWalkingOverMoveAttempt && now < this.lastWalkingOverMoveAttempt + 500) {
          return;
        }
        // If we're close enough to the player, just walk to them directly.
        if (!player.pathfinding) {
          let destination;
          if (playerDistance < MIDPOINT_THRESHOLD) {
            destination = {
              x: Math.floor(otherPlayer.position.x),
              y: Math.floor(otherPlayer.position.y),
            };
          } else {
            destination = {
              x: Math.floor((player.position.x + otherPlayer.position.x) / 2),
              y: Math.floor((player.position.y + otherPlayer.position.y) / 2),
            };
          }
          // If destination is blocked, try nearby offsets and pick the first walkable spot.
          const candidates = [
            destination,
            { x: destination.x + 1, y: destination.y },
            { x: destination.x - 1, y: destination.y },
            { x: destination.x, y: destination.y + 1 },
            { x: destination.x, y: destination.y - 1 },
            { x: destination.x + 1, y: destination.y + 1 },
            { x: destination.x - 1, y: destination.y - 1 },
            { x: destination.x + 1, y: destination.y - 1 },
            { x: destination.x - 1, y: destination.y + 1 },
          ];
          let chosen = candidates.find((c) => !blocked(game, now, c));
          if (!chosen) {
            // As a last resort, skip issuing a move this tick to avoid spamming failed routes.
            return;
          }
          this.lastWalkingOverMoveAttempt = now;
          console.log(`Agent ${player.id} walking towards ${otherPlayer.id}...`, chosen);
          movePlayer(game, now, player, chosen);
        }
        return;
      }
      if (member.status.kind === 'participating') {
        const started = member.status.started;
        if (conversation.isTyping && conversation.isTyping.playerId !== player.id) {
          // Wait for the other player to finish typing.
          return;
        }
        if (!conversation.lastMessage) {
          const isInitiator = conversation.creator === player.id;
          const awkwardDeadline = started + AWKWARD_CONVERSATION_TIMEOUT;
          // Send the first message if we're the initiator or if we've been waiting for too long.
          if (isInitiator || awkwardDeadline < now) {
            // Grab the lock on the conversation and send a "start" message.
            console.log(`${player.id} initiating conversation with ${otherPlayer.id}.`);
            const messageUuid = crypto.randomUUID();
            conversation.setIsTyping(now, player, messageUuid);
            this.startOperation(game, now, 'agentGenerateMessage', {
              worldId: game.worldId,
              playerId: player.id,
              agentId: this.id,
              conversationId: conversation.id,
              otherPlayerId: otherPlayer.id,
              messageUuid,
              type: 'start',
            });
            return;
          } else {
            // Wait on the other player to say something up to the awkward deadline.
            return;
          }
        }
        // See if the conversation has been going on too long and decide to leave.
        const tooLongDeadline = started + MAX_CONVERSATION_DURATION;
        // Allow longer chats when a human is involved (16 messages), otherwise use default cap.
        const humanInvolved = player.human || otherPlayer.human;
        const maxMessages = humanInvolved ? 16 : MAX_CONVERSATION_MESSAGES;
        if (tooLongDeadline < now || conversation.numMessages > maxMessages) {
          console.log(`${player.id} leaving conversation with ${otherPlayer.id}.`);
          const messageUuid = crypto.randomUUID();
          conversation.setIsTyping(now, player, messageUuid);
          this.startOperation(game, now, 'agentGenerateMessage', {
            worldId: game.worldId,
            playerId: player.id,
            agentId: this.id,
            conversationId: conversation.id,
            otherPlayerId: otherPlayer.id,
            messageUuid,
            type: 'leave',
          });
          return;
        }
        // Wait for the awkward deadline if we sent the last message.
        if (conversation.lastMessage.author === player.id) {
          const awkwardDeadline = conversation.lastMessage.timestamp + AWKWARD_CONVERSATION_TIMEOUT;
          if (now < awkwardDeadline) {
            return;
          }
        }
        // Wait for a cooldown after the last message to simulate "reading" the message.
        const messageCooldown = conversation.lastMessage.timestamp + MESSAGE_COOLDOWN;
        if (now < messageCooldown) {
          return;
        }
        // Grab the lock and send a message!
        console.log(`${player.id} continuing conversation with ${otherPlayer.id}.`);
        const messageUuid = crypto.randomUUID();
        conversation.setIsTyping(now, player, messageUuid);
        this.startOperation(game, now, 'agentGenerateMessage', {
          worldId: game.worldId,
          playerId: player.id,
          agentId: this.id,
          conversationId: conversation.id,
          otherPlayerId: otherPlayer.id,
          messageUuid,
          type: 'continue',
        });
        // Occasionally try to hustle the tourist (creates a pending request the tourist can accept/reject).
        if (otherPlayer.human && Math.random() < 0.25) {
          game.pendingOperations.push({
            name: 'hustle',
            args: { agentId: player.id, touristId: otherPlayer.id },
          });
        }
        // Passive earning from conversation.
        if (otherPlayer.human) {
          game.pendingOperations.push({
            name: 'earnFromConversation',
            args: { agentId: player.id, touristId: otherPlayer.id },
          });
        }
        // ICE hands over all collected BTC to President Bukele when they meet (once per conversation).
        {
          const pdSelf = game.playerDescriptions.get(player.id);
          const pdOther = game.playerDescriptions.get(otherPlayer.id);
          const oncePerConversation = conversation.numMessages < 2;
          if (pdSelf?.name === 'ICE' && pdOther?.name === 'President Bukele' && oncePerConversation) {
            game.pendingOperations.push({
              name: 'transferAllBalance',
              args: { fromId: player.id, toId: otherPlayer.id },
            });
          }
        }
        // Robber protection fee against MCP agents (non-human) when MS-13 is the agent.
        // Guard: only once per conversation (trigger early when few messages have occurred).
        if (!otherPlayer.human) {
          const pd = game.playerDescriptions.get(player.id);
          const oncePerConversation = conversation.numMessages < 2; // trigger only at start
          if (pd?.name === 'MS-13' && oncePerConversation) {
            game.pendingOperations.push({
              name: 'robProtectionFee',
              args: { robberId: player.id, victimId: otherPlayer.id },
            });
          }
        }
        return;
      }
    }
  }

  computeCrowdPositions(game: Game): Map<GameId<'players'>, Point> {
    const speaker = [...game.world.players.values()].find(p => p.id === game.villageState!.meeting!.speakerId);
    if (!speaker) return new Map();
    
    const positions = new Map<GameId<'players'>, Point>();
    const otherAgents = [...game.world.agents.values()].filter(a => a.playerId !== speaker.id);
    // Place attendees in rows within the rectangle x=42..51, y=19..24
    const startX = 42, startY = 19, spacing = 2, agentsPerRow = 5;
    let agentIndex = 0;
    for (const agent of otherAgents) {
      const row = Math.floor(agentIndex / agentsPerRow);
      const col = agentIndex % agentsPerRow;
      let x = startX + col * spacing;
      let y = startY + row * spacing;
      // Clamp to bounds of 42..51 and 19..24 to avoid overflow
      x = Math.min(51, Math.max(42, x));
      y = Math.min(24, Math.max(19, y));
      const destination = { x, y };
      positions.set(agent.playerId, destination);
      agentIndex++;
    }
    return positions;
  }

  startOperation(
    game: Game,
    now: number,
    name: keyof AgentOperations,
    args: Omit<FunctionArgs<any>, 'operationId'>,
  ) {
    if (this.inProgressOperation) {
      throw new Error(
        `Agent ${this.id} already has an operation: ${JSON.stringify(this.inProgressOperation)}`,
      );
    }
    const operationId = game.allocId('operations');
    console.log(`Agent ${this.id} starting operation ${name} (${operationId})`);
    game.scheduleOperation(name, { operationId, ...args } as any);
    this.inProgressOperation = {
      name,
      operationId,
      started: now,
    };
  }

  serialize(): SerializedAgent {
    return {
      id: this.id,
      playerId: this.playerId,
      toRemember: this.toRemember,
      lastConversation: this.lastConversation,
      lastInviteAttempt: this.lastInviteAttempt,
      nextPartyMoveTs: this.nextPartyMoveTs,
      inProgressOperation: this.inProgressOperation,
    };
  }
}

export const serializedAgent = {
  id: agentId,
  playerId: playerId,
  toRemember: v.optional(conversationId),
  lastConversation: v.optional(v.number()),
  lastInviteAttempt: v.optional(v.number()),
  nextPartyMoveTs: v.optional(v.number()),
  inProgressOperation: v.optional(
    v.object({
      name: v.string(),
      operationId: v.string(),
      started: v.number(),
    }),
  ),
};
export type SerializedAgent = ObjectType<typeof serializedAgent>;

type AgentOperations = typeof internal.aiTown.agentOperations;

export const agentInputs = {
  finishRememberConversation: inputHandler({
    args: {
      operationId: v.string(),
      agentId,
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} isn't remembering ${args.operationId}`);
      } else {
        delete agent.inProgressOperation;
        delete agent.toRemember;
      }
      return null;
    },
  }),
  finishDoSomething: inputHandler({
    args: {
      operationId: v.string(),
      agentId: v.id('agents'),
      destination: v.optional(point),
      invitee: v.optional(v.id('players')),
      activity: v.optional(activity),
      operation: v.optional(v.object({ name: v.string(), args: v.any() })),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} didn't have ${args.operationId} in progress`);
        return null;
      }
      delete agent.inProgressOperation;
      const player = game.world.players.get(agent.playerId)!;
      if (args.invitee) {
        const inviteeId = parseGameId('players', args.invitee);
        const invitee = game.world.players.get(inviteeId);
        if (!invitee) {
          throw new Error(`Couldn't find player: ${inviteeId}`);
        }
        Conversation.start(game, now, player, invitee);
        agent.lastInviteAttempt = now;
      }
      if (args.destination) {
        movePlayer(game, now, player, args.destination);
      }
      if (args.activity) {
        player.activity = args.activity;
      }
      if (args.operation) {
        agent.startOperation(game, now, args.operation.name as keyof AgentOperations, args.operation.args);
      }
      return null;
    },
  }),
  agentFinishSendingMessage: inputHandler({
    args: {
      agentId,
      conversationId,
      timestamp: v.number(),
      operationId: v.string(),
      leaveConversation: v.boolean(),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      const player = game.world.players.get(agent.playerId);
      if (!player) {
        throw new Error(`Couldn't find player: ${agent.playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Couldn't find conversation: ${conversationId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} wasn't sending a message ${args.operationId}`);
        return null;
      }
      delete agent.inProgressOperation;
      conversationInputs.finishSendingMessage.handler(game, now, {
        playerId: agent.playerId,
        conversationId: args.conversationId,
        timestamp: args.timestamp,
      });
      if (args.leaveConversation) {
        conversation.leave(game, now, player);
      }
      return null;
    },
  }),
  createAgent: inputHandler({
    args: {
      descriptionIndex: v.number(),
    },
    handler: (game, now, args) => {
      const description = Descriptions[args.descriptionIndex];
      const playerId = Player.join(
        game,
        now,
        description.name,
        description.character,
        description.character,
        description.identity,
      );
      const agentId = game.allocId('agents');
      game.world.agents.set(
        agentId,
        new Agent({
          id: agentId,
          playerId: playerId,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastInviteAttempt: undefined,
          nextPartyMoveTs: undefined,
          toRemember: undefined,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({
          agentId: agentId,
          identity: description.identity,
          plan: description.plan,
          btcGoal: Math.random() * (1 - 0.1) + 0.1,
        }),
      );
      game.pendingOperations.push({
        name: 'createAgentPortfolio',
        args: { playerId },
      });
      return { agentId };
    },
  }),
};

export async function runAgentOperation(ctx: MutationCtx, operation: string, args: any) {
  let reference;
  switch (operation) {
    case 'agentRememberConversation':
      reference = internal.aiTown.agentOperations.agentRememberConversation;
      break;
    case 'agentGenerateMessage':
      reference = internal.aiTown.agentOperations.agentGenerateMessage;
      break;
    case 'agentDoSomething':
      reference = internal.aiTown.agentOperations.agentDoSomething;
      break;
    case 'agentReadNews':
      reference = internal.aiTown.agentOperations.agentReadNews;
      break;
    case 'hustle':
      reference = internal.economy.hustle;
      break;
    case 'transferAllBalance':
      reference = internal.economy.transferAllBalance;
      break;
    case 'createAgentPortfolio':
      reference = internal.aiTown.agentInputs.createAgentPortfolio;
      break;
    case 'earnFromConversation':
      reference = internal.economy.earnFromConversation;
      break;
    case 'robProtectionFee':
      reference = internal.economy.robProtectionFee;
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
  await ctx.scheduler.runAfter(0, reference, args);
}

export const agentSendMessage = internalMutation({
  args: {
    worldId: v.id('worlds'),
    conversationId,
    agentId,
    playerId,
    text: v.string(),
    messageUuid: v.string(),
    leaveConversation: v.boolean(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      author: args.playerId,
      text: args.text,
      messageUuid: args.messageUuid,
      worldId: args.worldId,
    });
    await insertInput(ctx, args.worldId, 'agentFinishSendingMessage', {
      conversationId: args.conversationId,
      agentId: args.agentId,
      timestamp: Date.now(),
      leaveConversation: args.leaveConversation,
      operationId: args.operationId,
    });
  },
});

export const findConversationCandidate = internalQuery({
  args: {
    now: v.number(),
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
  },
  handler: async (ctx, { now, worldId, player, otherFreePlayers }) => {
    const { position } = player;
    const candidates = [];

    for (const otherPlayer of otherFreePlayers) {
      // Find the latest conversation we're both members of.
      const lastMember = await ctx.db
        .query('participatedTogether')
        .withIndex('edge', (q) =>
          q.eq('worldId', worldId).eq('player1', player.id).eq('player2', otherPlayer.id),
        )
        .order('desc')
        .first();
      if (lastMember) {
        if (now < lastMember.ended + PLAYER_CONVERSATION_COOLDOWN) {
          continue;
        }
      }
      candidates.push({ id: otherPlayer.id, position });
    }

    // Sort by distance and take the nearest candidate.
    candidates.sort((a, b) => distance(a.position, position) - distance(b.position, position));
    return candidates[0]?.id;
  },
});