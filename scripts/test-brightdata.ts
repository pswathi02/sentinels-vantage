/**
 * Smoke test for Bright Data MCP connectivity.
 * Run:  npx tsx scripts/test-brightdata.ts
 *
 * Confirms credentials work and the SERP API returns results.
 */

import { brightDataSerp } from '@/lib/brightdata/client';

async function main() {
  if (!process.env.BRIGHTDATA_API_TOKEN) {
    console.error('✗ BRIGHTDATA_API_TOKEN is not set in .env.local');
    process.exit(1);
  }

  console.log('→ Bright Data SERP smoke test...');
  const t0 = Date.now();
  const results = await brightDataSerp('"Peloton" CFO departure', { num: 5, since: '90d' });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  console.log(`✓ ${results.length} results in ${elapsed}s\n`);
  for (const r of results.slice(0, 3)) {
    console.log(`  • ${r.title}`);
    console.log(`    ${r.link}`);
    console.log(`    "${r.snippet.slice(0, 100)}..."`);
    console.log('');
  }
}

main().catch((e) => {
  console.error('✗ test failed:', e);
  process.exit(1);
});
