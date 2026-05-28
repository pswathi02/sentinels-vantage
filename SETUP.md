# Setup — run this once at kickoff

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
| `src/lib/brightdata/client.ts` | 🟡 Skeleton — fill in real MCP calls | VAN-103 |
| `src/lib/brightdata/sources.ts` | 🟡 Pattern + SERP example — copy for other sources | VAN-201..206 |
| `src/lib/extraction/extractor.ts` | 🟡 Skeleton — refine prompt | VAN-301 |
| `src/lib/graph/store.ts` | 🟡 Skeleton — wire to Postgres | VAN-303 |
| `src/lib/temporal/query.ts` | 🟡 Skeleton — implement traversals | VAN-304 |
| `scripts/dilly.ts` | 🟡 Orchestration shell | VAN-306 |
