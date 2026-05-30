/**
 * VAN-201..206 — Source adapters.
 *
 * Each adapter takes a target domain + lookback window and returns RawDoc[].
 *
 * ONE PATTERN for all adapters:
 *
 *   export async function fromX(
 *     target: string,
 *     opts: AdapterOpts,
 *   ): Promise<RawDoc[]>
 *
 * Copy `fromSerp` below for the others. Keep them small, no extraction logic
 * lives here — that's the extractor's job.
 */

import {
  RawDoc,
  type RawDoc as RawDocT,
  SourceType,
  nowIso,
  daysAgoIso,
  slugify,
} from '@/lib/schema';
import {
  brightDataSerp,
  brightDataUnlock,
  brightDataBrowserRender,
  brightDataDataset,
  withRetry,
} from './client';
import { isDemoMode, getDemoTarget } from '@/lib/fixtures';

export interface AdapterOpts {
  /** How many days back to look. Default 180. */
  lookbackDays?: number;
  /** Override per-source timeout. */
  timeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────────
//  VAN-201 — SERP adapter (NYT, FT, Business Journals)
// ─────────────────────────────────────────────────────────────────────

const FINANCIAL_DOMAINS = [
  'nytimes.com',
  'ft.com',
  'bizjournals.com',
  'reuters.com',
  'wsj.com',
  'bloomberg.com',
];

export async function fromSerp(
  target: string,
  opts: AdapterOpts = {},
): Promise<RawDocT[]> {
  const domainFilter = FINANCIAL_DOMAINS.map((d) => `site:${d}`).join(' OR ');
  const query = `"${cleanTarget(target)}" (${domainFilter})`;
  const since = `${opts.lookbackDays ?? 180}d`;

  const results = await withRetry(
    () => brightDataSerp(query, { num: 30, since }),
    { timeoutMs: opts.timeoutMs ?? 6_000 },
  );

  return results.map((r) =>
    RawDoc.parse({
      id: slugify(`serp-${r.link}`),
      url: r.link,
      source: 'serp_news' satisfies SourceType,
      title: r.title,
      body: r.snippet,
      publishedAt: r.publishedAt ?? null,
      scrapedAt: nowIso(),
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────
//  VAN-202 — LinkedIn (company + employee departures)
//  TODO: replace with Bright Data LinkedIn dataset id once known.
// ─────────────────────────────────────────────────────────────────────

export async function fromLinkedIn(
  target: string,
  opts: AdapterOpts = {},
): Promise<RawDocT[]> {
  // PATTERN — copy & adapt:
  //  1. Resolve target domain → LinkedIn company URL
  //  2. Use Bright Data Datasets for historical (preferred — fast)
  //  3. Fall back to Scraping Browser for live page
  const companyUrl = `https://linkedin.com/company/${slugify(target)}`;
  const since = daysAgoIso(opts.lookbackDays ?? 180);

  // TODO: swap with real dataset_id
  // const rows = await brightDataDataset('linkedin_company_history', {
  //   domain: target,
  //   since,
  // });

  // Live fallback (slow):
  const rendered = await withRetry(
    () => brightDataBrowserRender(companyUrl, { waitFor: '.company-overview' }),
    { timeoutMs: opts.timeoutMs ?? 10_000 },
  );

  return [
    RawDoc.parse({
      id: slugify(`linkedin-${target}`),
      url: companyUrl,
      source: 'linkedin_company' satisfies SourceType,
      title: `LinkedIn company page — ${target}`,
      body: rendered.html.slice(0, 50_000),
      publishedAt: null,
      scrapedAt: nowIso(),
    }),
  ];
}

// ─────────────────────────────────────────────────────────────────────
//  VAN-203 — Glassdoor reviews + ratings
//  Glassdoor is anti-bot — Web Unlocker required.
// ─────────────────────────────────────────────────────────────────────

export async function fromGlassdoor(
  target: string,
  opts: AdapterOpts = {},
): Promise<RawDocT[]> {
  const url = `https://www.glassdoor.com/Reviews/${slugify(target)}-reviews.htm`;
  const html = await withRetry(() => brightDataUnlock(url), {
    timeoutMs: opts.timeoutMs ?? 12_000,
  });

  return [
    RawDoc.parse({
      id: slugify(`glassdoor-${target}`),
      url,
      source: 'glassdoor_reviews' satisfies SourceType,
      title: `Glassdoor reviews — ${target}`,
      body: html.slice(0, 80_000),
      publishedAt: null,
      scrapedAt: nowIso(),
    }),
  ];
}

// ─────────────────────────────────────────────────────────────────────
//  VAN-204 — Corporate site + pricing page
// ─────────────────────────────────────────────────────────────────────

export async function fromCorporateSite(
  target: string,
  opts: AdapterOpts = {},
): Promise<RawDocT[]> {
  const urls = [
    `https://${target}`,
    `https://${target}/pricing`,
    `https://${target}/about`,
    `https://${target}/news`,
  ];

  const docs: RawDocT[] = [];
  for (const url of urls) {
    try {
      const html = await withRetry(() => brightDataUnlock(url), {
        timeoutMs: opts.timeoutMs ?? 8_000,
        retries: 1,
      });
      docs.push(
        RawDoc.parse({
          id: slugify(`site-${url}`),
          url,
          source: url.includes('/pricing')
            ? ('pricing_page' satisfies SourceType)
            : ('corporate_site' satisfies SourceType),
          title: url,
          body: html.slice(0, 50_000),
          publishedAt: null,
          scrapedAt: nowIso(),
        }),
      );
    } catch {
      // missing page — continue
    }
  }
  return docs;
}

// ─────────────────────────────────────────────────────────────────────
//  VAN-205 — SEC EDGAR
// ─────────────────────────────────────────────────────────────────────

export async function fromSecEdgar(
  target: string,
  opts: AdapterOpts = {},
): Promise<RawDocT[]> {
  // EDGAR full-text search — no auth, no anti-bot issues
  const query = `"${cleanTarget(target)}"`;
  const since = opts.lookbackDays ?? 180;
  const url =
    `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query)}` +
    `&forms=8-K,10-Q,10-K,13D,13G&dateRange=custom&startdt=${daysAgoIso(since).slice(0, 10)}`;

  const res = await withRetry(() => fetch(url), { timeoutMs: opts.timeoutMs ?? 6_000 });
  const data = (await res.json()) as {
    hits?: { hits?: Array<{ _source: { display_names: string[]; file_date: string; adsh: string; form: string } }> };
  };

  return (data.hits?.hits ?? []).map((h) =>
    RawDoc.parse({
      id: slugify(`sec-${h._source.adsh}`),
      url: `https://www.sec.gov/Archives/edgar/data/${h._source.adsh}`,
      source: 'sec_edgar' satisfies SourceType,
      title: `${h._source.form} — ${h._source.display_names?.[0] ?? target}`,
      body: `Filing ${h._source.form} on ${h._source.file_date}`,
      publishedAt: new Date(h._source.file_date).toISOString(),
      scrapedAt: nowIso(),
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────
//  VAN-206 — PACER litigation (via SERP proxy)
// ─────────────────────────────────────────────────────────────────────

export async function fromPacer(
  target: string,
  opts: AdapterOpts = {},
): Promise<RawDocT[]> {
  // PACER itself is paywalled. CourtListener is the free mirror.
  const query = `site:courtlistener.com "${cleanTarget(target)}"`;
  const results = await withRetry(
    () => brightDataSerp(query, { num: 10, since: `${opts.lookbackDays ?? 180}d` }),
    { timeoutMs: opts.timeoutMs ?? 6_000 },
  );

  return results.map((r) =>
    RawDoc.parse({
      id: slugify(`pacer-${r.link}`),
      url: r.link,
      source: 'pacer' satisfies SourceType,
      title: r.title,
      body: r.snippet,
      publishedAt: r.publishedAt ?? null,
      scrapedAt: nowIso(),
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────
//  Orchestrator — VAN-305
// ─────────────────────────────────────────────────────────────────────

/**
 * Fan out to all sources in parallel.
 * Accept partial results — a single source failing should not kill the run.
 */
export async function ingestAll(
  target: string,
  opts: AdapterOpts = {},
): Promise<{ docs: RawDocT[]; errors: Array<{ source: string; error: string }> }> {
  // DEMO_MODE — serve pre-cached fixtures, no external calls.
  if (isDemoMode()) {
    const demo = getDemoTarget(target);
    if (demo) return { docs: demo.docs, errors: [] };
    // demo mode but unknown target — fall through to live adapters
  }

  const adapters: Array<[string, (t: string, o: AdapterOpts) => Promise<RawDocT[]>]> = [
    ['serp', fromSerp],
    ['linkedin', fromLinkedIn],
    ['glassdoor', fromGlassdoor],
    ['corporate', fromCorporateSite],
    ['sec_edgar', fromSecEdgar],
    ['pacer', fromPacer],
  ];

  const results = await Promise.allSettled(adapters.map(([, fn]) => fn(target, opts)));

  const docs: RawDocT[] = [];
  const errors: Array<{ source: string; error: string }> = [];
  results.forEach((r, i) => {
    const [name] = adapters[i];
    if (r.status === 'fulfilled') docs.push(...r.value);
    else errors.push({ source: name, error: String(r.reason) });
  });

  return { docs, errors };
}

// ─────────────────────────────────────────────────────────────────────

function cleanTarget(target: string): string {
  // peloton.com → Peloton
  return target.replace(/\.(com|io|ai|co|net)$/i, '').replace(/[._-]/g, ' ');
}
