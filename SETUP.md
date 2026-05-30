# Setup — run this once at kickoff

> **⚠️ Status (2026-05-29): the demo track diverged from this doc.**
> What actually shipped is lighter than the plan below. To run the app today, you do
> **not** need create-next-app, Tailwind, shadcn, Postgres, or React Flow — see
> **[README.md](README.md)** for the real one-command start (`npm install && npm run dev`).
>
> Done vs. this doc:
> - ✅ Next.js 15 App Router + `@/*` alias — added directly via `package.json` (no `create-next-app`).
> - ✅ Deps: `@anthropic-ai/sdk`, `graphology`, `zod`, `tsx`, `typescript` only.
> - ✅ Schemas, fixtures, pipeline, dashboard, diligence (delta/Q&A/memo) — all built.
> - ⏭️ Skipped for the demo track: Tailwind, shadcn, `@xyflow/react`, `pg`/drizzle, `@react-pdf` (hand-written CSS + custom SVG graph + `window.print()` instead).
> - 🟡 Pending for live data: Postgres, real Bright Data endpoints, `@react-pdf` (see README "Live-data bridge").
>
> The steps below are kept as the **live-stack reference** for when we wire real scraping + persistence.

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

## What's already scaffolded

| File | Status | Owner task |
|---|---|---|
| `src/lib/schema.ts` | ✅ Complete | VAN-102 |
| `src/lib/fixtures/peloton.ts` | ✅ Demo fixtures complete | demo track |
| `src/lib/fixtures/index.ts` | ✅ Registry + `isDemoMode()` | demo track |
| `src/lib/pipeline.ts` | ✅ `buildGraph` / `buildDossier` | demo track |
| `src/lib/diligence.ts` | ✅ delta / Q&A / memo / analog | demo track |
| `src/app/` (landing + dashboard) | ✅ Built (CSS + custom SVG graph) | demo track |
| `src/lib/brightdata/sources.ts` | 🟡 Demo branch wired; live calls stubbed | VAN-201..206 |
| `src/lib/brightdata/client.ts` | 🟡 Skeleton — fill in real Bright Data endpoints | VAN-103 |
| `src/lib/extraction/extractor.ts` | 🟡 Demo branch wired; fix model id + prompt | VAN-301 |
| `src/lib/graph/store.ts` | 🟡 In-memory; Postgres persistence pending | VAN-303 |
| `src/lib/temporal/query.ts` | ✅ Traversals implemented | VAN-304 |
| `scripts/dilly.ts` | ✅ Runs end-to-end in demo mode | VAN-306 |
