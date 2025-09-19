
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { newsArticles } from '../data/news';

export const seedNews = mutation({
  handler: async (ctx) => {
    const existingNews = await ctx.db.query('news').collect();
    if (existingNews.length > 0) {
      console.log('News already seeded.');
      return;
    }

    for (const article of newsArticles) {
      await ctx.db.insert('news', {
        ...article,
        timestamp: Date.now(),
      });
    }
    console.log('News seeded successfully.');
  },
});

export const getRandomNewsArticle = query({
  handler: async (ctx) => {
    const allNews = await ctx.db.query('news').collect();
    if (allNews.length === 0) {
      return null;
    }
    const randomIndex = Math.floor(Math.random() * allNews.length);
    return allNews[randomIndex];
  },
});

export const addNewsArticle = mutation({
  args: {
    source: v.string(),
    headline: v.string(),
    content: v.string(),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // In a real app, you'd want to check for admin privileges here.
    // const identity = await ctx.auth.getUserIdentity();
    // if (identity?.tokenIdentifier !== "admin_user_identifier") {
    //   throw new ConvexError("Not authorized to add news.");
    // }
    await ctx.db.insert('news', {
      ...args,
      timestamp: Date.now(),
    });
  },
});
