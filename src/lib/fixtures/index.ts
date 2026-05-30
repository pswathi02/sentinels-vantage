/**
 * Demo fixture registry.
 *
 * Keyed by bare domain. When DEMO_MODE is on, the pipeline serves these
 * instead of calling Bright Data / Claude. Add wework.com and klaviyo.com
 * here using the same shape as peloton.ts.
 */

import type { RawDoc, ExtractionResult } from '@/lib/schema';
import { PELOTON_DOCS, PELOTON_EXTRACTIONS } from './peloton';

export interface DemoTarget {
  docs: RawDoc[];
  extractions: Record<string, ExtractionResult>;
}

const REGISTRY: Record<string, DemoTarget> = {
  'peloton.com': { docs: PELOTON_DOCS, extractions: PELOTON_EXTRACTIONS },
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

export function listDemoTargets(): string[] {
  return Object.keys(REGISTRY);
}
