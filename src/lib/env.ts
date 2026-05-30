/**
 * Resilient env access.
 *
 * Problem this solves: some shells (and CI/agent harnesses) export keys like
 * `ANTHROPIC_API_KEY=` as an **empty string**. Both Next.js's loader and Node's
 * `--env-file` follow the convention of *not* overriding a variable that is
 * already defined — so an empty exported value silently shadows the real key in
 * `.env.local`, and every Anthropic call fails with "Could not resolve
 * authentication method". The pipeline catches that and you see 0 entities.
 *
 * `env(name)` fixes both halves:
 *   1. It treats an empty/whitespace value as missing.
 *   2. On first use it backfills any missing/empty vars from `.env.local`
 *      (when that file exists — i.e. local dev; in prod the platform env wins).
 */

import fs from 'node:fs';
import path from 'node:path';

let backfilled = false;

function backfillFromEnvLocal(): void {
  if (backfilled) return;
  backfilled = true;

  // Only relevant on the server / in Node. No-op if the file isn't there
  // (e.g. Vercel, where real values come from the platform environment).
  let text: string;
  try {
    text = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  } catch {
    return;
  }

  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue; // comment or blank
    const key = m[1];
    let val = m[2];
    // Strip a trailing inline comment only when the value is unquoted.
    if (!/^["']/.test(val)) val = val.replace(/\s+#.*$/, '');
    // Strip surrounding quotes.
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    val = val.trim();
    if (!val) continue;

    const existing = process.env[key];
    // Fill only when the process value is missing or blank — never clobber a
    // real value the platform set.
    if (existing === undefined || existing.trim() === '') {
      process.env[key] = val;
    }
  }
}

/** Read an env var, treating empty/whitespace as undefined, with .env.local backfill. */
export function env(name: string): string | undefined {
  const direct = process.env[name];
  if (direct && direct.trim() !== '') return direct;
  backfillFromEnvLocal();
  const after = process.env[name];
  return after && after.trim() !== '' ? after : undefined;
}
