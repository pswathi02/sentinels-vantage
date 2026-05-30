# Vantage

**Temporal due diligence on the open web.** Type a company domain and Vantage builds a
time-aware knowledge graph from public sources — then lets you drag a slider backwards
through the last 180 days to watch the company's story (exec departures, layoffs,
lawsuits, sentiment, pricing) rebuild itself in front of you. Every claim is cited.

Bright Data Hackathon · Track 2 (Finance / Market Intelligence) · Team **Sentinels**.

---

## Quick start (teammates: run this)

You need **Node 20+** and **npm**. No database, no API keys required to run the demo.

```bash
npm install
npm run dev
# open http://localhost:3000  →  click the "peloton.com" card
```

That's it. The app boots in **demo mode** by default and serves hand-authored fixtures
through the *real* pipeline (graph build, temporal queries, risk math, memo) — so what
you see on screen is exactly what live data will produce, just without the network.

### Optional checks

```bash
npm run typecheck        # tsc --noEmit, must be clean
npm run test:schema      # validates the Zod schemas
npm run dilly peloton.com   # runs the pipeline in the terminal (no UI)
```

---

## Demo mode vs. live mode

Vantage has one code path. A single seam decides whether data comes from fixtures or the
live web — the UI never changes.

| | Demo mode (default) | Live mode |
|---|---|---|
| Trigger | no `ANTHROPIC_API_KEY`, **or** `DEMO_MODE=1` | `ANTHROPIC_API_KEY` set and `DEMO_MODE` not `1` |
| Ingest | `getDemoTarget()` returns cached `RawDoc[]` | Bright Data scrapers → `RawDoc[]` |
| Extract | cached `ExtractionResult` per doc | Claude tool-use → `ExtractionResult` |
| Everything after | identical | identical |

The contract both sides satisfy:

```
ingestAll(target)        → { docs: RawDoc[], errors }
extract(doc, target)     → ExtractionResult   // entities + temporal relations + events
```

Live data "just flows" the moment those two functions return real results instead of
fixtures. See the **Live-data bridge** section below for what's left to wire.

To use live mode locally:

```bash
cp .env.example .env.local
# fill ANTHROPIC_API_KEY (and BRIGHTDATA_API_TOKEN once the client is wired)
DEMO_MODE=0 npm run dev
```

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
| `src/lib/fixtures/peloton.ts` | Hand-authored Peloton-collapse demo data | ✅ done |
| `src/lib/fixtures/index.ts` | Demo registry + `isDemoMode()` | ✅ done |
| `src/lib/brightdata/sources.ts` | Source adapters + `ingestAll` (demo branch wired) | 🟡 live calls stubbed |
| `src/lib/brightdata/client.ts` | Bright Data transport | 🟡 endpoints are placeholders |
| `src/lib/extraction/extractor.ts` | Claude extraction (demo branch wired) | 🟡 model id + prompt to finalize |
| `src/lib/graph/store.ts` | graphology graph + merge | ✅ in-memory (no DB yet) |
| `src/lib/temporal/query.ts` | `activeRelationsAt` / `diff` / `traverse` | ✅ done |
| `src/lib/pipeline.ts` | `buildGraph` / `buildDossier` | ✅ done |
| `src/lib/diligence.ts` | delta / memo / Q&A / analog (pure) | ✅ done |
| `src/app/page.tsx` | Landing + demo cards | ✅ done |
| `src/app/account/[domain]/` | Dashboard (slider, graph, signals, delta, Q&A, memo) | ✅ done |

---

## Live-data bridge (what makes real data flow)

The demo and live paths meet at the adapter seam. To switch Peloton (or any new target)
from fixtures to live:

1. **Bright Data client** — `src/lib/brightdata/client.ts` currently posts to placeholder
   paths (`${MCP_URL}/serp`, `/unlock`). Replace with real Bright Data endpoints (SERP API,
   Web Unlocker proxy, Scraping Browser CDP, Datasets v3).
2. **Extraction model** — `src/lib/extraction/extractor.ts` uses a stale model id; point it
   at the current Claude model and confirm the tool-use schema matches `ExtractionResult`.
3. **`DEMO_MODE` precedence** — make it explicit: `DEMO_MODE=1` → always demo, `DEMO_MODE=0`
   → always live, unset → demo only if a fixture exists for the target.
4. **Parity test** — run one target live and diff the dossier shape against the fixture to
   confirm the UI needs zero changes.

These are tracked as tasks in the session and summarized in `plan.md`.

---

## Adding a new demo target

1. Copy `src/lib/fixtures/peloton.ts` → `wework.ts`, edit the entities/relations/events.
2. Register it in `src/lib/fixtures/index.ts` (`REGISTRY['wework.com'] = …`).
3. Enable its card in `src/app/page.tsx`.
