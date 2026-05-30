/**
 * Tiny disk-backed TTL cache. Server-only.
 *
 * Used to memoize expensive live dossiers so a recently-requested target loads
 * instantly instead of re-scraping. Files live in `.cache/` (gitignored). Each
 * entry stores { expiresAt, value }; reads past the TTL are treated as misses.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CACHE_DIR = path.join(process.cwd(), '.cache');

function ensureDir() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function fileFor(key: string): string {
  const safe = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(CACHE_DIR, `${safe}.json`);
}

export function cacheGet<T>(key: string): { value: T; ageMs: number } | null {
  try {
    const raw = fs.readFileSync(fileFor(key), 'utf8');
    const parsed = JSON.parse(raw) as { expiresAt: number; storedAt: number; value: T };
    if (Date.now() > parsed.expiresAt) return null;
    return { value: parsed.value, ageMs: Date.now() - parsed.storedAt };
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  ensureDir();
  const storedAt = Date.now();
  const payload = JSON.stringify({ storedAt, expiresAt: storedAt + ttlMs, value });
  try {
    fs.writeFileSync(fileFor(key), payload, 'utf8');
  } catch {
    /* ignore — cache is best-effort */
  }
}
