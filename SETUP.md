# Setup — run this once at kickoff

> **⚠️ Status (2026-05-30): the app runs with one command; this doc is live-stack reference.**
> What shipped is lighter than the plan below. To run the app today, you do **not** need
> create-next-app, Tailwind, shadcn, Postgres, or React Flow — see **[README.md](README.md)**
> for the real one-command start (`npm install && npm run dev`).
>
> Done vs. this doc:
> - ✅ Next.js 15 App Router + `@/*` alias — added directly via `package.json` (no `create-next-app`).
> - ✅ Deps: `@anthropic-ai/sdk`, `graphology`, `zod`, `tsx`, `typescript` only.
> - ✅ Schemas, fixtures, pipeline, dashboard, diligence (delta/Q&A/memo) — all built.
> - ✅ **Pre-cached targets:** `spirit.com`, `wiz.io`, `everlane.com` (real source URLs).
> - ✅ **Fixture-first routing:** keyed on `isDemoTarget(target)`, not `DEMO_MODE`. Registered
>   fixtures always serve pre-cached; typed-in domains fetch live, cache-first (6h disk TTL).
>   `DEMO_MODE` is cosmetic (topbar badge only).
> - ✅ **Bright Data MCP wired** over SSE via `resolveMcpUrl()`; extractor model id fixed to
>   `claude-sonnet-4-6`. No keys needed for the pre-cached demo.
> - ⏭️ Skipped: Tailwind, shadcn, `@xyflow/react`, `pg`/drizzle, `@react-pdf` (hand-written CSS + custom SVG graph + `window.print()` instead).
> - 🟡 Pending for live data: Postgres persistence (currently in-memory + disk cache).
>
> The steps below are kept as the **live-stack reference** for when we wire persistence.

## 1. Bootstrap Next.js into the current directory

```bash
cd /Users/swathiparvathaneni/Documents/Projects/Hackathons/sentinels-vantage
npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint --no-import-alias
# When prompted about existing files, choose "yes" to merge — the starter files
# in src/lib/ and scripts/ should be preserved (they're not touched by the template).
```

## 2. Install dependencies

```bash
# Runtime
npm install @anthropic-ai/sdk graphology graphology-types zod \
  @xyflow/react date-fns lucide-react \
  pg drizzle-orm drizzle-kit \
  @react-pdf/renderer

# Dev
npm install -D tsx @types/pg

# shadcn UI (run interactively)
npx shadcn@latest init
npx shadcn@latest add button card input dialog tabs slider sheet badge separator scroll-area tooltip
```

## 3. Credentials

```bash
cp .env.example .env.local
# Fill in ANTHROPIC_API_KEY, BRIGHTDATA_API_TOKEN, DATABASE_URL
```

For a hackathon Postgres: **Vercel Postgres** (one-click) or **Neon free tier** are fastest. Both support pgvector.

## 4. Smoke test

```bash
# Test schemas compile
npx tsx scripts/test-schema.ts

# Test Bright Data MCP connection
npx tsx scripts/test-brightdata.ts

# Run the full pipeline once schemas + sources + extraction are wired
npx tsx scripts/dilly.ts peloton.com
```

## 5. Dev server

```bash
npm run dev
# Open http://localhost:3000
```

## Troubleshooting

**A typed-in domain shows 0 entities (pre-cached demos work fine).**
- **Empty/shadowed API key.** If `ANTHROPIC_API_KEY` is exported as an *empty string* in
  your shell, it shadows the value in `.env.local` (Node `--env-file` and Next's `@next/env`
  don't override already-set vars), so live extraction fails silently. `src/lib/env.ts` now
  guards against this (empty = unset, backfilled from `.env.local`), but check `echo
  $ANTHROPIC_API_KEY` is either unset or the real key. The pipeline also logs
  `[pipeline] all N extractions failed…` when this happens.
- **Stale empty cache.** A failed run used to be cached for 6h. The read path now treats a
  0-entity hit as a miss, but you can also just delete `.cache/` to force a fresh fetch.

## What's already scaffolded

| File | Status | Owner task |
|---|---|---|
| `src/lib/schema.ts` | ✅ Complete | VAN-102 |
| `src/lib/fixtures/{spirit,wiz,everlane}.ts` | ✅ Pre-cached fixtures (real URLs) | demo track |
| `src/lib/fixtures/index.ts` | ✅ Registry + `isDemoTarget()` / `isDemoMode()` | demo track |
| `src/lib/pipeline.ts` | ✅ `buildGraph` / `buildDossier` (fixture-first) | demo track |
| `src/lib/diligence.ts` | ✅ delta / Q&A / memo / analog | demo track |
| `src/lib/cache.ts` | ✅ disk cache for live dossiers (6h TTL) | demo track |
| `src/lib/env.ts` | ✅ resilient env reader (backfills `.env.local`, treats empty as unset) | demo track |
| `src/lib/usage.ts` + `api/usage` + `UsageWidget` | ✅ live usage metering + readout | demo track |
| `src/app/` (landing + dashboard + loader) | ✅ Built (CSS + custom SVG graph) | demo track |
| `src/lib/brightdata/sources.ts` | ✅ Fixture branch + live adapters wired | VAN-201..206 |
| `src/lib/brightdata/client.ts` | ✅ Bright Data MCP over SSE + `resolveMcpUrl()` | VAN-103 |
| `src/lib/extraction/extractor.ts` | ✅ Tool-use; model id `claude-sonnet-4-6` | VAN-301 |
| `src/lib/graph/store.ts` | 🟡 In-memory; Postgres persistence pending | VAN-303 |
| `src/lib/temporal/query.ts` | ✅ Traversals implemented | VAN-304 |
| `scripts/dilly.ts` | ✅ Runs end-to-end (fixtures or live) | VAN-306 |
