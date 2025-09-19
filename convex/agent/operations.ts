import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { WorldMap, serializedWorldMap } from '../aiTown/worldMap';
import { rememberConversation } from './memory';
import { GameId, agentId, conversationId, playerId } from '../aiTown/ids';
import { Doc, Id } from '../_generated/dataModel';
import {
  continueConversationMessage,
  leaveConversationMessage,
  startConversationMessage,
} from './conversation';
import { rememberMarketSentiment } from './memory';
import { assertNever } from '../util/assertNever';
import { serializedAgent } from '../aiTown/agent';
import { ACTIVITIES, ACTIVITY_COOLDOWN, CONVERSATION_COOLDOWN } from '../constants';
import { api, internal } from '../_generated/api';
import { sleep } from '../util/sleep';
import { serializedPlayer } from '../aiTown/player';
import { distance } from '../util/geometry';
import { chatCompletion } from '../util/llm';

export const agentReadNews = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const article = await ctx.runQuery(api.news.getRandomNewsArticle);
    if (article) {
      const memory = `I read an article from ${article.source} with the headline "${article.headline}". The article says: ${article.content}`;
      await ctx.runAction(internal.agent.memory.agentRemember, {
        agentId: args.agentId,
        playerId: args.playerId as GameId<'players'>,
        memory,
      });
    }
  },
});

export const agentRememberConversation = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    await rememberConversation(
      ctx,
      args.worldId,
      args.agentId as GameId<'agents'>,
      args.playerId as GameId<'players'>,
      args.conversationId as GameId<'conversations'>,
    );
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishRememberConversation',
      args: {
        agentId: args.agentId,
        operationId: args.operationId,
      },
    });
  },
});

export const agentGenerateMessage = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    otherPlayerId: playerId,
    operationId: v.string(),
    type: v.union(v.literal('start'), v.literal('continue'), v.literal('leave')),
    messageUuid: v.string(),
  },
  handler: async (ctx, args) => {
    let completionFn;
    switch (args.type) {
      case 'start':
        completionFn = startConversationMessage;
        break;
      case 'continue':
        completionFn = continueConversationMessage;
        break;
      case 'leave':
        completionFn = leaveConversationMessage;
        break;
      default:
        assertNever(args.type);
    }
    const text = await completionFn(
      ctx,
      args.worldId,
      args.conversationId as GameId<'conversations'>,
      args.playerId as GameId<'players'>,
      args.otherPlayerId as GameId<'players'>,
    );

    const conversationMembers = await ctx.runQuery(internal.agent.conversation.queryPromptData, {
      worldId: args.worldId,
      playerId: args.playerId as GameId<'players'>,
      otherPlayerId: args.otherPlayerId as GameId<'players'>,
      conversationId: args.conversationId as GameId<'conversations'>,
    });
    const { player, otherPlayer } = conversationMembers;
    const isIceToMs13 = player.name === 'ICE' && otherPlayer.name === 'MS-13';
    const isMs13ToIce = player.name === 'MS-13' && otherPlayer.name === 'ICE';

    if (isIceToMs13 && text.toLowerCase().match(/\bid\b|identification|papers/)) {
      console.log('ICE is asking for ID. Triggering chase...');
      await ctx.runMutation(api.world.triggerChase, { worldId: args.worldId });
    } else if (args.type === 'start' && (isIceToMs13 || isMs13ToIce)) {
      console.log('ICE and MS-13 started a conversation. Setting 8s fallback chase trigger.');
      await ctx.scheduler.runAfter(8000, internal.world.triggerChaseIfNeeded, {
        worldId: args.worldId,
        conversationId: args.conversationId,
      });
    }

    await ctx.runMutation(internal.messages.agentWriteMessage, {
      worldId: args.worldId,
      conversationId: args.conversationId,
      agentId: args.agentId,
      playerId: args.playerId,
      text,
      messageUuid: args.messageUuid,
      leaveConversation: args.type === 'leave',
      operationId: args.operationId,
    });
  },
});

export const agentDoSomething = internalAction({
  args: {
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    agent: v.object(serializedAgent),
    map: v.object(serializedWorldMap),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { player, agent } = args;
    const map = new WorldMap(args.map);
    const now = Date.now();

    // President Bukele might tweet. This is a high-priority action for him.
    if (player.name === 'President Bukele' && Math.random() < 0.1) {
      console.log(`Agent ${agent.id} (President Bukele) deciding to compose a tweet.`);
      // This action will call finishDoSomething itself.
      await ctx.runAction(internal.agent.operations.agentComposeTweet, {
        worldId: args.worldId,
        player: args.player,
        agent: args.agent,
        operationId: args.operationId,
      });
      return;
    }

    // Any agent might read the social feed. This is a quick background action and does not
    // prevent them from doing other things.
    if (Math.random() < 0.05) {
      console.log(`Agent ${agent.id} reading social feed.`);
      await ctx.runAction(internal.agent.operations.agentReadSocialFeed, {
        worldId: args.worldId,
        playerId: player.id,
        agentId: agent.id,
        operationId: args.operationId,
      });
    }

    const villageState = await ctx.runQuery(api.world.villageState, {});
    if (villageState && villageState.marketSentiment !== 'neutral') {
      const lastSentimentMemory = await ctx.runQuery(
        internal.agent.memory.getLatestSentimentMemory,
        {
          playerId: player.id as GameId<'players'>,
        },
      );
      if (
        !lastSentimentMemory ||
        lastSentimentMemory.data.sentiment !== villageState.marketSentiment
      ) {
        await rememberMarketSentiment(
          ctx,
          agent.id as GameId<'agents'>,
          player.id as GameId<'players'>,
          villageState.marketSentiment,
        );
      }
    }

    // Don't try to start a new conversation if we were just in one.
    const justLeftConversation =
      agent.lastConversation && now < agent.lastConversation + CONVERSATION_COOLDOWN;
    // Don't try again if we recently tried to find someone to invite.
    const recentlyAttemptedInvite =
      agent.lastInviteAttempt && now < agent.lastInviteAttempt + CONVERSATION_COOLDOWN;
    const recentActivity = player.activity && now < player.activity.until + ACTIVITY_COOLDOWN;

    // Decide whether to read the news.
    const readNews = Math.random() < 0.1; // 10% chance to read the news
    if (readNews) {
      const article = await ctx.runQuery(api.news.getRandomNewsArticle);
      if (article) {
        // Conform to player.activity.article validator: strip system fields
        const slim = {
          source: article.source,
          headline: article.headline,
          content: article.content,
          imageUrl: article.imageUrl,
        } as const;
        const activity = ACTIVITIES.find((a) => a.description === 'reading the news')!;
        console.log(`Agent ${agent.id} reading the news`);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            activity: {
              description: activity.description,
              emoji: activity.emoji,
              until: now + activity.duration,
              article: slim,
            },
            operation: {
              name: 'agentReadNews',
              args: { worldId: args.worldId, playerId: player.id, agentId: agent.id },
            },
          },
        });
        return;
      }
    }

    const portfolio = await ctx.runQuery(api.economy.getPortfolio, { playerId: player.id });

    if (portfolio && portfolio.btcBalance >= 1) {
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: args.worldId,
        name: 'finishDoSomething',
        args: {
          operationId: args.operationId,
          agentId: agent.id,
          activity: {
            description: 'Feeling happy!',
            emoji: '😊',
            until: Date.now() + 110000, // 1 minute
          },
        },
      });
      return;
    }

    // Decide whether to hustle a tourist.
    const tourists = args.otherFreePlayers.filter((p) => p.human);
    if (tourists.length > 0) {
      const nearbyTourists = tourists.filter((p) => distance(player.position, p.position) < 5);
      if (nearbyTourists.length > 0) {
        // Hustle a random nearby tourist with a 10% chance.
        if (Math.random() < 0.1) {
          const tourist = nearbyTourists[Math.floor(Math.random() * nearbyTourists.length)];
          await ctx.runMutation(internal.economy.hustle, {
            agentId: player.id,
            touristId: tourist.id,
          });
          return;
        }
      }
    }

    // Decide whether to do an activity or wander somewhere.
    if (!player.pathfinding) {
      if (recentActivity || justLeftConversation) {
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            destination: wanderDestination(map),
          },
        });
        return;
      } else {
        // TODO: have LLM choose the activity & emoji
        const activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            activity: {
              description: activity.description,
              emoji: activity.emoji,
              until: Date.now() + activity.duration,
            },
          },
        });
        return;
      }
    }
    const invitee =
      justLeftConversation || recentlyAttemptedInvite
        ? undefined
        : await ctx.runQuery(internal.aiTown.agent.findConversationCandidate, {
            now,
            worldId: args.worldId,
            player: args.player,
            otherFreePlayers: args.otherFreePlayers,
          });

    // TODO: We hit a lot of OCC errors on sending inputs in this file. It's
    // easy for them to get scheduled at the same time and line up in time.
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishDoSomething',
      args: {
        operationId: args.operationId,
        agentId: args.agent.id,
        invitee,
      },
    });
  },
});

function wanderDestination(worldMap: WorldMap) {
  // Wander someonewhere at least one tile away from the edge.
  return {
    x: 1 + Math.floor(Math.random() * (worldMap.width - 2)),
    y: 1 + Math.floor(Math.random() * (worldMap.height - 2)),
  };
}

export const agentComposeTweet = internalAction({
  args: {
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    agent: v.object(serializedAgent),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { player, agent } = args;

    const recentTweets = await ctx.runQuery(internal.world.getRecentTweets, { numTweets: 1 });
    if (recentTweets && recentTweets.length > 0) {
      const lastTweetTime = recentTweets[0]._creationTime;
      // 1 hour in milliseconds
      if (Date.now() - lastTweetTime < 60 * 60 * 1000) {
        console.log("Too soon to tweet again. Last tweet was less than an hour ago.");
        // We must still finish the `doSomething` operation for the agent to continue.
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
          },
        });
        return;
      }
    }

    const { memories } = await ctx.runQuery(internal.agent.memory.getReflectionMemories, {
      worldId: args.worldId,
      playerId: player.id as GameId<'players'>,
      numberOfItems: 10,
    });

    let tweetText;

    if (memories.length > 0) {
      const recentMemoryDescriptions = memories.map((m: Doc<'memories'>) => m.description).join('\n - ');

      const prompt = `You are President Bukele of AI Salvador, a digital nation passionate about Bitcoin and technology. Based on your recent memories of conversations and events in the town, compose a short, impactful tweet (under 280 characters). Your tone is optimistic, forward-looking, and a bit tech-savvy. Do not use hashtags.

Recent memories:
- ${recentMemoryDescriptions}

Tweet:`;

      const { content } = await chatCompletion({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.7,
      });
      tweetText = content.replace(/"/g, ''); // remove quotes from response
    } else {
      // Fallback tweet if no memories
      tweetText = 'Another great day in AI Salvador! The future is bright. #Bitcoin';
    }

    if (tweetText) {
      console.log(`Bukele's generated tweet: ${tweetText}`);
      await ctx.runMutation(internal.world.addTweetToFeed, {
        worldId: args.worldId,
        authorId: player.id,
        authorName: player.name!,
        text: tweetText,
      });
    }

    // Finish the 'doSomething' operation since tweeting was the action.
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishDoSomething',
      args: {
        operationId: args.operationId,
        agentId: agent.id,
      },
    });
  },
});

export const agentReadSocialFeed = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const recentTweets = await ctx.runQuery(internal.world.getRecentTweets, { numTweets: 1 });
    if (!recentTweets || recentTweets.length === 0) {
      return;
    }
    const tweet = recentTweets[0];
    // Agents don't read their own tweets from the feed.
    if (tweet.authorId === args.playerId) {
      return;
    }

    const memory = `I saw a tweet from ${tweet.authorName}: "${tweet.text}"`;
    await ctx.runAction(internal.agent.memory.agentRemember, {
      agentId: args.agentId as GameId<'agents'>,
      playerId: args.playerId as GameId<'players'>,
      memory,
    });
  },
});