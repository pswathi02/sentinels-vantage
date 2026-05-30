/**
 * VAN-103 — Bright Data MCP client wrapper.
 *
 * Uses the Bright Data MCP server over SSE for all scraping operations.
 * Each call opens an SSE session, runs one tool call, then closes.
 *
 * Tools available: search_engine, scrape_as_markdown, search_engine_batch, scrape_batch
 *
 * Required env:
 *   BRIGHTDATA_MCP_URL     SSE endpoint, e.g. https://mcp.brightdata.com/sse?token=...
 *   BRIGHTDATA_API_TOKEN   used to fill the token if the URL omits it (or uses the
 *                          YOUR_BRIGHTDATA_API_TOKEN placeholder)
 *
 * The .env.local you drop in can be the full form:
 *   BRIGHTDATA_MCP_URL=https://mcp.brightdata.com/sse?token=YOUR_BRIGHTDATA_API_TOKEN
 * resolveMcpUrl() normalizes it: ensures the /sse path, and substitutes the real
 * token from BRIGHTDATA_API_TOKEN when the placeholder is present or token missing.
 */

import { env } from '@/lib/env';

const TOKEN_PLACEHOLDER = 'YOUR_BRIGHTDATA_API_TOKEN';

/**
 * Build the effective MCP SSE URL from env. Tolerant of:
 *   - base only:            https://mcp.brightdata.com          → adds /sse + token
 *   - missing /sse path:    https://mcp.brightdata.com?token=x  → adds /sse
 *   - placeholder token:    ...?token=YOUR_BRIGHTDATA_API_TOKEN → swaps in real token
 *   - missing token:        https://mcp.brightdata.com/sse      → adds token from env
 *   - fully-formed url:     used as-is
 */
export function resolveMcpUrl(): string {
  const raw = env('BRIGHTDATA_MCP_URL')?.trim() || 'https://mcp.brightdata.com/sse';
  const token = env('BRIGHTDATA_API_TOKEN')?.trim();

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw; // malformed — hand back untouched so the failure is visible
  }

  // Ensure the SSE path.
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/sse';

  // Fill / fix the token query param.
  const current = url.searchParams.get('token');
  if ((!current || current === TOKEN_PLACEHOLDER) && token) {
    url.searchParams.set('token', token);
  }

  return url.toString();
}

const MCP_URL = resolveMcpUrl();
const MCP_BASE = new URL(MCP_URL).origin;

if (process.env.NODE_ENV !== 'test') {
  const hasToken = new URL(MCP_URL).searchParams.get('token');
  if (!hasToken || hasToken === TOKEN_PLACEHOLDER) {
    console.warn(
      '[brightdata] no token resolved for MCP — set BRIGHTDATA_API_TOKEN or include ?token= in BRIGHTDATA_MCP_URL; live calls will fail',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Core MCP SSE transport
// ─────────────────────────────────────────────────────────────────────

async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs = 30_000,
): Promise<unknown> {
  // Meter Bright Data consumption for the usage widget (best-effort, non-blocking).
  import('@/lib/usage').then((m) => m.recordBrightData(1)).catch(() => {});

  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`MCP tool "${toolName}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    (async () => {
      let sseRes: Response;
      try {
        sseRes = await fetch(MCP_URL, {
          headers: { Accept: 'text/event-stream' },
          signal: ctrl.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        reject(e);
        return;
      }

      const reader = sseRes.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let postUrl: string | null = null;
      let started = false;
      let settled = false;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ctrl.abort();
        fn();
      };

      (async () => {
        while (true) {
          let done: boolean, value: Uint8Array | undefined;
          try {
            ({ done, value } = await reader.read());
          } catch {
            break;
          }
          if (done) break;
          buf += dec.decode(value, { stream: true });

          // Split on double-newline (SSE event boundaries)
          const blocks = buf.split('\n\n');
          buf = blocks.pop() ?? '';

          for (const block of blocks) {
            const ev = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
            const da = block.match(/^data:\s*(.+)$/m)?.[1]?.trim();

            if (ev === 'endpoint' && da) {
              postUrl = MCP_BASE + da;
            }

            if (ev === 'message' && da) {
              try {
                const msg = JSON.parse(da) as { id?: number; result?: unknown; error?: unknown };
                if (msg.id === 99) {
                  if (msg.error) {
                    settle(() => reject(new BrightDataError(toolName, 0, JSON.stringify(msg.error))));
                  } else {
                    settle(() => resolve(msg.result));
                  }
                  return;
                }
              } catch {
                // non-JSON notification — ignore
              }
            }
          }

          // Once we have the POST URL, kick off the MCP handshake
          if (postUrl && !started) {
            started = true;
            const url = postUrl;
            (async () => {
              await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0', id: 1, method: 'initialize',
                  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'vantage', version: '0.1' } },
                }),
              });
              await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
              });
              await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0', id: 99, method: 'tools/call',
                  params: { name: toolName, arguments: args },
                }),
              });
            })().catch((e) => settle(() => reject(e)));
          }
        }
        if (!settled) settle(() => reject(new Error('SSE stream ended without response')));
      })().catch((e) => {
        if (e.name !== 'AbortError') settle(() => reject(e));
      });
    })();
  });
}

// ─────────────────────────────────────────────────────────────────────

export interface SerpResult {
  title: string;
  link: string;
  snippet: string;
  publishedAt?: string; // always a valid ISO string when present
}

/**
 * SERP search via Bright Data MCP search_engine tool.
 * Returns Google organic results, filtered to the requested domains if needed.
 */
export async function brightDataSerp(
  query: string,
  opts: { num?: number; since?: string } = {},
): Promise<SerpResult[]> {
  const args: Record<string, unknown> = {
    query,
    engine: 'google',
  };
  // Bright Data search_engine accepts a `num` results hint
  if (opts.num) args.num = opts.num;
  // date restriction: Bright Data supports `tbs` param passthrough
  if (opts.since) args.tbs = `qdr:${opts.since}`;

  const result = await callMcpTool('search_engine', args, 30_000);
  const data = parseToolText(result) as { organic?: Array<{ title: string; link: string; description?: string; snippet?: string; date?: string }> };
  return (data.organic ?? []).map((r) => ({
    title: r.title,
    link: r.link,
    snippet: r.description ?? r.snippet ?? '',
    publishedAt: parseSearchDate(r.date),
  }));
}

/**
 * Web Unlocker / scraper — returns page content as markdown.
 * Use for Glassdoor, LinkedIn company pages, pricing pages.
 */
export async function brightDataUnlock(url: string): Promise<string> {
  const result = await callMcpTool('scrape_as_markdown', { url }, 30_000);
  const text = extractText(result);
  if (!text) throw new BrightDataError('unlock', 0, 'empty response from scrape_as_markdown');
  return text;
}

/**
 * Scraping Browser — uses scrape_as_markdown which handles JS-heavy pages.
 */
export async function brightDataBrowserRender(
  url: string,
  _opts: { waitFor?: string; screenshot?: boolean } = {},
): Promise<{ html: string; screenshotBase64?: string }> {
  const result = await callMcpTool('scrape_as_markdown', { url }, 40_000);
  const html = extractText(result) ?? '';
  return { html };
}

/**
 * Datasets — pre-built historical data.
 * Falls back to direct Bright Data REST API (requires token with dataset access).
 */
export async function brightDataDataset(
  datasetId: string,
  filter: Record<string, unknown>,
): Promise<unknown[]> {
  const TOKEN = env('BRIGHTDATA_API_TOKEN');
  const BASE = 'https://api.brightdata.com/datasets/v3';

  const triggerRes = await fetch(`${BASE}/trigger?dataset_id=${datasetId}&format=json`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([filter]),
  });
  if (!triggerRes.ok) throw new BrightDataError('dataset-trigger', triggerRes.status, await triggerRes.text());
  const { snapshot_id } = (await triggerRes.json()) as { snapshot_id: string };

  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 3_000));
    const pr = await fetch(`${BASE}/progress/${snapshot_id}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!pr.ok) continue;
    const { status } = (await pr.json()) as { status: string };
    if (status === 'ready') break;
  }

  const dlRes = await fetch(`${BASE}/snapshot/${snapshot_id}?format=json`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!dlRes.ok) throw new BrightDataError('dataset-download', dlRes.status, await dlRes.text());
  return dlRes.json() as Promise<unknown[]>;
}

// ─────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Convert SERP date strings to ISO 8601.
 * Bright Data returns dates as "2mo", "3d", "1w", "Mar 15, 2026", or full ISO.
 */
export function parseSearchDate(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  const now = Date.now();

  // Relative: "2mo", "3mo", "1w", "5d", "2h"
  const rel = s.match(/^(\d+)\s*(mo|w|d|h)$/i);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2].toLowerCase();
    const ms = unit === 'mo' ? n * 30 * 86400000
              : unit === 'w'  ? n * 7  * 86400000
              : unit === 'd'  ? n      * 86400000
              :                  n      * 3600000;
    return new Date(now - ms).toISOString();
  }

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.length === 10 ? `${s}T00:00:00.000Z` : s;
  }

  // Human readable: "Mar 15, 2026"
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();

  return undefined;
}

function parseToolText(result: unknown): unknown {
  const text = extractText(result);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractText(result: unknown): string | null {
  if (typeof result === 'string') return result;
  const r = result as { content?: Array<{ type: string; text?: string }> };
  return r?.content?.find((c) => c.type === 'text')?.text ?? null;
}

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
  const timeoutMs = opts.timeoutMs ?? 30_000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      if (attempt === retries) throw err;
      const backoff = 500 * 2 ** attempt;
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
