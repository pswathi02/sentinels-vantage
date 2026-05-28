/**
 * VAN-306 — End-to-end pipeline orchestration, CLI entry point.
 *
 * Usage:  npx tsx scripts/dilly.ts peloton.com
 *
 * This is the Day-1 milestone: terminal proves the pipeline works end-to-end
 * before any UI is wired up. Once this prints sensible output, you're 50% done.
 */

import { ingestAll } from '@/lib/brightdata/sources';
import { extract } from '@/lib/extraction/extractor';
import { createGraph, mergeExtraction } from '@/lib/graph/store';
import { activeRelationsAt, diff, trajectory } from '@/lib/temporal/query';
import { daysAgoIso, nowIso } from '@/lib/schema';

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: tsx scripts/dilly.ts <domain>');
    process.exit(1);
  }

  const t0 = Date.now();
  console.log(`\n◆ Vantage diligence on ${target}\n`);

  // 1. Ingest
  console.log('[1/4] Fanning out across Bright Data sources...');
  const { docs, errors } = await ingestAll(target, { lookbackDays: 180 });
  console.log(`     ✓ ${docs.length} docs collected (${errors.length} source errors)`);
  for (const e of errors) console.log(`       ✗ ${e.source}: ${e.error.slice(0, 80)}`);

  // 2. Extract
  console.log('[2/4] Extracting entities + temporal relations with Claude...');
  const extractions = await Promise.all(
    docs.map((d) =>
      extract(d, target).catch((e) => {
        console.log(`       ✗ extract failed for ${d.url}: ${String(e).slice(0, 80)}`);
        return null;
      }),
    ),
  );

  // 3. Graph build
  console.log('[3/4] Building temporal knowledge graph...');
  const graph = createGraph();
  for (const ex of extractions) {
    if (ex) mergeExtraction(graph, ex);
  }
  console.log(`     ✓ ${graph.order} entities, ${graph.size} relations`);

  // 4. Temporal queries — proves the time-cursor works
  console.log('[4/4] Temporal queries:');
  const now = nowIso();
  const ninetyDaysAgo = daysAgoIso(90);

  const activeNow = activeRelationsAt(graph, now);
  const activeThen = activeRelationsAt(graph, ninetyDaysAgo);
  console.log(`     active relations @ now     : ${activeNow.length}`);
  console.log(`     active relations @ -90d    : ${activeThen.length}`);

  const d = diff(graph, ninetyDaysAgo, now);
  console.log(`     Δ added in last 90d        : ${d.added.length}`);
  console.log(`     Δ removed in last 90d      : ${d.removed.length}`);

  const departures = trajectory(graph, 'departed', daysAgoIso(180), now, 14);
  console.log(`     biweekly departure trajectory: ${departures.map((p) => p.value).join(' ')}`);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ Done in ${elapsed}s\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
