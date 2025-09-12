import { query, mutation } from './_generated/server';
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
