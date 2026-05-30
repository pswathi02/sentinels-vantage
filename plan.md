# Vantage — Execution Plan

> Built from a full read of every source file. Tracks exact current state and what to do next.
> **Today:** 2026-05-30 | **Target:** Bright Data Hackathon submission

---

## 🟢 Status update — live-fetch reliability + graph readability (2026-05-30)

Hardened the **typed-in (live) path** end-to-end and made the knowledge graph readable for
large companies.

**Done:**
- ✅ **Fixed "new companies return 0 entities".** Two root causes:
  1. An empty-string `ANTHROPIC_API_KEY` in the shell silently shadowed `.env.local`
     (Node `--env-file` / `@next/env` don't override already-set vars), so the Anthropic
     client was built with no key and every extraction failed → 0 entities. New
     **`src/lib/env.ts`** `env()` helper treats empty/whitespace as unset and backfills
     missing keys from `.env.local`. Wired into the extractor, Bright Data client, pipeline,
     and the `[domain]` page. Live runs now succeed (e.g. `starbucks.com` → ~49 entities).
  2. **Stale empty-dossier cache entries** (written before the "never cache empty" guard
     existed) were served instantly for 6h. Cleared the poisoned `.cache/` files and added a
     **self-healing read guard** in `pipeline.ts`: a 0-entity cache hit is now treated as a
     miss, so a transient failure can't stick.
- ✅ **Extraction failures are now surfaced** — if every doc's extraction fails,
  `pipeline.ts` logs the underlying error instead of silently rendering an empty dashboard.
- ✅ **Lookback selector moved next to the graph** — 30 / 90 / 180-day buttons in the
  graph header re-run the server pipeline via `?days=N` (no trip back to the landing page).
  All "window" copy now reflects the active `lookbackDays`, not a hardcoded 180.
- ✅ **Landing + loader polish for judges** — the loader mascot is now **"Vantagent"**, an
  IB/PE-styled character (tie/collar) orbited by the people / litigation / filings / company
  icons used elsewhere; the search row is no longer squished; hero + hint copy rewritten in
  professional product voice (not dev-demo wording).
- ✅ **Readable knowledge graph** — replaced the single overloaded ring with a
  **degree-ranked, 3-ring concentric layout** (most-connected entities innermost, staggered
  ring angles so labels don't stack). The canvas is capped at 37 nodes; overflow stays in the
  scrollable **Sources** list. Larger viewBox (`800×560`). Also **fixed a React hydration
  error** by rounding all SVG coordinates to 2 dp (float string mismatch between SSR + client).

---

## 🟢 Status update — fixture-first routing + live MCP wired (2026-05-30)

The demo and live stacks converged on **one code path**. The routing decision is now
**per-target** (does a fixture exist?), not a global `DEMO_MODE` flag.

**Done since the 2026-05-29 update:**
- ✅ **New demo registry** — Peloton/WeWork/Klaviyo retired; the three live pre-cached
  targets are **`spirit.com`** (Spirit Airlines distress arc), **`wiz.io`** (breakout growth
  → Google's $32B acquisition), **`everlane.com`** (mixed arc → Shein acquisition). Every
  fixture uses **real source URLs**, so each citation opens the exact article.
- ✅ **Fixture-first routing, decoupled from `DEMO_MODE`** — `isDemoTarget(target)` gates the
  data path. Registered fixtures **always** serve pre-cached data (`ingestAll`/`extract`
  short-circuit to the fixture, never fetch). Typed-in domains fetch live, **cache-first**
  (6h disk TTL in `src/lib/cache.ts`); empty/failed runs are never cached so a retry can
  still succeed. `DEMO_MODE` is now **cosmetic** — only toggles the topbar badge.
- ✅ **Bright Data MCP wired** — `client.ts` talks to the MCP server over SSE;
  `resolveMcpUrl()` normalizes `BRIGHTDATA_MCP_URL` (adds `/sse`, substitutes the token
  placeholder). Token rides in the URL (no `Authorization` header). `recordBrightData(1)`
  meters each call at call-start.
- ✅ **Model id fixed** — `extractor.ts` now uses `claude-sonnet-4-6` (was a stale id).
- ✅ **UX adds** — route-level VANTA loader (`loading.tsx`) during live fetch, live usage
  widget (`api/usage/route.ts` + `UsageWidget.tsx`, metering in `src/lib/usage.ts`),
  selectable lookback window (30 / 90 / 180 days, default 30).
- ✅ **UI memo redesign + scope-filtering merged** — the `memo-redesign-scope-filtering`
  branch was merged into main (UI changes from the branch, backend/data from main). Adds the
  scope-control, in-scope dossier filtering by hidden entities, and the IC callout.

**Still pending (live track):**
- 🟡 Phase 2 — Postgres persistence (graph + dossiers are in-memory / disk-cache only).
- 🟡 Phase 6 — dedicated API routes (the dashboard renders server-side from `buildDossier`).
- 🟡 Analog search remains a **demo mock** until a multi-company signal index exists.

> The dated blocks above are the source of truth; the original phases below are kept for
> reference. Items there that are now done (model id, MCP client, landing page, dashboard,
> intelligence layer) are reflected in the two status blocks.

---

## 🟢 Status update — demo track shipped (2026-05-29)

A **demo/pre-cached track** was built ahead of the live stack so the team stays aligned on
the original idea while live Bright Data endpoints are wired in parallel. It runs with
**zero credentials** (`npm install && npm run dev`) and flows fixture data through the
*real* graph/temporal/UI code. See **[README.md](README.md)**.

**Done (demo track):**
- ✅ Phase 0 bootstrap — done via lightweight `package.json` (npm + Node), **not**
  create-next-app. No Tailwind / shadcn / Postgres / React Flow (hand-written CSS + custom
  SVG graph instead).
- ✅ Phase 3 — `scripts/dilly.ts` runs end-to-end (demo mode).
- ✅ Phase 5 — landing page + 3 demo cards (Peloton live; WeWork/Klaviyo pending fixtures).
- ✅ Phase 7 — dashboard: time slider + replay, custom SVG knowledge graph, active cited signals.
- ✅ Phase 8 (client-side equivalents) — Δ delta report, cited Q&A, lag-aware memo, analog
  panel — all as pure functions in `src/lib/diligence.ts`.
- ✅ Phase 9-B — memo "Export PDF" via scoped `window.print()` (no `@react-pdf` dependency).

**Still pending (live track — see "Live-data bridge" below):**
- 🟡 Phase 1 — real Bright Data endpoints in `client.ts` + model id fix in `extractor.ts`.
- 🟡 Phase 2 — Postgres persistence (graph is in-memory only).
- 🟡 Phase 4 — pre-cache WeWork + Klaviyo (need fixtures or a live run).
- 🟡 Phase 6 — API routes (the demo renders server-side from `buildDossier`, no routes yet).
- 🟡 Analog search is a **demo mock** until a multi-company signal index exists.

> The phases below are the **original full plan**; treat the items above as the source of
> truth for what's already built.

---

## Current state of the repo

The scaffolding layer is done. Business logic and the entire Next.js app do not exist yet.

| File | State | Gap |
|---|---|---|
| `src/lib/schema.ts` | ✅ Complete | None |
| `src/lib/brightdata/client.ts` | 🟡 Skeleton | Uses fake REST patterns — needs real Bright Data MCP SDK |
| `src/lib/brightdata/sources.ts` | 🟡 Skeleton | All 6 adapters + orchestrator exist but call the skeleton client |
| `src/lib/extraction/extractor.ts` | 🟡 Skeleton | Uses wrong model ID (`claude-sonnet-4-5-20250929`) |
| `src/lib/graph/store.ts` | 🟡 Skeleton | `persistGraph` / `loadGraph` are TODO stubs |
| `src/lib/temporal/query.ts` | 🟡 Skeleton | Logic complete — no I/O needed |
| `scripts/dilly.ts` | 🟡 Skeleton | Will work once client + extractor + DB are wired |
| `package.json` | ❌ Missing | Next.js not bootstrapped yet |
| `tsconfig.json` | ❌ Missing | `@/lib/...` path aliases broken until bootstrap |
| `src/app/` | ❌ Missing | No UI at all |
| DB migration | ❌ Missing | No Postgres schema |
| API routes | ❌ Missing | Nothing wired to the front end |

---

## Phase 0 — Bootstrap (do first, unblocks everything)

### 0-A  Next.js project bootstrap
```bash
cd /Users/ahmadjajja/D\ Drive/Programming/sentinels-vantage
npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint --no-import-alias
# Say YES to merge — existing files in src/lib/ and scripts/ must be preserved
```

### 0-B  Install dependencies
```bash
npm install @anthropic-ai/sdk graphology graphology-types zod \
  @xyflow/react date-fns lucide-react \
  pg drizzle-orm drizzle-kit \
  @react-pdf/renderer

npm install -D tsx @types/pg

npx shadcn@latest init
npx shadcn@latest add button card input dialog tabs slider sheet badge separator scroll-area tooltip
```

### 0-C  Credentials
```bash
cp .env.example .env.local
# Fill in: ANTHROPIC_API_KEY, BRIGHTDATA_API_TOKEN, DATABASE_URL
```

### 0-D  Smoke tests
```bash
npx tsx scripts/test-schema.ts   # must pass before touching anything else
npm run dev                      # must start without errors
```

**Exit criteria:** `npx tsx scripts/test-schema.ts` prints `All schemas valid ✓`.

---

## Phase 1 — Fix model ID + wire Bright Data client (VAN-103)

### 1-A  Fix model ID in `src/lib/extraction/extractor.ts:25`
Change:
```ts
const MODEL = 'claude-sonnet-4-5-20250929';
```
To:
```ts
const MODEL = 'claude-sonnet-4-6';
```

### 1-B  Replace fake REST client with real Bright Data MCP SDK
File: `src/lib/brightdata/client.ts`

The current client calls `${MCP_URL}/serp`, `${MCP_URL}/unlock`, etc. — these are not valid Bright Data endpoints.

Correct approach:
- Use the [Bright Data MCP Server](https://github.com/brightdata/brightdata-mcp) or the direct zone-based proxy URLs
- For SERP: POST to `https://api.brightdata.com/serp/google` with `Authorization: Bearer TOKEN`
- For Web Unlocker: send request through the proxy endpoint with zone auth
- For Scraping Browser: use Puppeteer + Bright Data CDP endpoint
- For Datasets: use `https://api.brightdata.com/datasets/v3/...`

**Concrete changes needed:**
1. `brightDataSerp()` — fix endpoint and response shape to match real Bright Data SERP API
2. `brightDataUnlock()` — use proxy-based unlock (POST to zone proxy or use `request` with proxy config)
3. `brightDataBrowserRender()` — integrate Puppeteer + `wss://brd-customer-...@brd.superproxy.io:9222`
4. `brightDataDataset()` — fix to real Datasets v3 endpoint

### 1-C  Smoke test Bright Data connection
```bash
npx tsx scripts/test-brightdata.ts
```
Must return ≥1 SERP result before proceeding.

---

## Phase 2 — Postgres database (VAN-104)

File to create: `src/lib/db/schema.sql` (or use drizzle-kit migration)

```sql
CREATE TABLE IF NOT EXISTS entities (
  target_domain TEXT NOT NULL,
  id            TEXT NOT NULL,
  payload       JSONB NOT NULL,
  PRIMARY KEY (target_domain, id)
);

CREATE TABLE IF NOT EXISTS relations (
  target_domain TEXT NOT NULL,
  id            TEXT NOT NULL,
  from_id       TEXT NOT NULL,
  to_id         TEXT NOT NULL,
  kind          TEXT NOT NULL,
  valid_from    TIMESTAMPTZ NOT NULL,
  valid_to      TIMESTAMPTZ,
  observed_at   TIMESTAMPTZ NOT NULL,
  payload       JSONB NOT NULL,
  PRIMARY KEY (target_domain, id)
);

CREATE INDEX IF NOT EXISTS relations_time_idx
  ON relations (target_domain, valid_from, valid_to);

CREATE TABLE IF NOT EXISTS raw_documents (
  id            TEXT PRIMARY KEY,
  target_domain TEXT NOT NULL,
  url           TEXT NOT NULL,
  source        TEXT NOT NULL,
  title         TEXT,
  body          TEXT NOT NULL,
  published_at  TIMESTAMPTZ,
  scraped_at    TIMESTAMPTZ NOT NULL,
  metadata      JSONB
);

CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  target_domain TEXT NOT NULL,
  company_id    TEXT NOT NULL,
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  description   TEXT NOT NULL,
  sources       JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_signals (
  id             TEXT PRIMARY KEY,
  target_domain  TEXT NOT NULL,
  company_id     TEXT NOT NULL,
  category       TEXT NOT NULL,
  severity       TEXT NOT NULL,
  observed_at    TIMESTAMPTZ NOT NULL,
  description    TEXT NOT NULL,
  evidence       JSONB NOT NULL,
  detection_method TEXT NOT NULL,
  suggested_ic_question TEXT
);
```

Then wire `persistGraph` and `loadGraph` in `src/lib/graph/store.ts`.

Create `src/lib/db/client.ts`:
```ts
import { Pool } from 'pg';
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

---

## Phase 3 — End-to-end pipeline (VAN-306 milestone)

After Phase 1 and Phase 2, the CLI should work:

```bash
npx tsx scripts/dilly.ts peloton.com
```

Expected output:
```
◆ Vantage diligence on peloton.com

[1/4] Fanning out across Bright Data sources...
     ✓ N docs collected (M source errors)
[2/4] Extracting entities + temporal relations with Claude...
[3/4] Building temporal knowledge graph...
     ✓ X entities, Y relations
[4/4] Temporal queries:
     active relations @ now     : ...
     active relations @ -90d    : ...
     ...
✓ Done in Zs
```

**Day-1 milestone gate:** ≥6 sources scraped, ≥20 entities, ≥50 relations, ≤15s total.

---

## Phase 4 — Pre-cache demo targets (VAN-705)

Run dilly against all 3 demo targets and persist results to Postgres:

```bash
npx tsx scripts/dilly.ts peloton.com
npx tsx scripts/dilly.ts wework.com
npx tsx scripts/dilly.ts klaviyo.com
```

Set `DEMO_MODE=1` in `.env.local` to serve cached results in the UI.

---

## Phase 5 — Landing page (VAN-106)

File: `src/app/page.tsx`

- Search bar with autocomplete (type domain → submit → navigate to `/account/[domain]`)
- 3 demo trail cards (Peloton, WeWork, Klaviyo) with click-to-load
- Sponsor footer with Bright Data logo
- shadcn `Input` + `Button` + `Card`

---

## Phase 6 — API routes

### 6-A  Ingest endpoint: `src/app/api/ingest/[domain]/route.ts`
- POST → triggers `ingestAll` → runs `extract` on each doc → builds graph → `persistGraph`
- Returns `{ status, entityCount, relationCount, elapsedMs }`
- If `DEMO_MODE=1` and domain is a demo target, return cached result immediately

### 6-B  Graph endpoint: `src/app/api/graph/[domain]/route.ts`
- GET `?t=ISO_TIMESTAMP` → `loadGraph(domain)` → `activeRelationsAt(graph, t)`
- Returns `{ nodes, edges }` shaped for React Flow

### 6-C  Diff endpoint: `src/app/api/graph/[domain]/diff/route.ts`
- GET `?t1=...&t2=...` → `diff(graph, t1, t2)`

### 6-D  Risk signals endpoint: `src/app/api/risk/[domain]/route.ts`
- GET → run red-flag detector → return `RiskSignal[]`

### 6-E  Q&A endpoint: `src/app/api/qa/[domain]/route.ts`
- POST `{ question }` → graph traversal → Claude cited answer

### 6-F  Memo endpoint: `src/app/api/memo/[domain]/route.ts`
- GET → synthesize markdown report from graph + risk signals

---

## Phase 7 — Account dashboard UI (VAN-401..405)

File: `src/app/account/[domain]/page.tsx`

Layout regions (left-to-right, top-to-bottom):
1. **Header** — company name, domain, ingest trigger button, last-scraped timestamp
2. **Time slider** (full width) — `shadcn Slider` + event-density bands + play/pause
3. **Main content** (3-col grid):
   - Left: React Flow graph (nodes = entities, edges = relations, color = kind)
   - Center: Red-flag heat map (6 risk dimensions × severity)
   - Right: Signal trajectory sparklines + risk inbox
4. **Bottom panel**: Q&A chat + memo preview

### 7-A  Time slider component (VAN-402) — KILLER FEATURE
File: `src/components/TimeSlider.tsx`
- Full-width range input over 180-day window
- Event-density bands above the track (small bars showing event count per week)
- Play/pause button — auto-advances 1 day per frame at 24fps
- `onChange` fires `onTimeChange(isoTimestamp)` callback
- Triggers re-fetch of `/api/graph/[domain]?t=...`

### 7-B  Graph viz (VAN-403)
File: `src/components/GraphViz.tsx`
- React Flow (`@xyflow/react`)
- Nodes: colored by entity type, opacity 0.3 for inactive entities
- Edges: colored by relation kind
- Re-layout on time change (use `dagre` or `elk` layout)
- Node click → show evidence panel with source URLs

### 7-C  Red-flag heat map (VAN-502)
File: `src/components/RiskHeatmap.tsx`
- 6 × N grid: rows = risk categories (mgmt, culture, financial, legal, market, customer)
- Cells colored by severity (green → yellow → orange → red)
- Click cell → show evidence drawer

### 7-D  Ingestion progress panel (VAN-404)
File: `src/components/IngestProgress.tsx`
- Shows per-source status: pending / scraping / extracting / done / failed
- Streams entity feed as extraction completes (use Server-Sent Events or polling)

---

## Phase 8 — Intelligence layer (VAN-501..505)

### 8-A  Red-flag detector (VAN-501)
File: `src/lib/risk/detector.ts`

Rule-based checks (run over the in-memory graph):
1. ≥2 `departed` relations with `toEntityId = companyId` in last 90 days where `fromEntityId` is a person with `role` containing executive/VP/C-suite → **mgmt** CRITICAL
2. Glassdoor rating Δ < −0.4 stars in 90 days (from `glassdoor_reviews` entity attributes) → **culture** HIGH
3. Open-role count Δ < −25% in 90 days → **market** MEDIUM
4. Any new `litigated_with` relation in 90 days → **legal** HIGH
5. Any `pricing_page` entity with missing tier vs 90 days ago → **financial** MEDIUM
6. Spike in `reviewed_negatively` relations: count > 2× average → **customer** HIGH
7. LLM classifier: send top-10 events to Claude, ask it to emit any risk signals it sees beyond the rules → **any** variable

### 8-B  Q&A route (VAN-503)
File: `src/lib/qa/query.ts`
1. Parse the question → extract company/person/topic entities
2. `traverse(graph, entityId, { maxHops: 3, at: currentTime })` for each extracted entity
3. Collect all evidence strings from traversal paths
4. Prompt Claude: "Answer this question using only the provided evidence. Cite each claim with [sourceUrl]."
5. Return `{ answer, citations: Array<{ sourceUrl, excerpt }> }`

### 8-C  Memo synthesizer (VAN-505)
File: `src/lib/memo/synthesizer.ts`
Prompt Claude with:
- Graph summary (entity counts by type, key events timeline)
- Risk signals (all active signals sorted by severity)
- `diff(graph, -180d, now)` — what changed
- Instructions: produce a 3-section memo: Executive Summary / Risk Narrative / IC Questions

---

## Phase 9 — UI completion (VAN-601..604)

### 9-A  Q&A chat panel (VAN-602)
File: `src/components/QAPanel.tsx`
- Chat input at bottom
- Messages with citation chips: each `[sourceUrl]` renders as a `Badge` that on hover shows excerpt
- Badge click highlights the corresponding graph node

### 9-B  Memo preview + export (VAN-603)
File: `src/components/MemoPanel.tsx`
- Markdown render of memo
- "Export PDF" button → POST `/api/memo/[domain]?format=pdf` → `@react-pdf/renderer`

### 9-C  Red-flag inbox (VAN-601)
File: `src/components/RiskInbox.tsx`
- List of `RiskSignal[]` sorted by severity
- Click → evidence drawer with source URLs + graph node highlight

---

## Phase 10 — Latency optimization (VAN-701..704)

These are only done after all features work. Target: ≤10s end-to-end.

| Stage | Current estimate | Target |
|---|---|---|
| Source fan-out | ~15s | 4s (already parallel in `ingestAll`) |
| Claude extraction | ~20s for 20 docs | 3s (stream docs → extract as they arrive) |
| Graph build | <0.5s | 0.5s |
| Red-flag pass | ~2s | 0.5s |
| Initial render | ~1s | 1s |

Key optimizations:
1. **VAN-703** Streaming extraction: process each doc as it arrives from `ingestAll`, don't wait for all 6 sources
2. **VAN-704** Use Bright Data Datasets for LinkedIn/Glassdoor backfill instead of live scrape (10x faster)
3. **VAN-702** Confirm `ingestAll` fan-out is truly parallel (it is — `Promise.allSettled`)
4. **VAN-701** Add `console.time` around each stage in `dilly.ts` to find the real bottleneck first

---

## Phase 11 — Ship (VAN-801..806)

1. **VAN-801** Final Vercel deploy: `vercel --prod`, set all env vars in Vercel dashboard
2. **VAN-802** Update README with architecture diagram + Bright Data attribution block
3. **VAN-803** Pitch deck (10 slides): problem → solution → demo screenshots → Bright Data integration → team
4. **VAN-804** Record 2-min demo video (screen record + voiceover) — backup in case live demo fails
5. **VAN-805** Rehearse pitch ≥3 times end-to-end
6. **VAN-806** Submit

---

## Cut order if behind schedule

Drop features in this order — never drop the time slider or the cited Q&A:

| Cut | What you lose |
|---|---|
| `VAN-604` PDF export | Screenshot the memo instead |
| `VAN-506` pgvector embeddings | Skip analog pattern query |
| `VAN-206` PACER | Hardcode 1 fixture lawsuit |
| `VAN-205` SEC EDGAR | Hardcode 1 fixture filing |
| `VAN-405` Sparklines | Show numbers in a table |
| `VAN-404` Ingestion progress UI | Show spinner, hide per-source status |

---

## Key things that are wrong / need fixing right now

1. **Model ID** — `extractor.ts:25` says `claude-sonnet-4-5-20250929`. Change to `claude-sonnet-4-6`.
2. **Bright Data endpoints** — `client.ts` uses `${MCP_URL}/serp`, `${MCP_URL}/unlock` etc. These are not real Bright Data API paths. Must be fixed before any scraping works.
3. **No package.json** — the `@/lib/...` path aliases in every `import` are broken. Bootstrap Next.js first.
4. **`persistGraph` is a no-op** — the graph only lives in memory. Nothing survives across requests until VAN-104 is done.
5. **LinkedIn adapter** — uses a guessed URL `linkedin.com/company/{slug}`. Real Bright Data LinkedIn dataset should be used via `brightDataDataset('gd_l1viktl72bvl7bjuj0', { domain: target })`.

---

## Dependency graph (what blocks what)

```
Phase 0 (Bootstrap)
  └─► Phase 1 (Fix client + model)
        └─► Phase 2 (Postgres)
              └─► Phase 3 (dilly CLI works)
                    └─► Phase 4 (Pre-cache 3 targets)
                          └─► Phase 5 (Landing page)
                                └─► Phase 6 (API routes)
                                      ├─► Phase 7 (Dashboard UI)
                                      ├─► Phase 8 (Intelligence)
                                      └─► Phase 9 (UI completion)
                                                └─► Phase 10 (Latency)
                                                      └─► Phase 11 (Ship)
```

---

## Demo script (memorize this)

1. Open `http://localhost:3000` (or Vercel URL)
2. Show search bar — type "peloton.com", hit Enter
3. Ingestion progress panel lights up — "6 sources live-scraped via Bright Data"
4. Graph appears — say: "Every node is an entity, every edge is a timestamped fact"
5. Drag time slider back 90 days — graph mutates, nodes fade, some disappear
6. Hit Play — watch the collapse unfold week by week
7. Click the CRITICAL red flag in the inbox — "Two CFO departures in 18 months"
8. Type "Who left Peloton's leadership team?" in the Q&A — cited answer appears
9. Click "Generate Memo" — download PDF
10. Swap to klaviyo.com — show it works on a healthy company too (positive signals)
