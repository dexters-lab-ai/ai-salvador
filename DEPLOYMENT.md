# Deployment Guide

This repo supports two simple, production-ready paths:

- Netlify (frontend) + Convex Cloud (backend)
- Sliplane (Docker) + Convex Cloud

Both use Convex Cloud for the backend; we do not run Convex inside the container.

---

## Netlify (recommended for quick frontend hosting)

Prereqs:
- Convex production deployment URL (example):
  - `https://dependable-ptarmigan-176.convex.cloud`
- GitHub repo connected to Netlify

Netlify settings:
- Build command: `npm run build`
- Publish directory: `dist`
- Base directory: leave blank
- Node version: `18` (set as an env var or in your site settings)

Environment variables (build-time for Vite):
- `VITE_CONVEX_URL` = your Convex prod URL
- `VITE_ADMIN` = `1` (optional; shows admin Trigger Chase button)
- `VITE_CLERK_PUBLISHABLE_KEY` = `pk_live_xxx` (only if using Clerk on the frontend)
- `NODE_VERSION` = `18`

Repository file:
- `netlify.toml` is included with SPA fallback and asset caching. It ensures all routes resolve to `index.html` and sets long-lived cache headers for `/assets/*`.

Local sanity check:
```bash
npm ci
npm run build
npm run preview
# open http://localhost:4173
```

---

## Sliplane (Docker) + Convex Cloud

Sliplane builds directly from the repo’s `Dockerfile` and accepts build args for Vite.

Dockerfile build args (must be provided at build-time):
- `VITE_CONVEX_URL` = your Convex prod URL
- `VITE_ADMIN` = `1` (optional; admin Trigger Chase)
- `VITE_CLERK_PUBLISHABLE_KEY` = `pk_live_xxx` (only if using Clerk in the UI)

Sliplane configuration:
- Build from GitHub repo using the Dockerfile
- Build Args:
  - `VITE_CONVEX_URL=https://<your>.convex.cloud`
  - `VITE_ADMIN=1` (optional)
  - `VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx` (optional)
- Runtime:
  - Expose port `80`
  - Health check: HTTP GET `/`
  - No runtime env vars are required (Vite envs are baked at build)

---

## Convex Cloud (backend)

Deploy Convex functions:
```bash
npx convex login
npx convex deploy
```

Convex environment variables (server-side):
- `CLERK_HOSTNAME` — required by `convex/auth.config.ts` when using Clerk (hostname only, no protocol)
- Any other server-only tokens (e.g., `REPLICATE_API_TOKEN`) if your functions use them

Notes:
- `CONVEX_SITE_URL` (HTTP Actions URL) is provided automatically by Convex in `process.env`.
- If you restrict CORS in Convex, add your Netlify/Sliplane domain(s) as allowed origins.

---

## Post-deploy Checklist

- Landing loads correctly
- Pools widget (desktop): two tiles on first row, controls on second row (right-aligned)
- Pools widget (mobile): icon button expands vertically
- Crocs and statue visible near tiles (~31,33), (30,37), (42,10)
- Trigger Chase (if `VITE_ADMIN=1`): ICE + MS-13 wait 10s at cave before reset; Bukele runs to (44,13)
- Chat TTS: agent messages are spoken; human messages are not

---

## Troubleshooting

- 404 on deep links (Netlify): ensure SPA redirect to `/index.html` (provided by `netlify.toml`)
- Missing admin button: rebuild with `VITE_ADMIN=1`
- Frontend can’t reach Convex: verify `VITE_CONVEX_URL` is set correctly at build-time; redeploy
- Clerk UI errors: set `VITE_CLERK_PUBLISHABLE_KEY` in frontend and `CLERK_HOSTNAME` in Convex env
