/**
 * Demo fixture registry.
 *
 * Keyed by bare domain. When DEMO_MODE is on, the pipeline serves these
 * instead of calling Bright Data / Claude. Add new targets here using the
 * same shape as peloton.ts / spirit.ts.
 */

import type { RawDoc, ExtractionResult } from '@/lib/schema';
import { SPIRIT_DOCS, SPIRIT_EXTRACTIONS } from './spirit';
import { WIZ_DOCS, WIZ_EXTRACTIONS } from './wiz';
import { EVERLANE_DOCS, EVERLANE_EXTRACTIONS } from './everlane';

export interface DemoTarget {
  docs: RawDoc[];
  extractions: Record<string, ExtractionResult>;
}

const REGISTRY: Record<string, DemoTarget> = {
  'spirit.com': { docs: SPIRIT_DOCS, extractions: SPIRIT_EXTRACTIONS },
  'wiz.io': { docs: WIZ_DOCS, extractions: WIZ_EXTRACTIONS },
  'everlane.com': { docs: EVERLANE_DOCS, extractions: EVERLANE_EXTRACTIONS },
};

function normalizeDomain(target: string): string {
  return target
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

/** True when DEMO_MODE is enabled OR no Anthropic key is present. */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === '1' || !process.env.ANTHROPIC_API_KEY;
}

export function getDemoTarget(target: string): DemoTarget | null {
  return REGISTRY[normalizeDomain(target)] ?? null;
}

/**
 * True when this target has hand-curated pre-cached data. These are ALWAYS
 * served from fixtures — never fetched — independent of DEMO_MODE. Anything
 * else is treated as a typed-in URL and fetched live (cache-first).
 */
export function isDemoTarget(target: string): boolean {
  return getDemoTarget(target) != null;
}

export function listDemoTargets(): string[] {
  return Object.keys(REGISTRY);
}
