# Vantage

**Temporal due diligence on the open web.** Type a company domain and Vantage builds a
time-aware knowledge graph from public sources — then lets you drag a slider backwards
through a selectable window (30 / 90 / 180 days, default 30) to watch the company's story
(exec departures, layoffs, lawsuits, sentiment, pricing) rebuild itself in front of you.
Every claim is cited to its real source URL.

Bright Data Hackathon · Track 2 (Finance / Market Intelligence) · Team **Sentinels**.

---

## Quick start (teammates: run this)

You need **Node 20+** and **npm**. No database, no API keys required to run the demo.

```bash
npm install
npm run dev
# open http://localhost:3000  →  click the "spirit.com" card
```

That's it. The app boots in **demo mode** by default and serves hand-authored fixtures
through the *real* pipeline (graph build, temporal queries, risk math, memo) — so what
you see on screen is exactly what live data will produce, just without the network.

### Optional checks

```bash
npm run typecheck        # tsc --noEmit, must be clean
npm run test:schema      # validates the Zod schemas
npm run dilly spirit.com    # runs the pipeline in the terminal (no UI)
```

---

## Pre-cached targets vs. live fetch

Vantage has one code path. The routing decision is **per-target**, keyed on whether a
hand-curated fixture exists — *not* on a global `DEMO_MODE` flag. The UI never changes.

| | Pre-cached target | Typed-in URL |
|---|---|---|
| Examples | `spirit.com`, `wiz.io`, `everlane.com` | any other domain (e.g. `starbucks.com`) |
| Trigger | `getDemoTarget(target)` returns a fixture | no fixture registered |
| Ingest | cached `RawDoc[]` — **always served, never fetched** | Bright Data scrapers → `RawDoc[]` |
| Extract | cached `ExtractionResult` per doc | Claude tool-use → `ExtractionResult` |
| Caching | n/a (already instant) | disk-cached 6h (cache-first), empty runs not cached |
| Everything after | identical | identical |

The contract both sides satisfy:

```
ingestAll(target)        → { docs: RawDoc[], errors }
extract(doc, target)     → ExtractionResult   // entities + temporal relations + events
```

Pre-cached targets always serve their fixtures (with **real source URLs**, so citation
links open the exact article). Any other domain is fetched live and cached. A typed-in
URL with **no `ANTHROPIC_API_KEY`** configured shows a friendly "add your keys" message
instead of an empty dashboard.

> `DEMO_MODE` is now cosmetic — it only toggles the "DEMO MODE" badge in the topbar. The
> data path ignores it.

To enable live fetch for arbitrary domains, set credentials in `.env.local`:

```bash
cp .env.example .env.local
# ANTHROPIC_API_KEY=sk-ant-...
# BRIGHTDATA_API_TOKEN=...
# BRIGHTDATA_MCP_URL=https://mcp.brightdata.com/sse?token=YOUR_BRIGHTDATA_API_TOKEN
npm run dev
```

`resolveMcpUrl()` in `client.ts` normalizes the MCP URL: it adds the `/sse` path and
substitutes `BRIGHTDATA_API_TOKEN` for the `YOUR_BRIGHTDATA_API_TOKEN` placeholder (a bare
`https://mcp.brightdata.com` base also works).

---

## How it works (data flow)

```
domain ─► ingestAll ─► RawDoc[] ─► extract (per doc) ─► ExtractionResult[]
                                                              │
                                          mergeExtraction ─► VantageGraph (graphology)
                                                              │
                                              buildDossier ─► Dossier (plain JSON)
                                                              │
                                        <Dashboard> (client) ─┘
                                  slider scrubs time over plain arrays @ 60fps
```

- **Bitemporal model** (`src/lib/schema.ts`): every fact carries `validFrom` / `validTo`
  / `observedAt` / `sources[]`. That's what powers "what did the graph look like at time
  *t*?" and makes every claim citable.
- **All temporal filtering is client-side** on plain arrays, so the slider stays smooth.
- **Diligence analytics** (`src/lib/diligence.ts`) are pure functions over the dossier:
  the Δ delta report, the cited Q&A, and the memo are all deterministic and reproducible.

---

## File map

| Path | What it is | State |
|---|---|---|
| `src/lib/schema.ts` | Zod schemas (the contract) | ✅ done |
| `src/lib/fixtures/spirit.ts` | Hand-authored Spirit Airlines demo data | ✅ done |
| `src/lib/fixtures/wiz.ts` | Hand-authored Wiz breakout-growth demo data | ✅ done |
| `src/lib/fixtures/everlane.ts` | Hand-authored Everlane mixed-arc demo data | ✅ done |
| `src/lib/fixtures/index.ts` | Demo registry + `isDemoTarget()` / `isDemoMode()` | ✅ done |
| `src/lib/brightdata/sources.ts` | Source adapters + `ingestAll` (fixture branch wired) | ✅ live adapters wired |
| `src/lib/brightdata/client.ts` | Bright Data MCP transport + `resolveMcpUrl()` | ✅ wired (MCP over SSE) |
| `src/lib/extraction/extractor.ts` | Claude extraction (tool-use, fixture branch wired) | ✅ model id current |
| `src/lib/graph/store.ts` | graphology graph + merge | ✅ in-memory (no DB yet) |
| `src/lib/temporal/query.ts` | `activeRelationsAt` / `diff` / `traverse` | ✅ done |
| `src/lib/pipeline.ts` | `buildGraph` / `buildDossier` (fixture-first routing) | ✅ done |
| `src/lib/diligence.ts` | delta / memo / Q&A / analog (pure) | ✅ done |
| `src/lib/cache.ts` | disk cache for live-fetched dossiers (6h TTL) | ✅ done |
| `src/lib/usage.ts` | Anthropic + Bright Data token/call metering | ✅ done |
| `src/app/page.tsx` | Landing + demo cards | ✅ done |
| `src/app/account/[domain]/` | Dashboard (slider, graph, signals, delta, Q&A, memo) | ✅ done |
| `src/app/account/[domain]/loading.tsx` | Route-level VANTA loader during live fetch | ✅ done |
| `src/app/api/usage/route.ts` + `UsageWidget.tsx` | Live usage readout in the topbar | ✅ done |

---

## Live-data bridge (what makes real data flow)

The pre-cached and live paths meet at the adapter seam, and the live side is now **wired**:

1. **Bright Data client** — `src/lib/brightdata/client.ts` talks to the Bright Data **MCP
   server over SSE**. `resolveMcpUrl()` normalizes `BRIGHTDATA_MCP_URL` (adds the `/sse`
   path, substitutes `BRIGHTDATA_API_TOKEN` for the placeholder), and the token rides in the
   URL — no `Authorization` header. `recordBrightData(1)` meters each call at call-start.
2. **Extraction model** — `src/lib/extraction/extractor.ts` uses the current Claude model
   (`claude-sonnet-4-6`) via tool-use, with the `record_extraction` tool schema mirroring
   `ExtractionResult`. Temperature 0 for determinism, retry-on-429 with backoff.
3. **Routing (no longer `DEMO_MODE`-gated)** — the per-target decision is keyed on whether a
   fixture exists: `isDemoTarget(target)` → always serve fixtures; otherwise fetch live and
   disk-cache (cache-first, 6h, empty runs never cached). `DEMO_MODE` is cosmetic.
4. **Parity** — the live and fixture paths return the same `Dossier` shape, so the UI needs
   zero changes between a pre-cached card and a typed-in domain.

Remaining live-data work and history are summarized in `plan.md`.

---

## Adding a new demo target

1. Copy `src/lib/fixtures/spirit.ts` → `acme.ts`, edit the entities/relations/events. Keep
   the `src()` / `evt()` helpers and anchor dates with `daysAgoIso(N)`. Use **real source
   URLs** so each citation opens the exact article.
2. Register it in `src/lib/fixtures/index.ts` (`REGISTRY['acme.com'] = …`). `isDemoTarget`
   then returns true for that domain, so it always serves from the fixture (never fetched).
3. Enable its card in `src/app/page.tsx` (add to `DEMO_TARGETS`).
