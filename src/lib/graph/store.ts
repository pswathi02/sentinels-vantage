/**
 * VAN-303 — Graph store.
 *
 * In-memory graphology graph + Postgres write-behind. Why both:
 *   • graphology = fast traversal for live queries (slider drag = many queries/sec)
 *   • Postgres   = persistence across requests, demo pre-cache, multi-target
 *
 * The graph stores ALL relations regardless of validity period. Time-filtering
 * happens at query time in `lib/temporal/query.ts`.
 */

import Graph from 'graphology';
import type {
  Entity,
  TemporalRelation,
  ExtractionResult,
} from '@/lib/schema';

// ─────────────────────────────────────────────────────────────────────
//  In-memory graph
// ─────────────────────────────────────────────────────────────────────

export interface NodeAttributes {
  entity: Entity;
}

export interface EdgeAttributes {
  relation: TemporalRelation;
}

export type VantageGraph = Graph<NodeAttributes, EdgeAttributes>;

export function createGraph(): VantageGraph {
  return new Graph<NodeAttributes, EdgeAttributes>({ multi: true, type: 'directed' });
}

/**
 * Merge an entity into the graph.
 * - If node exists, merge sources + aliases (entity resolution lite)
 * - If new, add it
 *
 * Real entity resolution (VAN-302) does fuzzy matching + LLM dedupe.
 * This is the cheap synchronous merge.
 */
export function upsertEntity(graph: VantageGraph, entity: Entity): void {
  if (graph.hasNode(entity.id)) {
    const existing = graph.getNodeAttribute(entity.id, 'entity');
    graph.setNodeAttribute(entity.id, 'entity', {
      ...existing,
      sources: dedupeSources([...existing.sources, ...entity.sources]),
      aliases: Array.from(new Set([...existing.aliases, ...entity.aliases])),
      attributes: { ...existing.attributes, ...entity.attributes },
    });
  } else {
    graph.addNode(entity.id, { entity });
  }
}

/**
 * Add a temporal relation. Multi-edges allowed — same pair of entities can have
 * many relations over time (departed in 2024, rejoined in 2026, etc.).
 */
export function addRelation(graph: VantageGraph, relation: TemporalRelation): void {
  // Both endpoints must exist; if missing, create a stub
  if (!graph.hasNode(relation.fromEntityId)) {
    graph.addNode(relation.fromEntityId, {
      entity: {
        id: relation.fromEntityId,
        type: 'company',
        name: relation.fromEntityId,
        aliases: [],
        attributes: { stub: true },
        sources: relation.sources,
        observedAt: relation.observedAt,
      },
    });
  }
  if (!graph.hasNode(relation.toEntityId)) {
    graph.addNode(relation.toEntityId, {
      entity: {
        id: relation.toEntityId,
        type: 'company',
        name: relation.toEntityId,
        aliases: [],
        attributes: { stub: true },
        sources: relation.sources,
        observedAt: relation.observedAt,
      },
    });
  }
  graph.addEdgeWithKey(relation.id, relation.fromEntityId, relation.toEntityId, {
    relation,
  });
}

/**
 * Bulk-merge an ExtractionResult into the graph.
 */
export function mergeExtraction(graph: VantageGraph, result: ExtractionResult): void {
  for (const entity of result.entities) upsertEntity(graph, entity);
  for (const relation of result.relations) addRelation(graph, relation);
}

// ─────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────

function dedupeSources<T extends { url: string }>(sources: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of sources) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  Postgres persistence — TODO: VAN-104
// ─────────────────────────────────────────────────────────────────────

/**
 * Write graph state to Postgres. Use upsert semantics — same (target, id)
 * should be idempotent.
 *
 * Schema (see VAN-104):
 *
 *   CREATE TABLE entities (
 *     target_domain TEXT NOT NULL,
 *     id            TEXT NOT NULL,
 *     payload       JSONB NOT NULL,
 *     PRIMARY KEY (target_domain, id)
 *   );
 *
 *   CREATE TABLE relations (
 *     target_domain TEXT NOT NULL,
 *     id            TEXT NOT NULL,
 *     from_id       TEXT NOT NULL,
 *     to_id         TEXT NOT NULL,
 *     kind          TEXT NOT NULL,
 *     valid_from    TIMESTAMPTZ NOT NULL,
 *     valid_to      TIMESTAMPTZ,
 *     observed_at   TIMESTAMPTZ NOT NULL,
 *     payload       JSONB NOT NULL,
 *     PRIMARY KEY (target_domain, id)
 *   );
 *
 *   CREATE INDEX relations_time_idx
 *     ON relations (target_domain, valid_from, valid_to);
 */
export async function persistGraph(
  _targetDomain: string,
  _graph: VantageGraph,
): Promise<void> {
  // TODO: implement once VAN-104 lands the Postgres schema
}

export async function loadGraph(_targetDomain: string): Promise<VantageGraph> {
  // TODO: implement once VAN-104 lands the Postgres schema
  return createGraph();
}
