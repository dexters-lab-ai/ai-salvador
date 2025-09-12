# AI Town (AI Salvador) – Features & Architecture

This document gives a friendly but detailed tour of the app’s capabilities and how the pieces fit together under the hood. It’s intended for both product folks and developers.

---

## Features Overview

- Player Pools (Law of the Jungle)
  - Live counts of Active vs Pool.
  - “Wait” (join pool) / “Leave” (exit pool) actions.
  - Optional “slot open” ping + TTS announcement.
  - “Take slot” server-side mutation available for instant claims (not shown by default yet).

- Cops & Robbers Chase
  - Triggerable chase between ICE and MS-13 that converges at the cave.
  - Reset occurs 10 seconds after both reach the destination to avoid premature reset.
  - During a chase, President Bukele runs to (44,13) with an emergency activity banner.

- Agent Conversations and TTS
  - Conversations visible in the sidebar.
  - TTS reads agent (not human) messages using the Web Speech API with simple male/female voice selection by agent name.

- Treasury & Economy
  - Treasury widget shows BTC holdings and a USD estimate.
  - Agent portfolio stats.
  - Event-driven floating text for transactions above agents.

- Cinematic Landing, Map, and Overlay Actors
  - PIXI-powered map and player rendering.
  - Overlay “crocodile” actors zig-zagging with animated thought bubbles.
  - Statue emoji landmark.

- Admin Controls (optional)
  - If built with `VITE_ADMIN=1`, admins can “Trigger Chase” from the UI.

---

## Key UX Surfaces

- `src/components/UserPoolWidget.tsx`
  - Desktop: expanded panel at top-right, two stat tiles on the first row and the actions row beneath, aligned right.
  - Mobile: compact icon button (🏊) that expands vertically.
  - Particle canvases draw behind counts as background.

- `src/components/Treasury.tsx`
  - Top-left widget, expands for more context on economy and tourist counts.

- `src/components/Messages.tsx`
  - Conversation view with auto-scroll and TTS for agent lines.

- `src/components/PixiGame.tsx`
  - Main game canvas built on PIXI.
  - Overlay crocodiles and statue layer.

---

## Backend (Convex) Architecture

Directories:
- `convex/` – All Convex functions, schema, and helpers
  - `convex/schema.ts` – Master schema; includes `waitingPool` and AI Salvador tables
  - `convex/world.ts` – World actions like starting chase, monitoring arrival, and resetting
  - `convex/waitingPool.ts` – Pool queries/mutations; optional `attemptTakeSlot`
  - `convex/aiTown/*` – Original AI Town engine pieces (players, conversations, world state)
  - `convex/constants.ts` – Engine constants shared server-side

### Data Model (selected)
- `waitingPool` table
  - Fields: `worldId`, `tokenIdentifier`, `createdAt`
  - Indexes: `by_worldId` (world size), `by_token` (user lookup)

- AI Salvador tables (in `schema.ts`)
  - `villageState` – treasury, btcPrice, sentiment, touristCount
  - `portfolios` / `transactions` – very light agent economy demo

### Pool Operations
- `getPoolCounts({ worldId })` – returns `{ activeHumans, poolCount }` where `activeHumans` counts players with a `human` token.
- `getMyPoolStatus({ worldId })` – returns `{ inPool }` for current user’s token.
- `joinWaitingPool({ worldId })` / `leaveWaitingPool({ worldId })` – manage pool membership.
- `attemptTakeSlot({ worldId })` – atomically claim a slot and call `world.joinWorld` if capacity is available; removes user from pool.

### Chase Flow (Cops & Robbers)
- `triggerChase({ worldId })` (mutation)
  - Locates ICE and MS-13; sets activities and speed; moves both toward cave `(5,45)`.
  - Dispatches President Bukele toward `(44,13)` with activity “Rushing to emergency room…”.
  - Schedules `monitorChase` for arrival tracking.

- `monitorChase({...})` (internalMutation)
  - Waits until both agents arrive at the cave.
  - Starts a 10-second dwell timer; upon completion, calls `resetChase`.

- `resetChase({...})` (internalMutation)
  - Transfers MS-13 balance to ICE.
  - Clears speeds, activities, movement for ICE, MS-13, and Bukele.
  - Optionally relocates agents to resume routine.

---

## Frontend Architecture

- Framework: React + Vite + TypeScript
- Rendering: PIXI via `@pixi/react`
- Realtime/Data: Convex React client hooks (`useQuery`, `useMutation`)
- Styling: Tailwind CSS

### Key Components and Helpers
- `src/components/UserPoolWidget.tsx`
  - Queries:
    - `api.world.defaultWorldStatus` (get worldId)
    - `api.waitingPool.getPoolCounts`
    - `api.waitingPool.getMyPoolStatus`
  - Mutations via `useConvex()`:
    - `waitingPool.joinWaitingPool`, `waitingPool.leaveWaitingPool`
  - Behavior:
    - Announce capacity openings with a beep + TTS.
    - Desktop expanded layout and mobile compact button.

- `src/components/Messages.tsx`
  - Streams conversation messages; TTS uses `window.speechSynthesis`.
  - Speaks only agent messages and tracks spoken IDs to avoid repeats.

- `src/components/PixiGame.tsx`
  - Hosts `PixiViewport` and draws map (`PixiStaticMap`), players (`Player`), and overlays.
  - Overlay actors are animated using the PIXI ticker (with guards for cleanup).

- `src/components/PixiViewport.tsx`
  - Thin custom wrapper to initialize `pixi-viewport` with correct events and plugins.

- `src/hooks/sendInput.ts`
  - Small helper to send engine inputs to Convex.

---

## End-to-End Flows

### A. Law of the Jungle (Pool)
1. User lands → client reads `worldId` via `api.world.defaultWorldStatus`.
2. `UserPoolWidget` subscribes to `waitingPool.getPoolCounts` and `getMyPoolStatus`.
3. - If logged out: widget rotates login CTA and stats.
   - If logged in:
     - Shows counts and actions (Wait/Leave).
4. When user taps “Wait”: client calls `waitingPool.joinWaitingPool`.
5. When capacity opens:
   - The widget detects `activeHumans < MAX_HUMAN_PLAYERS` and announces with a beep + TTS.
   - Optional: surface a “Take slot” button wired to `attemptTakeSlot` for atomic claim.

### B. Trigger Chase → Arrival → Reset
1. Admin taps “Trigger Chase” (visible when built with `VITE_ADMIN=1`).
2. `world.triggerChase` sets agents’ activities/speeds and moves them to the cave; also dispatches Bukele to `(44,13)`.
3. `world.monitorChase` polls arrival of both ICE and MS-13 at `(5,45)`.
4. When both arrive, a 10-second dwell timer starts; after that, `world.resetChase` runs to clear movement/activity/speed and transfers balances.

### C. Agent Replies Read Out Loud
1. Messages list subscribes to `api.messages` for the active conversation.
2. Each new agent message triggers a TTS utterance.
3. The speaking voice is selected heuristically by agent name.

---

## Configuration & Deployment

### Frontend build-time env (Vite)
- `VITE_CONVEX_URL` – Convex production URL (e.g., `https://<id>.convex.cloud`) – required.
- `VITE_ADMIN` – `1` to show admin Trigger Chase; defaults to `0`.
- `VITE_CLERK_PUBLISHABLE_KEY` – If you’re using Clerk components in the UI.

Pass these as Docker build args (preferred) or commit a `.env.production` file.

### Convex env (server-side)
- `CLERK_HOSTNAME` – Required by `convex/auth.config.ts` when using Clerk (hostname only).
- Other optional tokens (e.g., `REPLICATE_API_TOKEN`) if your functions use them.

### Docker (Sliplane)
- Dockerfile builds Vite app and serves via Nginx.
- Build args to set in Sliplane:
  - `VITE_CONVEX_URL=https://<your>.convex.cloud`
  - `VITE_ADMIN=1` (optional)
  - `VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx` (optional)
- Runtime: expose port 80; health check `GET /`.

---

## Notes & Gotchas

- Vite envs are baked at build-time; changing Sliplane runtime envs won’t affect the already-built bundle.
- If crocs/statue aren’t visible immediately, pan to tiles around (31,33), (30,37), and (42,10). They have outline stroke for readability.
- If you disable Clerk, either set `CLERK_HOSTNAME` to a valid hostname or make `convex/auth.config.ts` conditional.

---

## Pointers to Source

- Pool: `src/components/UserPoolWidget.tsx`, `convex/waitingPool.ts`, `convex/schema.ts`
- Chase: `convex/world.ts`, `convex/constants.ts`
- TTS: `src/components/Messages.tsx`, `src/components/UserPoolWidget.tsx`
- PIXI/Map: `src/components/PixiGame.tsx`, `src/components/PixiViewport.tsx`, `src/components/PixiStaticMap.tsx`
- Economy: `src/components/Treasury.tsx`, `convex/schema.ts` (portfolios, transactions)
- Engine: `convex/aiTown/*`

---

## Roadmap Ideas

- Surface a “Slots free!” badge + “Take slot” button wired to `attemptTakeSlot`.
- Pool promotion logic (still law of the jungle, but optionally nudge/notify users in pool).
- Better voice selection and TTS controls (muting, per-agent voices, rate/pitch UI).
- Richer emergent events beyond chase (market events, weather, festivals).
