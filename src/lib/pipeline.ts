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

export interface Dossier {
  target: string;
  companyId: string;
  window: { from: string; to: string };
  entities: Entity[];
  relations: TemporalRelation[];
  events: Event[];
}

const LOOKBACK_DAYS = 180;

/** Build the in-memory graph for a target (used by CLI + tests). */
export async function buildGraph(
  target: string,
): Promise<{ graph: VantageGraph; events: Event[]; errors: Array<{ source: string; error: string }> }> {
  const { docs, errors } = await ingestAll(target, { lookbackDays: LOOKBACK_DAYS });

  const extractions = await Promise.all(
    docs.map((d) => extract(d, target).catch(() => null)),
  );

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
export async function buildDossier(target: string): Promise<Dossier> {
  const { graph, events } = await buildGraph(target);

  const entities: Entity[] = [];
  graph.forEachNode((_id, attrs) => entities.push(attrs.entity));

  const relations: TemporalRelation[] = [];
  graph.forEachEdge((_edge, attrs) => relations.push(attrs.relation));

  return {
    target,
    companyId: pickCompanyId(target, entities, relations),
    window: { from: daysAgoIso(LOOKBACK_DAYS), to: nowIso() },
    entities,
    relations,
    events: dedupeEvents(events),
  };
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
