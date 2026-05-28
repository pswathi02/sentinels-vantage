# Vantage — Sentinels Hackathon Submission

> **Time-travel for the open web.**
> *Drag the slider. See what changed. Catch what others missed.*

**Track:** Bright Data Hackathon · Track 2 — Finance & Market Intelligence
**Team size:** 3 · **Build window:** 2 days (≈10–18 hours/day)
**Latency target:** end-to-end ingest → render in ≤10 seconds

---

## The main idea

Vantage is a **temporal knowledge graph of the open web for any company**.

PE associates, IB analysts, hedge-fund researchers, and corporate-development teams spend 40+ hours per target doing preliminary due diligence — manually pulling LinkedIn, Glassdoor, news, filings, pricing pages, lawsuits — then writing memos. Existing AI tools (Hebbia, Rogo, AlphaSense) operate on **internal data rooms and already-timestamped filings**. **Nobody treats the open web as a queryable, structured, time-aware database.**

Vantage does exactly that. We use Bright Data to continuously capture multi-source web signals about a target company, structure each fact with bitemporal metadata (`observed_at`, `valid_from`, `valid_to`, `source_url`), and surface the result as a draggable time-slider over an animated knowledge graph. Drag back 90 days, watch execs reappear, watch Glassdoor stars climb back, watch hiring expand. Drag forward, watch the collapse unfold as an animation.

### Why Bright Data is essential
- **Continuous bypass at scale** — residential proxies + Web Unlocker maintain uninterrupted coverage on Glassdoor, LinkedIn, G2 (DIY scrapers die within days)
- **Datasets for historical depth** — pre-built LinkedIn / Glassdoor / Crunchbase history lets us backfill 90 days on Day 1 without waiting
- **Multi-source breadth via MCP** — one orchestration interface across SERP, Web Scraper, Unlocker, Scraping Browser, and Datasets
- **Without Bright Data, this product collapses to a static snapshot**

### Core sources
Glassdoor · LinkedIn (company + employee departures) · Corporate website + pricing page · NYT / Financial Times / Business Journals (SERP) · SEC EDGAR (8-K, 10-Q, 13D) · PACER litigation

### Functional requirements
- Landing page with company search
- Multi-source ingestion across the 6 source families above
- Temporal knowledge graph with a time slider
- Red-flag detection + heat map across 6 risk dimensions
- Q&A with citations that highlight the relevant graph nodes
- Summary diligence memo (Markdown + PDF export)

### Non-functional requirements
- End-to-end latency: target ≤10 seconds (push from baseline ~60s)
- Demo runs deterministically on 3 pre-cached targets (Peloton, WeWork, Klaviyo)
- Cited every claim — no uncited assertions in any output

### Killer demo moments
1. **Time-slider drag** — the graph mutates as you scrub through 180 days
2. **Animated replay** — hit play, watch a company's collapse unfold week by week
3. **Cited Q&A** — every span links back to the scraped source URL
4. **Auto-generated memo** — exportable PDF with timeline, risk narrative, IC questions

---

# Sequential task list — pick the next available

> Top-down. When you start a task, mark it `[in progress]`. When you finish, mark `[done]` and move down. If your next task is blocked, skip and come back to it.
>
> ⚠️ = blocks other work, prioritize
> ⭐ = killer demo feature, over-invest

## Phase 0 — Kickoff (0:00 → 0:30)

- [ ] `VAN-000` Read this doc together, confirm latency target and demo targets
- [ ] `VAN-001` Share creds — Anthropic API key, Bright Data token, Postgres URL
- [ ] `VAN-002` Create GitHub repo, set up shared Linear/Jira/Trello board

## Phase 1 — Foundation (0:30 → 4:00)

- [ ] `VAN-101` ⚠️ Bootstrap Next.js + TypeScript + Tailwind + shadcn (1h)
- [ ] `VAN-102` ⚠️ Define Zod schemas: `Entity`, `TemporalRelation`, `Event`, `RiskSignal`, `Source` (1.5h) — **unblocks everyone**
- [ ] `VAN-103` Bright Data MCP client wrapper + smoke test (1h)
- [ ] `VAN-104` Postgres bitemporal schema migration — `entities`, `relations`, `sources`, `documents` (2h)
- [ ] `VAN-105` Vercel hello-world deploy (proof of life, 1h)
- [ ] `VAN-106` Landing page — search bar + 3 demo trail cards + sponsor footer (2h)

## Phase 2 — Source adapters (4:00 → 8:00)

Each adapter takes a domain + lookback window, returns `RawDoc[]`.

- [ ] `VAN-201` Source adapter — **SERP** (NYT, FT, Business Journals, last 180d) (2h)
- [ ] `VAN-202` Source adapter — **LinkedIn** company page + employee departures (2h)
- [ ] `VAN-203` Source adapter — **Glassdoor** reviews + ratings trajectory (2h)
- [ ] `VAN-204` Source adapter — **Corporate website + pricing page** via Web Unlocker (1.5h)
- [ ] `VAN-205` Source adapter — **SEC EDGAR** filings (8-K, 10-Q, 13D) (2h)
- [ ] `VAN-206` Source adapter — **PACER** litigation via SERP proxy + RSS (2h)
- [ ] `VAN-207` Document normalizer — unify to `RawDoc { url, title, body, publishedAt, source }` (1h)
- [ ] `VAN-208` Persist raw documents + scrape metadata in Postgres (1.5h)

## Phase 3 — Extraction & graph (8:00 → 12:00)

- [ ] `VAN-301` Claude structured extraction — `RawDoc` → entities + temporal relations w/ JSON schema (3h)
- [ ] `VAN-302` Entity resolution — name normalization + LLM dedupe pass (2h)
- [ ] `VAN-303` Graph store — `graphology` in-memory + Postgres sync, bitemporal indexing (2.5h)
- [ ] `VAN-304` Temporal query API — `graphAt(t)`, `diff(t1, t2)`, `trajectory(signal, t1, t2)` (3h)
- [ ] `VAN-305` Parallel orchestrator — fan-out sources, retries, per-source timeouts (2h)
- [ ] `VAN-306` End-to-end pipeline integration — `ingest → extract → resolve → graph` (2h)
- [ ] `VAN-307` Bright Data **Datasets** backfill — pull historical LinkedIn/Glassdoor (2h)

### ✅ End-of-Day-1 milestone (DoD)
```bash
$ bun run dilly peloton.com
✓ 6 sources scraped
✓ 47 entities, 134 timestamped relations
✓ Graph queryable @ any timestamp in last 180 days
```
And: `http://localhost:3000/account/peloton.com` renders.

## Phase 4 — UI core (12:00 → 18:00)

- [ ] `VAN-401` Account dashboard layout — graph + heat map + signal trajectories + flags regions (3h)
- [ ] `VAN-402` ⭐ **Time slider component** — full-width, event-density bands, play/pause/scrub (4h)
- [ ] `VAN-403` Graph viz with React Flow — mutates on slider drag (3h)
- [ ] `VAN-404` Ingestion progress UI — live source-status panel, streaming entity feed (2.5h)
- [ ] `VAN-405` Signal trajectory sparklines (1.5h)

## Phase 5 — Intelligence layer (Day 2: 0:00 → 6:00)

- [ ] `VAN-501` Red-flag detector — 6 rule-based + 1 LLM classifier (3h)
  - Rules: ≥2 senior exec departures in 90d · Glassdoor Δ < -0.4★ · open roles Δ < -25% · new lawsuit · pricing tier removed · customer-churn keyword spike
- [ ] `VAN-502` Heat-map severity scoring — 6 dimensions × severity (1.5h)
- [ ] `VAN-503` Q&A route — question → retrieval plan → graph traversal → cited answer (4h)
- [ ] `VAN-504` Citation chip API — every span returns `{ sourceUrl, excerpt, scrapedAt }` (1h)
- [ ] `VAN-505` Memo synthesizer — graph + delta → Markdown report w/ timeline, risks, IC questions (3h)
- [ ] `VAN-506` pgvector embeddings for entity summaries (1.5h, stretch)

## Phase 6 — UI completion (Day 2: 6:00 → 10:00)

- [ ] `VAN-601` Red-flag inbox + click-through evidence panel (2h)
- [ ] `VAN-602` Q&A chat panel with citation chips that highlight graph nodes (2.5h)
- [ ] `VAN-603` Memo preview + export button (1.5h)
- [ ] `VAN-604` Markdown → PDF via `@react-pdf/renderer` (1.5h)

## Phase 7 — Latency optimization (Day 2: 10:00 → 13:00)

- [ ] `VAN-701` Latency profiling — instrument every stage, find top-3 hot spots (1h)
- [ ] `VAN-702` Parallel source fan-out (target 4s ceiling) (1.5h)
- [ ] `VAN-703` Streaming extraction — process docs as they arrive, not in batch (2h)
- [ ] `VAN-704` Bright Data Datasets for fast historical backfill (skip live scrape) (1.5h)
- [ ] `VAN-705` Pre-cache 3 demo targets (Peloton, WeWork, Klaviyo) for instant load (1h)

### Latency budget contract
| Stage | Budget |
|---|---|
| Source fan-out | 4.0s |
| Extraction (streaming) | 3.0s |
| Resolution + graph build | 1.5s |
| Red-flag pass | 0.5s |
| Initial render | 1.0s |
| **Total p95** | **10.0s** |

## Phase 8 — Ship (Day 2: 13:00 → end)

- [ ] `VAN-801` Final Vercel deploy w/ production env vars + smoke test (1h)
- [ ] `VAN-802` README with architecture diagram + Bright Data attribution (1h)
- [ ] `VAN-803` Pitch deck — 10 slides (2h)
- [ ] `VAN-804` Record 2-minute demo video as backup (1h)
- [ ] `VAN-805` Rehearse pitch end-to-end ≥3 times (1h)
- [ ] `VAN-806` Submit

---

## ⛔ Cut order if behind

Drop in this exact order:
1. `VAN-604` PDF export → screenshot the memo
2. `VAN-506` Embeddings → skip analog query feature
3. `VAN-206` PACER → hardcode 1 lawsuit in fixture
4. `VAN-205` SEC EDGAR → hardcode 1 filing in fixture
5. `VAN-405` Sparklines → show numbers in a table
6. `VAN-404` Ingestion progress UI → cut to pre-cached load

## ⭐ Build order if ahead

1. `VAN-506` Embeddings + **analog pattern query** ("show me companies whose 90d signal pattern matches Peloton's pre-crash pattern") — the unicorn feature
2. Scheduled re-scrape — "watch this company"
3. Slack/email memo delivery

---

## Architecture (one-glance)

```
Bright Data MCP ─┬─ SERP (NYT, FT, BizJournals)
                 ├─ Web Scraper (LinkedIn, jobs)
                 ├─ Web Unlocker (Glassdoor, pricing)
                 ├─ Scraping Browser (corp site)
                 └─ Datasets (LinkedIn/Glassdoor history backfill)
                          │
                          ▼
                 Claude structured extraction
                 (Zod schemas, JSON output)
                          │
                          ▼
                 Bitemporal graph store
                 (graphology + Postgres + pgvector)
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   Time-cursor       Red-flag           Q&A retrieval
   query API         detector           (graph + vector)
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
                 Next.js UI
                 (Time slider · React Flow graph ·
                  Heat map · Chat · Memo export)
```

---

## Stack

- **Frontend:** Next.js 15 (App Router) · TypeScript · Tailwind · shadcn/ui · React Flow (`@xyflow/react`)
- **Backend:** Next.js API routes · Bun runtime
- **Scraping:** Bright Data MCP Server (SERP API, Web Scraper API, Web Unlocker, Scraping Browser, Datasets)
- **LLM:** Anthropic Claude Sonnet 4.6 (structured outputs)
- **Graph:** `graphology` in-memory + Postgres bitemporal persistence
- **Vector:** `pgvector` on Vercel Postgres
- **PDF export:** `@react-pdf/renderer`
- **Deploy:** Vercel

---

## Demo targets

| Target | Why it's a great demo |
|---|---|
| **peloton.com** | Public 2022–2024 collapse — CFO churn, Glassdoor crash, layoffs, lawsuits — rich, undeniable signal |
| **wework.com** | Classic pre-bankruptcy unraveling |
| **klaviyo.com** | Positive ramp pre-IPO — proves the tool isn't doom-only |

---

## Pitch one-liner

> **Vantage — the temporal layer for the open web. Powered by Bright Data's continuous capture. Diligence that gives you hindsight before the deal.**
