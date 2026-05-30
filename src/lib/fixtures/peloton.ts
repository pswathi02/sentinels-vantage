/**
 * Demo fixtures — Peloton.
 *
 * Used when DEMO_MODE=1 (or no creds present) so the full pipeline runs
 * end-to-end with zero external calls. Dates are anchored relative to *now*
 * via daysAgoIso(), so the collapse plays out across the last ~180 days and
 * the time-slider / diff / trajectory queries return meaningful numbers
 * regardless of when the demo runs.
 *
 * To go live: set DEMO_MODE=0 and supply ANTHROPIC_API_KEY + Bright Data creds.
 */

import {
  type RawDoc,
  type ExtractionResult,
  type SourceRef,
  type SourceType,
  daysAgoIso,
  slugify,
} from '@/lib/schema';

const COMPANY = 'Peloton Interactive';
const COMPANY_ID = slugify(COMPANY);

function src(url: string, type: SourceType, daysAgo: number, excerpt: string): SourceRef {
  return { url, type, scrapedAt: daysAgoIso(0), excerpt };
}

/**
 * One "story beat" = a scraped doc + the structured facts we'd extract from it.
 * Keeps the fixture readable and lets us add wework/klaviyo with the same shape.
 */
interface Beat {
  doc: RawDoc;
  extraction: ExtractionResult;
}

function person(name: string, attrs: Record<string, unknown> = {}, daysAgo = 180) {
  return {
    id: slugify(name),
    type: 'person' as const,
    name,
    aliases: [],
    attributes: attrs,
    sources: [] as SourceRef[],
    observedAt: daysAgoIso(daysAgo),
  };
}

function company(name: string, daysAgo = 180) {
  return {
    id: slugify(name),
    type: 'company' as const,
    name,
    aliases: [],
    attributes: {},
    sources: [] as SourceRef[],
    observedAt: daysAgoIso(daysAgo),
  };
}

const BEATS: Beat[] = [
  // ── CFO departure (clustered exec churn) ──────────────────────────────
  beat({
    id: 'serp-cfo-departure',
    source: 'serp_news',
    url: 'https://www.bloomberg.com/news/peloton-cfo-steps-down',
    title: 'Peloton CFO steps down amid restructuring',
    body: 'Peloton Interactive said its chief financial officer is leaving the company as the connected-fitness maker pushes a sweeping cost-cutting plan.',
    publishedDaysAgo: 170,
    entities: [company(COMPANY), person('Jill Woodworth', { role: 'CFO' })],
    relations: [
      rel('jill-woodworth', COMPANY_ID, 'departed', 170, {
        evidence: 'its chief financial officer is leaving the company',
        confidence: 0.95,
        sourceType: 'serp_news',
        url: 'https://www.bloomberg.com/news/peloton-cfo-steps-down',
      }),
    ],
    events: [
      evt('leadership_change', 'CFO departure', 170, 'Peloton CFO Jill Woodworth steps down.'),
    ],
  }),

  // ── New CFO joins ─────────────────────────────────────────────────────
  beat({
    id: 'serp-new-cfo',
    source: 'serp_news',
    url: 'https://www.reuters.com/business/peloton-names-new-cfo',
    title: 'Peloton names Liz Coddington as new CFO',
    body: 'Peloton Interactive appointed Liz Coddington, a former Amazon Web Services finance executive, as chief financial officer.',
    publishedDaysAgo: 160,
    entities: [company(COMPANY), person('Liz Coddington', { role: 'CFO' })],
    relations: [
      rel('liz-coddington', COMPANY_ID, 'joined', 160, {
        evidence: 'appointed Liz Coddington ... as chief financial officer',
        confidence: 0.96,
        sourceType: 'serp_news',
        url: 'https://www.reuters.com/business/peloton-names-new-cfo',
      }),
    ],
    events: [
      evt('leadership_change', 'New CFO appointed', 160, 'Liz Coddington joins as CFO.'),
    ],
  }),

  // ── Mass layoff #1 ────────────────────────────────────────────────────
  beat({
    id: 'serp-layoff-1',
    source: 'serp_news',
    url: 'https://www.ft.com/content/peloton-cuts-2800-jobs',
    title: 'Peloton to cut about 2,800 jobs',
    body: 'Peloton said it would eliminate roughly 2,800 roles, about 20% of corporate positions, as demand for its bikes cooled sharply.',
    publishedDaysAgo: 140,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'laid_off', 140, {
        evidence: 'eliminate roughly 2,800 roles, about 20% of corporate positions',
        confidence: 0.97,
        sourceType: 'serp_news',
        url: 'https://www.ft.com/content/peloton-cuts-2800-jobs',
        attributes: { headcountCut: 2800, pct: 20 },
      }),
    ],
    events: [
      evt('layoff', 'Layoff: ~2,800 roles', 140, 'Peloton cuts ~20% of corporate staff.'),
    ],
  }),

  // ── Securities lawsuit ────────────────────────────────────────────────
  beat({
    id: 'pacer-securities-suit',
    source: 'pacer',
    url: 'https://www.courtlistener.com/docket/peloton-securities-litigation',
    title: 'Shareholders file securities class action against Peloton',
    body: 'A putative class action alleges Peloton executives made misleading statements about inventory and demand, inflating the share price before a sharp decline.',
    publishedDaysAgo: 110,
    entities: [
      company(COMPANY),
      {
        id: 'peloton-securities-class-action',
        type: 'lawsuit' as const,
        name: 'Peloton Securities Class Action',
        aliases: [],
        attributes: { court: 'EDNY', type: 'securities' },
        sources: [] as SourceRef[],
        observedAt: daysAgoIso(110),
      },
    ],
    relations: [
      rel(COMPANY_ID, 'peloton-securities-class-action', 'litigated_with', 110, {
        evidence: 'A putative class action alleges Peloton executives made misleading statements',
        confidence: 0.9,
        sourceType: 'pacer',
        url: 'https://www.courtlistener.com/docket/peloton-securities-litigation',
      }),
    ],
    events: [
      evt('litigation', 'Securities class action filed', 110, 'Shareholders sue over alleged misleading demand statements.'),
    ],
  }),

  // ── COO departure ─────────────────────────────────────────────────────
  beat({
    id: 'linkedin-coo-departure',
    source: 'linkedin_employee',
    url: 'https://www.linkedin.com/in/tom-cortese',
    title: 'Tom Cortese departs Peloton',
    body: 'Co-founder and Chief Operating Officer Tom Cortese announced his departure from Peloton after more than a decade.',
    publishedDaysAgo: 120,
    entities: [company(COMPANY), person('Tom Cortese', { role: 'COO', cofounder: true })],
    relations: [
      rel('tom-cortese', COMPANY_ID, 'departed', 120, {
        evidence: 'Chief Operating Officer Tom Cortese announced his departure',
        confidence: 0.94,
        sourceType: 'linkedin_employee',
        url: 'https://www.linkedin.com/in/tom-cortese',
      }),
    ],
    events: [
      evt('leadership_change', 'COO departure', 120, 'Co-founder/COO Tom Cortese leaves Peloton.'),
    ],
  }),

  // ── CMO departure (2nd senior exit in 90d window) ─────────────────────
  beat({
    id: 'linkedin-cmo-departure',
    source: 'linkedin_employee',
    url: 'https://www.linkedin.com/in/dara-treseder',
    title: 'Dara Treseder leaves Peloton',
    body: 'Chief Marketing Officer Dara Treseder is departing Peloton to join another consumer-tech company.',
    publishedDaysAgo: 80,
    entities: [company(COMPANY), person('Dara Treseder', { role: 'CMO' })],
    relations: [
      rel('dara-treseder', COMPANY_ID, 'departed', 80, {
        evidence: 'Chief Marketing Officer Dara Treseder is departing Peloton',
        confidence: 0.93,
        sourceType: 'linkedin_employee',
        url: 'https://www.linkedin.com/in/dara-treseder',
      }),
    ],
    events: [
      evt('leadership_change', 'CMO departure', 80, 'CMO Dara Treseder departs.'),
    ],
  }),

  // ── CEO departure (3rd senior exit in 90d window) ─────────────────────
  beat({
    id: 'serp-ceo-departure',
    source: 'serp_news',
    url: 'https://www.wsj.com/articles/peloton-ceo-barry-mccarthy-steps-down',
    title: 'Peloton CEO Barry McCarthy steps down',
    body: 'Barry McCarthy will step down as chief executive of Peloton, and the company announced a fresh round of layoffs alongside his exit.',
    publishedDaysAgo: 60,
    entities: [company(COMPANY), person('Barry McCarthy', { role: 'CEO' })],
    relations: [
      rel('barry-mccarthy', COMPANY_ID, 'departed', 60, {
        evidence: 'Barry McCarthy will step down as chief executive of Peloton',
        confidence: 0.97,
        sourceType: 'serp_news',
        url: 'https://www.wsj.com/articles/peloton-ceo-barry-mccarthy-steps-down',
      }),
    ],
    events: [
      evt('leadership_change', 'CEO departure', 60, 'CEO Barry McCarthy steps down.'),
    ],
  }),

  // ── Mass layoff #2 (alongside CEO exit) ───────────────────────────────
  beat({
    id: 'serp-layoff-2',
    source: 'serp_news',
    url: 'https://www.cnbc.com/peloton-cuts-15-percent-workforce',
    title: 'Peloton to cut 15% of workforce',
    body: 'Peloton said it would reduce its workforce by about 15%, roughly 400 employees, as part of a plan to reach positive cash flow.',
    publishedDaysAgo: 60,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'laid_off', 60, {
        evidence: 'reduce its workforce by about 15%, roughly 400 employees',
        confidence: 0.96,
        sourceType: 'serp_news',
        url: 'https://www.cnbc.com/peloton-cuts-15-percent-workforce',
        attributes: { headcountCut: 400, pct: 15 },
      }),
    ],
    events: [
      evt('layoff', 'Layoff: ~15% of staff', 60, 'Second major workforce reduction.'),
    ],
  }),

  // ── Glassdoor sentiment crash ─────────────────────────────────────────
  beat({
    id: 'glassdoor-reviews',
    source: 'glassdoor_reviews',
    url: 'https://www.glassdoor.com/Reviews/Peloton-reviews.htm',
    title: 'Glassdoor reviews — Peloton',
    body: 'Recent reviews cite low morale after repeated layoffs, leadership churn, and uncertainty about the company direction. Overall rating has fallen over the past two quarters.',
    publishedDaysAgo: 45,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'reviewed_negatively', 45, {
        evidence: 'low morale after repeated layoffs, leadership churn',
        confidence: 0.85,
        sourceType: 'glassdoor_reviews',
        url: 'https://www.glassdoor.com/Reviews/Peloton-reviews.htm',
        attributes: { ratingNow: 2.9, ratingPrev: 3.6, deltaStars: -0.7 },
      }),
    ],
    events: [],
  }),

  // ── Pricing change (subscription hike) ────────────────────────────────
  beat({
    id: 'pricing-page',
    source: 'pricing_page',
    url: 'https://www.onepeloton.com/membership',
    title: 'Peloton membership pricing',
    body: 'The All-Access Membership price increased to $44 per month in the United States, up from $39, the second increase in the past year.',
    publishedDaysAgo: 30,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'priced_at', 30, {
        evidence: 'All-Access Membership price increased to $44 per month',
        confidence: 0.92,
        sourceType: 'pricing_page',
        url: 'https://www.onepeloton.com/membership',
        attributes: { price: 44, prevPrice: 39, currency: 'USD' },
      }),
    ],
    events: [
      evt('pricing_change', 'Membership price hike', 30, 'All-Access Membership rises to $44/mo.'),
    ],
  }),

  // ── SEC 8-K filing ────────────────────────────────────────────────────
  beat({
    id: 'sec-8k',
    source: 'sec_edgar',
    url: 'https://www.sec.gov/Archives/edgar/data/peloton-8k',
    title: '8-K — Peloton Interactive',
    body: 'Peloton filed an 8-K disclosing leadership changes and a restructuring plan expected to reduce annual run-rate expenses.',
    publishedDaysAgo: 60,
    entities: [
      company(COMPANY),
      {
        id: 'peloton-8k-restructuring',
        type: 'document' as const,
        name: 'Peloton 8-K (restructuring)',
        aliases: [],
        attributes: { form: '8-K' },
        sources: [] as SourceRef[],
        observedAt: daysAgoIso(60),
      },
    ],
    relations: [
      rel(COMPANY_ID, 'peloton-8k-restructuring', 'filed_with_sec', 60, {
        evidence: 'Peloton filed an 8-K disclosing leadership changes and a restructuring plan',
        confidence: 0.98,
        sourceType: 'sec_edgar',
        url: 'https://www.sec.gov/Archives/edgar/data/peloton-8k',
      }),
    ],
    events: [
      evt('sec_filing', '8-K filed', 60, 'Restructuring + leadership changes disclosed.'),
    ],
  }),
];

// ─────────────────────────────────────────────────────────────────────
//  Builders — keep the beats above terse and consistent
// ─────────────────────────────────────────────────────────────────────

interface BeatInput {
  id: string;
  source: SourceType;
  url: string;
  title: string;
  body: string;
  publishedDaysAgo: number;
  entities: ExtractionResult['entities'];
  relations: ExtractionResult['relations'];
  events: ExtractionResult['events'];
}

function beat(input: BeatInput): Beat {
  const doc: RawDoc = {
    id: input.id,
    url: input.url,
    source: input.source,
    title: input.title,
    body: input.body,
    publishedAt: daysAgoIso(input.publishedDaysAgo),
    scrapedAt: daysAgoIso(0),
    metadata: {},
  };
  return {
    doc,
    extraction: {
      entities: input.entities,
      relations: input.relations,
      events: input.events,
      summary: input.title,
    },
  };
}

function rel(
  fromId: string,
  toId: string,
  kind: ExtractionResult['relations'][number]['kind'],
  daysAgo: number,
  opts: {
    evidence: string;
    confidence: number;
    sourceType: SourceType;
    url: string;
    validToDaysAgo?: number;
    attributes?: Record<string, unknown>;
  },
): ExtractionResult['relations'][number] {
  return {
    id: `rel-${fromId}-${kind}-${daysAgo}`,
    fromEntityId: fromId,
    toEntityId: toId,
    kind,
    observedAt: daysAgoIso(0),
    validFrom: daysAgoIso(daysAgo),
    validTo: opts.validToDaysAgo != null ? daysAgoIso(opts.validToDaysAgo) : null,
    sources: [src(opts.url, opts.sourceType, daysAgo, opts.evidence)],
    evidence: opts.evidence,
    confidence: opts.confidence,
    attributes: opts.attributes ?? {},
  };
}

function evt(
  category: ExtractionResult['events'][number]['category'],
  title: string,
  daysAgo: number,
  description: string,
): ExtractionResult['events'][number] {
  return {
    id: `evt-${slugify(title)}-${daysAgo}`,
    companyId: COMPANY_ID,
    category,
    title,
    occurredAt: daysAgoIso(daysAgo),
    description,
    sources: [src('https://www.sec.gov/Archives/edgar/data/peloton', 'serp_news', daysAgo, description)],
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────

export const PELOTON_DOCS: RawDoc[] = BEATS.map((b) => b.doc);

/** doc.id → ExtractionResult, for the DEMO_MODE extract() branch. */
export const PELOTON_EXTRACTIONS: Record<string, ExtractionResult> = Object.fromEntries(
  BEATS.map((b) => [b.doc.id, b.extraction]),
);
