
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { agentTables } from './agent/schema';
import { aiTownTables } from './aiTown/schema';
import { agentId, conversationId, playerId } from './aiTown/ids';
import { engineTables } from './engine/schema';

export default defineSchema({
  // Existing tables...
  music: defineTable({
    storageId: v.string(),
    type: v.union(v.literal('background'), v.literal('player')),
  }),

  messages: defineTable({
    conversationId,
    messageUuid: v.string(),
    author: playerId,
    text: v.string(),
    worldId: v.optional(v.id('worlds')),
  })
    .index('conversationId', ['worldId', 'conversationId'])
    .index('messageUuid', ['conversationId', 'messageUuid']),

  // AI Salvador specific tables
  villageState: defineTable({
    treasury: v.float64(), // Stored in BTC
    btcPrice: v.float64(), // Current price in USD
    previousBtcPrice: v.float64(), // Previous price, for trend tracking
    marketSentiment: v.union(v.literal('positive'), v.literal('negative'), v.literal('neutral')),
    touristCount: v.optional(v.float64()),
    isPartyActive: v.optional(v.boolean()),
    meeting: v.optional(
      v.object({
        speakerId: playerId,
        summary: v.string(),
        startTime: v.number(),
      }),
    ),
  }),

  portfolios: defineTable({
    playerId: v.string(),
    btcBalance: v.number(),
  }).index('by_playerId', ['playerId']),

  transactions: defineTable({
    playerId: v.string(),
    type: v.union(v.literal('entry_fee'), v.literal('hustle'), v.literal('earning')),
    amount: v.number(), // Amount in BTC
    timestamp: v.number(),
  }).index('by_playerId', ['playerId']),

  historicalPrices: defineTable({
    timestamp: v.number(),
    price: v.number(),
  }).index('by_timestamp', ['timestamp']),

  hustles: defineTable({
    agentId: v.string(),
    touristId: v.string(),
    amount: v.number(),
    status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('rejected')),
  }).index('by_touristId', ['touristId', 'status']),

  news: defineTable({
    source: v.string(),
    headline: v.string(),
    content: v.string(),
    timestamp: v.number(),
    imageUrl: v.optional(v.string()),
  }),

  // Waiting pool for logged-in users when the world is full
  waitingPool: defineTable({
    tokenIdentifier: v.string(),
    createdAt: v.number(),
    worldId: v.id('worlds'),
  })
    .index('by_worldId', ['worldId'])
    .index('by_token', ['worldId', 'tokenIdentifier']),

  pendingTweets: defineTable({
    worldId: v.id('worlds'),
    agentId,
    text: v.string(),
    status: v.union(v.literal('pending'), v.literal('posted'), v.literal('failed')),
  }).index('worldId_status', ['worldId', 'status']),

  tweets: defineTable({
    worldId: v.optional(v.id('worlds')),
    authorId: playerId,
    authorName: v.string(),
    text: v.string(),
    twitterTweetId: v.optional(v.string()),
  }).index('by_twitter_id', ['twitterTweetId']),

  ...agentTables,
  ...aiTownTables,
  ...engineTables,
});