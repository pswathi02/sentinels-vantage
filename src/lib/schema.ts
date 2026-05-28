/**
 * VAN-102 — Core temporal schemas.
 *
 * Every fact in Vantage is bitemporal:
 *   observed_at  = when the scraper captured it
 *   valid_from   = when the fact became true in the world
 *   valid_to     = when the fact stopped being true (null if still valid)
 *
 * This is what powers the time-slider: we can ask "what did the graph look
 * like at time t?" by filtering edges where valid_from <= t <= (valid_to || now).
 *
 * Every fact also carries source_url so every claim is citable.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────
//  Source attribution
// ─────────────────────────────────────────────────────────────────────

export const SourceType = z.enum([
  'serp_news',         // NYT, FT, Business Journals, etc.
  'linkedin_company',
  'linkedin_employee',
  'glassdoor_reviews',
  'corporate_site',
  'pricing_page',
  'sec_edgar',
  'pacer',
  'dataset_backfill',  // Bright Data Datasets pre-built historical
]);
export type SourceType = z.infer<typeof SourceType>;

export const SourceRef = z.object({
  url: z.string().url(),
  type: SourceType,
  scrapedAt: z.string().datetime(),
  excerpt: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

// ─────────────────────────────────────────────────────────────────────
//  Raw document — what scrapers produce before extraction
// ─────────────────────────────────────────────────────────────────────

export const RawDoc = z.object({
  id: z.string(),
  url: z.string().url(),
  source: SourceType,
  title: z.string().nullable(),
  body: z.string(),
  publishedAt: z.string().datetime().nullable(),
  scrapedAt: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});
export type RawDoc = z.infer<typeof RawDoc>;

// ─────────────────────────────────────────────────────────────────────
//  Entities (nodes in the graph)
// ─────────────────────────────────────────────────────────────────────

export const EntityType = z.enum([
  'company',
  'person',
  'role',          // e.g. "VP EMEA"
  'event',         // e.g. "Q1 earnings call"
  'technology',    // e.g. "Snowflake", "Kubernetes"
  'location',      // e.g. "Frankfurt"
  'product',       // e.g. "Bike+ Premium"
  'document',      // e.g. an SEC filing
  'lawsuit',
]);
export type EntityType = z.infer<typeof EntityType>;

export const Entity = z.object({
  id: z.string(),             // stable id (slug of canonical name)
  type: EntityType,
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  attributes: z.record(z.unknown()).default({}),
  sources: z.array(SourceRef).default([]),
  observedAt: z.string().datetime(),
});
export type Entity = z.infer<typeof Entity>;

// ─────────────────────────────────────────────────────────────────────
//  Relations (edges with bitemporal validity)
// ─────────────────────────────────────────────────────────────────────

export const RelationKind = z.enum([
  // people ↔ org
  'departed',
  'joined',
  'promoted_to',
  'reports_to',
  // org ↔ org
  'acquired',
  'partnered_with',
  'customer_of',
  'competitor_of',
  'invested_in',
  // org ↔ event
  'launched',
  'laid_off',
  'expanded_to',
  'filed_with_sec',
  'litigated_with',
  // org ↔ signal
  'priced_at',
  'reviewed_negatively',
  'reviewed_positively',
  // generic
  'mentioned_in',
]);
export type RelationKind = z.infer<typeof RelationKind>;

export const TemporalRelation = z.object({
  id: z.string(),
  fromEntityId: z.string(),
  toEntityId: z.string(),
  kind: RelationKind,

  // Bitemporal
  observedAt: z.string().datetime(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime().nullable(),

  // Attribution
  sources: z.array(SourceRef).min(1),
  evidence: z.string(),            // direct quote / excerpt
  confidence: z.number().min(0).max(1),

  attributes: z.record(z.unknown()).default({}),
});
export type TemporalRelation = z.infer<typeof TemporalRelation>;

// ─────────────────────────────────────────────────────────────────────
//  Events — punctual facts (a press release, a filing, a lawsuit)
// ─────────────────────────────────────────────────────────────────────

export const EventCategory = z.enum([
  'earnings',
  'press_release',
  'litigation',
  'product_launch',
  'mna',
  'leadership_change',
  'layoff',
  'fundraise',
  'pricing_change',
  'sec_filing',
]);
export type EventCategory = z.infer<typeof EventCategory>;

export const Event = z.object({
  id: z.string(),
  companyId: z.string(),
  category: EventCategory,
  title: z.string(),
  occurredAt: z.string().datetime(),
  description: z.string(),
  sources: z.array(SourceRef).min(1),
});
export type Event = z.infer<typeof Event>;

// ─────────────────────────────────────────────────────────────────────
//  Risk signals — what the red-flag detector emits
// ─────────────────────────────────────────────────────────────────────

export const RiskCategory = z.enum([
  'mgmt',       // exec churn, governance
  'culture',    // glassdoor, blind, reviews
  'financial',  // revenue proxies, pricing pressure
  'legal',      // lawsuits, regulatory
  'market',     // competitive, demand
  'customer',   // churn, complaint surges
]);
export type RiskCategory = z.infer<typeof RiskCategory>;

export const RiskSeverity = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const RiskSignal = z.object({
  id: z.string(),
  companyId: z.string(),
  category: RiskCategory,
  severity: RiskSeverity,
  observedAt: z.string().datetime(),
  description: z.string(),
  evidence: z.array(SourceRef).min(1),
  suggestedICQuestion: z.string().optional(),
  detectionMethod: z.enum(['rule', 'llm']),
});
export type RiskSignal = z.infer<typeof RiskSignal>;

// ─────────────────────────────────────────────────────────────────────
//  Extraction result — what Claude returns per document
// ─────────────────────────────────────────────────────────────────────

export const ExtractionResult = z.object({
  entities: z.array(Entity),
  relations: z.array(TemporalRelation),
  events: z.array(Event),
  summary: z.string(),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

// ─────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────

/** Stable id from a canonical name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Build a fresh ISO timestamp. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** ISO timestamp for N days ago. */
export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
