
"use node";

import { Buffer } from 'node:buffer';
import { TwitterApi } from 'twitter-api-v2';
import { v } from 'convex/values';
import { internal, api } from '../_generated/api';
import { action, internalAction } from '../_generated/server';
import type { ActionCtx } from '../_generated/server';
import { agentId, playerId } from '../aiTown/ids';
import { chatCompletion } from '../util/llm';

function getTwitterClient() {
  if (
    !process.env.TWITTER_API_KEY ||
    !process.env.TWITTER_API_SECRET ||
    !process.env.TWITTER_ACCESS_TOKEN ||
    !process.env.TWITTER_ACCESS_TOKEN_SECRET
  ) {
    throw new Error(
      'Twitter API credentials are not set. See README.md for instructions.',
    );
  }
  return new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
  }).readWrite;
}

export const sendTweetWithImage = action({
  args: { pendingTweetId: v.id('pendingTweets'), storageId: v.id('_storage') },
  handler: async (ctx, { pendingTweetId, storageId }) => {
    const readWriteClient = getTwitterClient();
    const pendingTweet = await ctx.runQuery(internal.world.getPendingTweet, { pendingTweetId });
    if (!pendingTweet) {
      console.error(`Pending tweet ${pendingTweetId} not found`);
      return;
    }

    const imageBuffer = await ctx.storage.get(storageId);
    if (!imageBuffer) {
      console.error(`Image not found for storageId ${storageId}`);
      return;
    }

    try {
      // 1. Upload media
      // Fix: Correctly convert Blob to ArrayBuffer before creating a Buffer. The Blob from storage must be converted to an ArrayBuffer using `await blob.arrayBuffer()` before being passed to `Buffer.from`.
      // Convert Blob to ArrayBuffer, then to Buffer for Twitter API
      const buffer = Buffer.from(await imageBuffer.arrayBuffer());
      const mediaId = await readWriteClient.v1.uploadMedia(buffer, {
        mimeType: 'image/png',
      });

      // 2. Post tweet with media
      const tweetResult = await readWriteClient.v2.tweet(pendingTweet.text, {
        media: { media_ids: [mediaId] },
      });

      // 3. Update internal tables
      const tweetData = {
        authorId: pendingTweet.agent.playerId,
        authorName: pendingTweet.player.name,
        text: pendingTweet.text,
        twitterTweetId: tweetResult.data.id,
        worldId: pendingTweet.worldId,
      };
      
      await ctx.runMutation(internal.world.addTweetToFeed, tweetData);

      await ctx.runMutation(internal.world.markPendingTweetPosted, { pendingTweetId });
    } catch (e) {
      console.error('Error posting tweet:', e);
      await ctx.runMutation(internal.world.markPendingTweetFailed, { pendingTweetId });
    }
  },
});

export const agentReadMentionsAndReply = internalAction({
  args: {}, // No args for cron job
  handler: async (ctx: ActionCtx) => {
    const worldStatus = await ctx.runQuery(api.world.defaultWorldStatus);
    if (!worldStatus) {
      console.log('No default world, skipping mention check.');
      return;
    }
    const { worldId } = worldStatus;

    const bukeleAgentData = await ctx.runQuery(internal.world.getBukeleAgentData, { worldId });

    if (!bukeleAgentData) {
      console.log('President Bukele not found, skipping mention check.');
      return;
    }
    const { agent } = bukeleAgentData;

    const readWriteClient = getTwitterClient();
    try {
      const me = await readWriteClient.v2.me();
      const mentions = await readWriteClient.v2.userMentionTimeline(me.data.id, {
        since_id: agent.lastRepliedTwitterId,
        expansions: ['author_id'],
      });

      if (mentions.meta.result_count === 0 || !mentions.data.data) {
        return;
      }

      const agentDescription = await ctx.runQuery(api.world.getAgentDescription, {
        agentId: agent.id as any,
      });
      if (!agentDescription) return;

      const newLastRepliedId = mentions.data.data[0].id;

      for (const mention of mentions.data.data) {
        // Avoid replying to own tweets or retweets.
        if (mention.author_id === me.data.id) continue;

        const prompt = `You are ${agentDescription.identity ? agentDescription.identity.split('\n')[0] : 'an AI'}. Your full identity is: ${agentDescription.identity}.
        Someone mentioned you on Twitter: "${mention.text}".
        Formulate a brief, in-character reply under 280 characters.`;

        const { content: replyText } = await chatCompletion({
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 60,
        });

        await readWriteClient.v2.reply(replyText, mention.id);
      }

      try {
        // Use the standard path for sending inputs in the codebase
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId,
          name: 'updateLastReplied',
          args: {
            agentId: agent.id,
            lastRepliedTwitterId: newLastRepliedId,
          },
        });
      } catch (e) {
        console.error('Failed to update agent state:', e);
      }
    } catch (e) {
      console.error('Error reading/replying to mentions:', e);
    }
  },
});

export const syncTimeline = internalAction({
  handler: async (ctx) => {
    const readWriteClient = getTwitterClient();
    try {
      const me = await readWriteClient.v2.me();
      const timeline = await readWriteClient.v2.userTimeline(me.data.id, {
        exclude: ['replies', 'retweets'],
        max_results: 20,
      });
      if (!timeline.data.data) return;

      const worldStatus = await ctx.runQuery(api.world.defaultWorldStatus);
      if (!worldStatus) return;
      const playerDescriptions = await ctx.runQuery(internal.world.getPlayerDescriptions, {
        worldId: worldStatus.worldId,
      });
      const bukele = playerDescriptions.find((p) => p.name === 'President Bukele');
      if (!bukele) return;

      for (const tweet of timeline.data.data) {
        await ctx.runMutation(internal.world.addTweetToFeed, {
          authorId: bukele.playerId,
          authorName: bukele.name,
          text: tweet.text,
          twitterTweetId: tweet.id,
          worldId: worldStatus.worldId,
        });
      }
    } catch (e) {
      console.error('Error syncing timeline:', e);
    }
  },
});