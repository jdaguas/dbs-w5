<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Wiki Heatmap (Design, Build, Ship · Assignment 5)

A live heat map of the most-edited English Wikipedia articles. Signed-in users follow articles and watch their edit activity update without refreshing.

## Stack
- Next.js (App Router, `src/`) + Tailwind, deployed on Vercel from GitHub
- Clerk for sign-in
- Supabase project **"Live Data"** (`ntbammrxfslyithbnmia`): database, Realtime, and the worker. Do NOT touch the other Supabase project (Assignment 4).
- Worker: Supabase Edge Function in `supabase/functions/` (Deno), called by Supabase Cron every 10s. `supabase` is excluded in `tsconfig.json` so the Next.js build ignores it.

## Data source
English Wikipedia recent changes API: `https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rctype=edit|new&rcnamespace=0&rcshow=!bot&rclimit=500&format=json&formatversion=2`
- Send a descriptive `User-Agent` (Wikimedia policy).
- ~75 human article edits/minute. Use `rcid` to tell new edits from ones already saved.

## Rules
- The worker writes with the Supabase secret key, which Supabase provides on its servers. Never put keys in code.
- Save only what changed (Realtime free tier counts every change sent to every open page).
- See `docs/data-flow.md` for the data flow chart.
