/**
 * VAN-103 — Bright Data MCP client wrapper.
 *
 * Thin wrapper around Bright Data's APIs. Use this everywhere instead of
 * raw fetches so we can swap implementations (e.g., MCP server vs direct API)
 * without touching the source adapters.
 *
 * Docs:
 *   • MCP server: https://github.com/brightdata/brightdata-mcp
 *   • Direct API: https://docs.brightdata.com/
 *
 * Required env:
 *   BRIGHTDATA_API_TOKEN
 *   BRIGHTDATA_MCP_URL
 *   BRIGHTDATA_UNLOCKER_ZONE
 *   BRIGHTDATA_SERP_ZONE
 */

const TOKEN = process.env.BRIGHTDATA_API_TOKEN;
const MCP_URL = process.env.BRIGHTDATA_MCP_URL ?? 'https://mcp.brightdata.com';
const UNLOCKER_ZONE = process.env.BRIGHTDATA_UNLOCKER_ZONE ?? 'web_unlocker1';
const SERP_ZONE = process.env.BRIGHTDATA_SERP_ZONE ?? 'serp_api1';

if (!TOKEN && process.env.NODE_ENV !== 'test') {
  console.warn('[brightdata] BRIGHTDATA_API_TOKEN not set — calls will fail');
}

// ─────────────────────────────────────────────────────────────────────

export interface SerpResult {
  title: string;
  link: string;
  snippet: string;
  publishedAt?: string;
}

/**
 * SERP search — returns Google-style results.
 * Use for news (NYT, FT, BizJournals), filings (PACER), lawsuits.
 *
 * @example
 *   await brightDataSerp('"Peloton" CFO departure', { num: 20, since: '180d' })
 */
export async function brightDataSerp(
  query: string,
  opts: { num?: number; since?: string } = {},
): Promise<SerpResult[]> {
  const params = new URLSearchParams({
    q: query,
    num: String(opts.num ?? 20),
  });
  if (opts.since) params.set('tbs', `qdr:${opts.since}`);

  const res = await fetch(`${MCP_URL}/serp?${params}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    throw new BrightDataError('serp', res.status, await res.text());
  }
  const data = (await res.json()) as { organic?: SerpResult[] };
  return data.organic ?? [];
}

/**
 * Web Unlocker — bypasses anti-bot defenses for stubborn pages.
 * Use for Glassdoor, LinkedIn company pages, pricing pages.
 */
export async function brightDataUnlock(url: string): Promise<string> {
  const res = await fetch(`${MCP_URL}/unlock`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, zone: UNLOCKER_ZONE, format: 'raw' }),
  });
  if (!res.ok) {
    throw new BrightDataError('unlock', res.status, await res.text());
  }
  return res.text();
}

/**
 * Scraping Browser — full headless browser for JS-heavy pages.
 * Returns rendered HTML. Slower but handles SPAs.
 */
export async function brightDataBrowserRender(
  url: string,
  opts: { waitFor?: string; screenshot?: boolean } = {},
): Promise<{ html: string; screenshotBase64?: string }> {
  const res = await fetch(`${MCP_URL}/browser/render`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, ...opts }),
  });
  if (!res.ok) {
    throw new BrightDataError('browser', res.status, await res.text());
  }
  return res.json();
}

/**
 * Datasets — pre-built historical data for LinkedIn, Glassdoor, Crunchbase, etc.
 * THIS IS THE LATENCY KILLER — use this for the 90-day backfill instead of
 * scraping live. Saves us 30+ seconds per target.
 *
 * Common dataset_ids (verify against Bright Data console):
 *   • LinkedIn company history
 *   • Glassdoor reviews history
 *   • Crunchbase company snapshot
 *   • Indeed job postings history
 */
export async function brightDataDataset(
  datasetId: string,
  filter: Record<string, unknown>,
): Promise<unknown[]> {
  const res = await fetch(`${MCP_URL}/datasets/${datasetId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(filter),
  });
  if (!res.ok) {
    throw new BrightDataError('dataset', res.status, await res.text());
  }
  const data = (await res.json()) as { rows?: unknown[] };
  return data.rows ?? [];
}

// ─────────────────────────────────────────────────────────────────────
//  Errors + retry helper
// ─────────────────────────────────────────────────────────────────────

export class BrightDataError extends Error {
  constructor(
    public op: string,
    public status: number,
    public body: string,
  ) {
    super(`brightdata ${op} failed (${status}): ${body.slice(0, 200)}`);
  }
}

/** Wrap any Bright Data call with retries + per-source timeout. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 8_000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      if (attempt === retries) throw err;
      const backoff = 250 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw new Error('unreachable');
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ]);
}
