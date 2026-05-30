/**
 * Reusable end-to-end pipeline + a serializable "dossier" payload for the UI.
 *
 * buildDossier(target) runs ingest → extract → graph-merge and returns plain
 * JSON (entities, relations, events, time window) that a server component can
 * hand straight to a client component. All temporal filtering happens
 * client-side on these plain arrays so the slider stays at 60fps.
 */

import { ingestAll } from '@/lib/brightdata/sources';
import { extract } from '@/lib/extraction/extractor';
import { createGraph, mergeExtraction, type VantageGraph } from '@/lib/graph/store';
import {
  type Entity,
  type TemporalRelation,
  type Event,
  daysAgoIso,
  nowIso,
  slugify,
} from '@/lib/schema';
import { isDemoTarget } from '@/lib/fixtures';
import { cacheGet, cacheSet } from '@/lib/cache';

export interface Dossier {
  target: string;
  companyId: string;
  window: { from: string; to: string };
  entities: Entity[];
  relations: TemporalRelation[];
  events: Event[];
}

/** Default lookback window. Kept short so live runs pull less data + finish faster. */
export const DEFAULT_LOOKBACK_DAYS = 30;
/** How long a built dossier stays warm in the disk cache. */
const DOSSIER_TTL_MS = 6 * 60 * 60 * 1000; // 6h

/** Build the in-memory graph for a target (used by CLI + tests). */
const MAX_DOCS = 15;
const EXTRACT_CONCURRENCY = 2;

// Source priority for trimming — news > legal > corporate > SEC bulk filings
const SOURCE_PRIORITY: Record<string, number> = {
  serp_news: 10, pacer: 8, linkedin_company: 7, linkedin_employee: 7,
  glassdoor_reviews: 6, corporate_site: 5, pricing_page: 5, sec_edgar: 3, dataset_backfill: 2,
};

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  concurrency: number,
): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

export async function buildGraph(
  target: string,
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
): Promise<{ graph: VantageGraph; events: Event[]; errors: Array<{ source: string; error: string }> }> {
  const { docs: allDocs, errors } = await ingestAll(target, { lookbackDays });

  // Cap total docs — prioritise news and legal, trim SEC filings
  const docs = [...allDocs]
    .sort((a, b) => (SOURCE_PRIORITY[b.source] ?? 0) - (SOURCE_PRIORITY[a.source] ?? 0))
    .slice(0, MAX_DOCS);

  const extractions: (Awaited<ReturnType<typeof extract>> | null)[] = new Array(docs.length).fill(null);
  let extractFailures = 0;
  let lastError: unknown = null;
  await runWithConcurrency(docs, async (d) => {
    const i = docs.indexOf(d);
    extractions[i] = await extract(d, target).catch((err) => {
      extractFailures += 1;
      lastError = err;
      return null;
    });
  }, EXTRACT_CONCURRENCY);

  // If every extraction failed, the dashboard would silently show 0 entities.
  // Surface the underlying reason in the server log so it's diagnosable.
  if (docs.length > 0 && extractFailures === docs.length) {
    console.error(
      `[pipeline] all ${docs.length} extractions failed for "${target}" — ` +
        `${String((lastError as Error)?.message ?? lastError)}`,
    );
  }

  const graph = createGraph();
  const events: Event[] = [];
  for (const ex of extractions) {
    if (!ex) continue;
    mergeExtraction(graph, ex);
    events.push(...ex.events);
  }

  return { graph, events, errors };
}

/** Build the serializable dossier a route/component consumes. */
export async function buildDossier(
  target: string,
  opts: { lookbackDays?: number } = {},
): Promise<Dossier> {
  const lookbackDays = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;

  // Registered demo targets are already instant (served from fixtures), so we
  // never disk-cache them. Typed-in URLs are fetched live and cached: a recently
  // requested (target, window) pair is served from disk instead of re-scraping.
  const cacheKey = `dossier:${target.toLowerCase()}:${lookbackDays}`;
  const fetched = !isDemoTarget(target);
  if (fetched) {
    const hit = cacheGet<Dossier>(cacheKey);
    // Treat a 0-entity cache entry as a miss so a stale/poisoned empty result
    // (e.g. written by an older build, or a transient extraction failure) can
    // self-heal on the next request instead of being served forever.
    if (hit && hit.value.entities.length > 0) return hit.value;
  }

  const { graph, events } = await buildGraph(target, lookbackDays);

  const entities: Entity[] = [];
  graph.forEachNode((_id, attrs) => entities.push(attrs.entity));

  const relations: TemporalRelation[] = [];
  graph.forEachEdge((_edge, attrs) => relations.push(attrs.relation));

  const dossier: Dossier = {
    target,
    companyId: pickCompanyId(target, entities, relations),
    window: { from: daysAgoIso(lookbackDays), to: nowIso() },
    entities,
    relations,
    events: dedupeEvents(events),
  };

  // Only cache successful fetches — never cache an empty/failed run, so a retry
  // can still succeed.
  if (fetched && dossier.entities.length > 0) cacheSet(cacheKey, dossier, DOSSIER_TTL_MS);
  return dossier;
}

/**
 * The company node is the hub of the graph. The entity id won't equal
 * slugify(domain) (e.g. "peloton.com" → entity "peloton-interactive"), so
 * pick the most-connected company-type entity. Falls back to the domain slug.
 */
function pickCompanyId(
  target: string,
  entities: Entity[],
  relations: TemporalRelation[],
): string {
  const degree = new Map<string, number>();
  for (const r of relations) {
    degree.set(r.fromEntityId, (degree.get(r.fromEntityId) ?? 0) + 1);
    degree.set(r.toEntityId, (degree.get(r.toEntityId) ?? 0) + 1);
  }
  const companies = entities
    .filter((e) => e.type === 'company')
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
  return companies[0]?.id ?? slugify(deriveCompanyName(target));
}

function deriveCompanyName(target: string): string {
  return target.replace(/\.(com|io|ai|co|net)$/i, '').replace(/[._-]/g, ' ');
}

function dedupeEvents(events: Event[]): Event[] {
  const seen = new Set<string>();
  const out: Event[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}
