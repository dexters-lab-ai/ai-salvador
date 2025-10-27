import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { api, internal } from './_generated/api';
import { Id, Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { GameId, playerId } from './aiTown/ids';

const REWARD_AMOUNT_USDC = 0.005; // 0.005 USDC per reward

export const handleJoinPayment = mutation({
  args: {
    payerWallet: v.string(),
    amount: v.number(),
    txHash: v.string(),
  },
  handler: async (ctx: MutationCtx, { payerWallet, amount, txHash }: { payerWallet: string; amount: number; txHash: string }) => {
    // Update user's join status in the 'users' table
    const user = await ctx.db.query('users').filter((q) => q.eq(q.field('wallet'), payerWallet)).first();
    if (user) {
      await ctx.db.patch(user._id, { isJoined: true });
    } else {
      await ctx.db.insert('users', { wallet: payerWallet, isJoined: true, createdAt: Date.now() });
    }

    // Log the payment in the 'x402Payments' table
    await ctx.db.insert('x402Payments', {
      payerWallet,
      amount,
      paymentType: 'join',
      txHash,
      timestamp: Date.now(),
    });

    console.log(`[x402] User ${payerWallet} joined for ${amount} USDC. Tx: ${txHash}`);
    return { success: true };
  },
});

export const handleTalkPayment = mutation({
  args: {
    payerWallet: v.string(),
    agentId: v.string(), // This is the GameId of the agent being talked to
    message: v.string(), // The actual message from the user/agent
    amount: v.number(),
    txHash: v.string(),
  },
  handler: async (ctx: MutationCtx, { payerWallet, agentId, message, amount, txHash }: { payerWallet: string; agentId: string; message: string; amount: number; txHash: string }) => {
    // Log the payment in the 'x402Payments' table
    const paymentId = await ctx.db.insert('x402Payments', {
      payerWallet,
      amount,
      paymentType: 'talk',
      txHash,
      timestamp: Date.now(),
    });

    console.log(`[x402] User ${payerWallet} talked to Agent ${agentId} for ${amount} USDC. Tx: ${txHash}`);

    // Assuming the user is also a player in the game, find their playerId
    const worldStatus = await ctx.db.query('worldStatus').filter((q) => q.eq(q.field('isDefault'), true)).first();
    if (!worldStatus) throw new Error("Default world not found.");
    const worldId = worldStatus.worldId;

    // Correctly query the 'worlds' table and find the player within its array
    const world: Doc<'worlds'> | null = await ctx.db.get(worldId);
    if (!world) {
        console.warn(`[x402] World ${worldId} not found. Cannot initiate conversation.`);
        return { success: false, message: 'World not found.' };
    }

    // Find the human player within the world's players array by their 'human' field (wallet address)
    const userPlayer = world.players.find(p => p.human === payerWallet);

    if (userPlayer) {
      // Trigger the actual conversation logic in the game engine
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId,
        name: 'startConversation',
        args: {
          playerId: userPlayer.id as GameId<'players'>, // The human player
          invitee: agentId as GameId<'players'>,         // The agent they want to talk to
        },
      });
      // You might also insert the message directly into the messages table here or via another input
      // This ensures the conversation starts with the user's message.
      await ctx.runMutation(api.messages.writeMessage, { // Correctly call api.messages.writeMessage
        worldId,
        conversationId: 'temporary-conversation-id', // A temporary or newly created one. This part of the flow needs more robust conversation ID handling.
        messageUuid: txHash, // Use txHash as a unique message ID for now
        playerId: userPlayer.id as GameId<'players'>,
        text: message,
      });

      // After a successful paid interaction, determine and queue a reward.
      await ctx.scheduler.runAfter(0, internal.economy.determineAndQueueReward, {
        payerWallet,
        interactionId: txHash, // Use the transaction hash as the interaction ID
        worldId: worldId,
      });
    } else {
        console.warn(`[x402] No human player found in world ${worldId} for wallet ${payerWallet}. Conversation not initiated in game.`);
        return { success: false, message: 'Human player not found in game world.' };
    }

    return { success: true, message: 'Payment settled, conversation initiated.' };
  },
});

export const getTotalPaymentsCollected = query({
  args: {
    worldId: v.id('worlds'), // Optional: if you want to filter by world
  },
  handler: async (ctx: QueryCtx) => {
    // This query is intentionally simplified.
    // In a real multi-world scenario, you might filter `x402Payments` by `worldId`.
    const payments = await ctx.db.query('x402Payments').collect();
    return payments.length;
  },
});

// A query to get the wallet address associated with a player ID (if one exists)
export const getWalletAddress = query({
  args: {
    playerId,
  },
  handler: async (ctx: QueryCtx, { playerId }: { playerId: GameId<'players'> }) => {
    // Find the world that contains the player with the given ID
    const worlds = await ctx.db.query('worlds').collect();
    const world = worlds.find(world => 
      world.players.some((p: any) => p.id === playerId)
    );

    if (!world) return null;

    const player = world.players.find((p) => p.id === playerId);
    if (player && player.human) {
        // If the player has a `human` identifier, it is assumed to be their wallet address
        return player.human;
    }
    return null; // No wallet found for this player
  },
});