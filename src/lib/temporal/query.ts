/**
 * VAN-304 — Temporal query API.
 *
 * The three core operations every UI component depends on:
 *
 *   graphAt(t)              → graph state at time t
 *   diff(t1, t2)            → what changed between two times
 *   trajectory(signal, ...) → time-series for a single signal
 *
 * Keep these as PURE FUNCTIONS over the in-memory graph. No I/O.
 * The slider drags at 60fps — these must be fast.
 */

import type { VantageGraph } from '@/lib/graph/store';
import type { TemporalRelation } from '@/lib/schema';

// ─────────────────────────────────────────────────────────────────────
//  graphAt — the slider's primary operation
// ─────────────────────────────────────────────────────────────────────

/**
 * Returns a *view* of the graph as it was true at time `t`.
 * A relation is "active at t" iff:  validFrom <= t  AND  (validTo == null || t < validTo)
 *
 * Implementation: filter edges; nodes are always present (their absence/presence
 * is encoded by whether any active relation touches them — see `activeNodes`).
 */
export function activeRelationsAt(
  graph: VantageGraph,
  t: string,
): TemporalRelation[] {
  const tMs = Date.parse(t);
  const active: TemporalRelation[] = [];

  graph.forEachEdge((_edge, attrs) => {
    const r = attrs.relation;
    const from = Date.parse(r.validFrom);
    const to = r.validTo ? Date.parse(r.validTo) : Infinity;
    if (from <= tMs && tMs < to) {
      active.push(r);
    }
  });

  return active;
}

/**
 * Entities that have at least one active relation at time t.
 * Used to fade out departed/inactive nodes on the graph viz.
 */
export function activeNodesAt(graph: VantageGraph, t: string): Set<string> {
  const active = new Set<string>();
  for (const r of activeRelationsAt(graph, t)) {
    active.add(r.fromEntityId);
    active.add(r.toEntityId);
  }
  return active;
}

// ─────────────────────────────────────────────────────────────────────
//  diff — what changed between two times
// ─────────────────────────────────────────────────────────────────────

export interface GraphDiff {
  added: TemporalRelation[];      // relations active at t2 but not t1
  removed: TemporalRelation[];    // relations active at t1 but not t2
  unchanged: TemporalRelation[];
}

export function diff(graph: VantageGraph, t1: string, t2: string): GraphDiff {
  const a = new Map(activeRelationsAt(graph, t1).map((r) => [r.id, r]));
  const b = new Map(activeRelationsAt(graph, t2).map((r) => [r.id, r]));

  const added: TemporalRelation[] = [];
  const removed: TemporalRelation[] = [];
  const unchanged: TemporalRelation[] = [];

  for (const [id, r] of b) {
    if (a.has(id)) unchanged.push(r);
    else added.push(r);
  }
  for (const [id, r] of a) {
    if (!b.has(id)) removed.push(r);
  }

  return { added, removed, unchanged };
}

// ─────────────────────────────────────────────────────────────────────
//  trajectory — signal sparklines
// ─────────────────────────────────────────────────────────────────────

export interface TrajectoryPoint {
  t: string;
  value: number;
}

/**
 * Generic trajectory: count of relations of a given `kind` over a time window.
 * Buckets by `bucketDays` (default 7 = weekly).
 *
 * Example:
 *   trajectory(graph, 'departed', '2026-01-01', '2026-05-28', 7)
 *   → weekly count of departures over the window
 */
export function trajectory(
  graph: VantageGraph,
  kind: TemporalRelation['kind'],
  from: string,
  to: string,
  bucketDays = 7,
): TrajectoryPoint[] {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const bucketMs = bucketDays * 24 * 60 * 60 * 1000;

  const buckets = new Map<number, number>();
  graph.forEachEdge((_edge, attrs) => {
    const r = attrs.relation;
    if (r.kind !== kind) return;
    const ts = Date.parse(r.validFrom);
    if (ts < fromMs || ts > toMs) return;
    const bucket = Math.floor((ts - fromMs) / bucketMs);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  });

  const points: TrajectoryPoint[] = [];
  const numBuckets = Math.ceil((toMs - fromMs) / bucketMs);
  for (let i = 0; i < numBuckets; i++) {
    points.push({
      t: new Date(fromMs + i * bucketMs).toISOString(),
      value: buckets.get(i) ?? 0,
    });
  }
  return points;
}

// ─────────────────────────────────────────────────────────────────────
//  Multi-hop traversal — for Q&A
// ─────────────────────────────────────────────────────────────────────

export interface TraversalPath {
  nodes: string[];
  relations: TemporalRelation[];
}

/**
 * BFS multi-hop traversal from a starting entity, time-filtered.
 * Used by the Q&A retriever to find paths between entities.
 */
export function traverse(
  graph: VantageGraph,
  startEntityId: string,
  opts: {
    maxHops?: number;
    at?: string;              // time-filter
    kinds?: TemporalRelation['kind'][];
  } = {},
): TraversalPath[] {
  const maxHops = opts.maxHops ?? 3;
  const allowedKinds = opts.kinds ? new Set(opts.kinds) : null;
  const tMs = opts.at ? Date.parse(opts.at) : Infinity;

  const paths: TraversalPath[] = [];
  const queue: Array<{ nodeId: string; path: TraversalPath }> = [
    { nodeId: startEntityId, path: { nodes: [startEntityId], relations: [] } },
  ];
  const visited = new Set<string>([startEntityId]);

  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!;
    if (path.nodes.length > maxHops) continue;
    if (!graph.hasNode(nodeId)) continue;

    graph.forEachOutEdge(nodeId, (_edge, attrs, _src, target) => {
      const r = attrs.relation;
      if (allowedKinds && !allowedKinds.has(r.kind)) return;
      if (opts.at) {
        const from = Date.parse(r.validFrom);
        const to = r.validTo ? Date.parse(r.validTo) : Infinity;
        if (!(from <= tMs && tMs < to)) return;
      }
      const newPath: TraversalPath = {
        nodes: [...path.nodes, target],
        relations: [...path.relations, r],
      };
      paths.push(newPath);
      if (!visited.has(target) && newPath.nodes.length <= maxHops) {
        visited.add(target);
        queue.push({ nodeId: target, path: newPath });
      }
    });
  }

  return paths;
}
