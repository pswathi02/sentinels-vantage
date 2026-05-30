/**
 * Best-effort API-usage meter. Server-only.
 *
 * Anthropic and Bright Data don't expose a simple "credits remaining" GET, so
 * instead of guessing we count exactly what *this app* consumes (token + request
 * counts from the live pipeline) and persist it to `.cache/usage.json` so it
 * survives dev-server restarts. If you set a budget env var, we show how much of
 * that budget is left; otherwise we show consumption + a deep link to the real
 * console for the exact figure.
 *
 *   ANTHROPIC_TOKEN_BUDGET     total tokens you want to allow this session
 *   BRIGHTDATA_REQUEST_BUDGET  total Bright Data requests you want to allow
 */

import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), '.cache', 'usage.json');

export interface UsageState {
  anthropic: { requests: number; inputTokens: number; outputTokens: number };
  brightdata: { requests: number };
  since: string;
}

function blank(): UsageState {
  return {
    anthropic: { requests: 0, inputTokens: 0, outputTokens: 0 },
    brightdata: { requests: 0 },
    since: new Date().toISOString(),
  };
}

function read(): UsageState {
  try {
    return { ...blank(), ...(JSON.parse(fs.readFileSync(FILE, 'utf8')) as UsageState) };
  } catch {
    return blank();
  }
}

function write(state: UsageState): void {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state), 'utf8');
  } catch {
    /* best-effort */
  }
}

export function recordAnthropic(inputTokens: number, outputTokens: number): void {
  const s = read();
  s.anthropic.requests += 1;
  s.anthropic.inputTokens += inputTokens || 0;
  s.anthropic.outputTokens += outputTokens || 0;
  write(s);
}

export function recordBrightData(requests = 1): void {
  const s = read();
  s.brightdata.requests += requests;
  write(s);
}

export interface UsageReport {
  anthropic: {
    configured: boolean;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    budget: number | null;
    remaining: number | null;
    pctUsed: number | null;
    console: string;
  };
  brightdata: {
    configured: boolean;
    requests: number;
    budget: number | null;
    remaining: number | null;
    pctUsed: number | null;
    console: string;
  };
  since: string;
}

function num(env: string | undefined): number | null {
  if (!env) return null;
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getUsageReport(): UsageReport {
  const s = read();
  const aTokens = s.anthropic.inputTokens + s.anthropic.outputTokens;
  const aBudget = num(process.env.ANTHROPIC_TOKEN_BUDGET);
  const bBudget = num(process.env.BRIGHTDATA_REQUEST_BUDGET);

  return {
    anthropic: {
      configured: !!process.env.ANTHROPIC_API_KEY,
      requests: s.anthropic.requests,
      inputTokens: s.anthropic.inputTokens,
      outputTokens: s.anthropic.outputTokens,
      totalTokens: aTokens,
      budget: aBudget,
      remaining: aBudget != null ? Math.max(0, aBudget - aTokens) : null,
      pctUsed: aBudget != null ? Math.min(100, Math.round((aTokens / aBudget) * 100)) : null,
      console: 'https://console.anthropic.com/settings/usage',
    },
    brightdata: {
      configured: !!(process.env.BRIGHTDATA_API_TOKEN || process.env.BRIGHTDATA_MCP_URL),
      requests: s.brightdata.requests,
      budget: bBudget,
      remaining: bBudget != null ? Math.max(0, bBudget - s.brightdata.requests) : null,
      pctUsed: bBudget != null ? Math.min(100, Math.round((s.brightdata.requests / bBudget) * 100)) : null,
      console: 'https://brightdata.com/cp/setting/billing',
    },
    since: s.since,
  };
}
