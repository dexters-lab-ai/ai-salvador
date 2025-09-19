# Twitter API Integration Plan (Revised)

This document outlines the plan to integrate AI Salvador with the live Twitter/X API, allowing the agent "President Bukele" to post tweets with screenshots, read mentions, and reply.

---

## Part 1: Audit - What We Have Right Now

Your initial audit is correct. The current system is a closed, internal simulation and does not connect to the real Twitter/X API.

-   **Database (`convex/schema.ts`):** The `tweets` table is functional for internal posts but lacks fields for linking to live tweets (`twitterTweetId`), which is crucial for syncing and avoiding duplicates.
-   **Agent Logic (`convex/aiTown/agentOperations.ts`):** `agentComposeTweet` correctly generates text but saves it internally. `agentReadSocialFeed` reads from this internal table. There is no usage of the Twitter API.
-   **UI (`src/App.tsx`):** The "Social 🐦" button and modal correctly display these internal posts, not a real-time feed.

**Conclusion:** We have the foundational pieces for an agent to think about social media, but we are missing the critical bridge to the actual Twitter/X platform.

---

## Part 2: The Plan to Implement the Live API

This revised plan addresses all requirements, including the complex challenge of attaching client-side screenshots to server-generated tweets.

### Crucial Prerequisite: The Screenshot Workflow

The most significant architectural challenge is that the agent's decision to tweet happens on the **server**, but the visual game state to be screenshotted only exists on the **client**. We cannot take a screenshot directly from a Convex server function.

**Solution: A Client-Server Coordinated Workflow**

1.  **Server-Side Generation:** The `agentComposeTweet` action will generate the tweet text as planned. Instead of posting directly, it will save this text to a new `pendingTweets` table.
2.  **Client-Side Capture & Upload (Admin UI):** A special UI component, visible only to an admin user, will poll for new documents in the `pendingTweets` table. When a new pending tweet appears, the admin will see a button (e.g., "Post Bukele's Tweet").
3.  **Client-Side Action:** Clicking this button will:
    a. Capture a screenshot of the game canvas.
    b. Upload the screenshot image directly to Convex File Storage, which returns a `storageId`.
    c. Call a new server-side action, `sendTweetWithImage`, passing the `pendingTweetId` and the new `storageId`.
4.  **Server-Side Posting:** The `sendTweetWithImage` action will:
    a. Retrieve the tweet text from the `pendingTweets` table.
    b. Get the image from Convex Storage using the `storageId`.
    c. Upload the image to Twitter's media endpoint to get a `media_id`.
    d. Post the tweet with both the text and the `media_id`.
    e. Update our internal `tweets` table with the final details, including the real `twitterTweetId`.

This workflow ensures the screenshot is from a live client session while keeping all API secrets and posting logic securely on the server.

### Step 1: Add the Twitter API Client

-   **Where:** `package.json`
-   **What:** Add a robust library for the Twitter v2 API. The `twitter-api-v2` package is an excellent choice as it handles OAuth 1.0a authentication required for posting tweets with media.

### Step 2: Update Database Schema

-   **Where:** `convex/schema.ts` & `convex/aiTown/agent.ts`
-   **What:**
    1.  **Modify `tweets` table:** Add `twitterTweetId: v.optional(v.string())` and an index on that field to link to live tweets and prevent duplicates.
    2.  **Create new `pendingTweets` table:** `{ agentId: v.id('agents'), text: v.string(), status: v.union(v.literal('pending'), v.literal('posted')) }`. This will stage tweets for client-side screenshotting.
    3.  **Modify `SerializedAgent`:** Add `lastRepliedTwitterId: v.optional(v.string())` to the agent's state to track replies to mentions.

### Step 3: Create a Dedicated Twitter API Module

-   **Where:** A new file: `convex/agent/twitter.ts`
-   **What:** This module will centralize all Twitter API interactions, reading credentials from environment variables.
    -   `postTweetWithImage(text, storageId)`: The core function. It will fetch the image from Convex storage, upload it to Twitter to get a `media_id`, then post the tweet with the text and `media_id`.
    -   `fetchMentions(since_id)`: Fetches recent tweets mentioning the account.
    -   `replyToTweet(text, tweetId)`: Posts a reply to a specific tweet.

### Step 4: Update Agent & Client Logic

-   **Agent Logic (`convex/aiTown/agentOperations.ts`):**
    -   **Modify `agentComposeTweet`:** Instead of posting, this action will now generate text and create a new document in the `pendingTweets` table with `status: 'pending'`.
    -   **Create new action `agentReadMentionsAndReply`:**
        -   Triggered periodically by Bukele's `agentDoSomething`.
        -   Fetches new mentions from Twitter since `lastRepliedTwitterId`.
        -   Uses an LLM to generate a thoughtful reply for each.
        -   Calls `replyToTweet` to post the reply.
        -   Updates its `lastRepliedTwitterId` state.

-   **Client Logic (New Admin Component or `src/App.tsx`):**
    -   Create a new UI component visible only when `VITE_ADMIN` is enabled.
    -   This component will use `useQuery(api.world.getPendingTweets)` to poll for tweets.
    -   It will display a button for each pending tweet.
    -   The button's `onClick` handler will perform the client-side screenshot and upload workflow described in the prerequisite section.

### Step 5: Implement Timeline Syncing

-   **Where:** `convex/crons.ts` and a new action in `convex/agent/twitter.ts`.
-   **What:** A new cron job that runs every few minutes to call `syncTimeline`. This action will fetch the latest tweets from the account's timeline and save any new ones to the internal `tweets` table.
-   **Why:** This feedback loop allows other AI agents to "read" tweets posted by Bukele (or manually from the Twitter account) via the existing `agentReadSocialFeed` logic, making the world more dynamic and interconnected.

### Step 6: Risk Mitigation & Best Practices

-   **Rate Limiting:** All functions in `convex/agent/twitter.ts` must include robust error handling for Twitter's API rate limits, with exponential backoff for retries.
-   **Security:** API keys and secrets will remain strictly on the server as environment variables. No client-side code will handle them.
-   **Error Handling:** The system will be resilient to Twitter API outages, queueing or gracefully failing operations with clear logs.

This revised plan is comprehensive and directly tackles the client-side dependency for screenshots, ensuring a secure and functional integration that meets all of your requirements.
