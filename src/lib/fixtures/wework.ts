import {
  type RawDoc,
  type ExtractionResult,
  type SourceRef,
  type SourceType,
  daysAgoIso,
  slugify,
} from '@/lib/schema';

const COMPANY = 'WeWork';
const COMPANY_ID = slugify(COMPANY);

function src(url: string, type: SourceType, daysAgo: number, excerpt: string): SourceRef {
  return { url, type, scrapedAt: daysAgoIso(0), excerpt };
}

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
    id: `evt-wework-${slugify(title)}-${daysAgo}`,
    companyId: COMPANY_ID,
    category,
    title,
    occurredAt: daysAgoIso(daysAgo),
    description,
    sources: [src('https://www.wsj.com/wework', 'serp_news', daysAgo, description)],
  };
}

const BEATS: Beat[] = [
  // ── Lease defaults (earliest signal) ──────────────────────────────────
  beat({
    id: 'wework-lease-defaults',
    source: 'sec_edgar',
    url: 'https://www.sec.gov/Archives/edgar/data/wework-8k-lease',
    title: '8-K — WeWork discloses lease payment defaults',
    body: 'WeWork disclosed it has defaulted on lease payments at 40 locations across North America, triggering landlord remedies and accelerating restructuring negotiations.',
    publishedDaysAgo: 175,
    entities: [
      company(COMPANY),
      {
        id: 'wework-lease-default-8k',
        type: 'document' as const,
        name: 'WeWork 8-K (lease defaults)',
        aliases: [],
        attributes: { form: '8-K' },
        sources: [] as SourceRef[],
        observedAt: daysAgoIso(175),
      },
    ],
    relations: [
      rel(COMPANY_ID, 'wework-lease-default-8k', 'filed_with_sec', 175, {
        evidence: 'defaulted on lease payments at 40 locations across North America',
        confidence: 0.97,
        sourceType: 'sec_edgar',
        url: 'https://www.sec.gov/Archives/edgar/data/wework-8k-lease',
      }),
    ],
    events: [
      evt('sec_filing', '8-K: lease defaults disclosed', 175, '40 North American locations in default.'),
    ],
  }),

  // ── Workforce reduction ───────────────────────────────────────────────
  beat({
    id: 'wework-layoff-1',
    source: 'serp_news',
    url: 'https://www.bloomberg.com/news/wework-cuts-300-employees',
    title: 'WeWork cuts 300 employees as losses mount',
    body: 'WeWork said it would eliminate roughly 300 corporate roles, about 18% of its remaining office staff, as part of a plan to reduce its cash burn.',
    publishedDaysAgo: 160,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'laid_off', 160, {
        evidence: 'eliminate roughly 300 corporate roles, about 18% of its remaining office staff',
        confidence: 0.96,
        sourceType: 'serp_news',
        url: 'https://www.bloomberg.com/news/wework-cuts-300-employees',
        attributes: { headcountCut: 300, pct: 18 },
      }),
    ],
    events: [
      evt('layoff', 'Layoff: ~300 roles (18%)', 160, 'WeWork eliminates 18% of remaining corporate staff.'),
    ],
  }),

  // ── Chapter 11 filing ─────────────────────────────────────────────────
  beat({
    id: 'wework-chapter11',
    source: 'pacer',
    url: 'https://www.courtlistener.com/docket/wework-chapter-11',
    title: 'WeWork files for Chapter 11 bankruptcy protection',
    body: 'WeWork Inc. filed for Chapter 11 bankruptcy protection in New Jersey federal court, listing $18.6 billion in liabilities and seeking to reject hundreds of commercial leases.',
    publishedDaysAgo: 115,
    entities: [
      company(COMPANY),
      {
        id: 'wework-chapter-11',
        type: 'lawsuit' as const,
        name: 'WeWork Chapter 11 Bankruptcy',
        aliases: [],
        attributes: { court: 'D.N.J.', type: 'bankruptcy', liabilities: '18.6B' },
        sources: [] as SourceRef[],
        observedAt: daysAgoIso(115),
      },
    ],
    relations: [
      rel(COMPANY_ID, 'wework-chapter-11', 'litigated_with', 115, {
        evidence: 'filed for Chapter 11 bankruptcy protection, listing $18.6 billion in liabilities',
        confidence: 0.99,
        sourceType: 'pacer',
        url: 'https://www.courtlistener.com/docket/wework-chapter-11',
      }),
    ],
    events: [
      evt('litigation', 'Chapter 11 bankruptcy filed', 115, 'WeWork files with $18.6B in liabilities, seeks to reject hundreds of leases.'),
    ],
  }),

  // ── Facility closures ─────────────────────────────────────────────────
  beat({
    id: 'wework-facility-closures',
    source: 'serp_news',
    url: 'https://www.bloomberg.com/news/wework-closes-170-locations',
    title: 'WeWork closes 170 locations as part of bankruptcy exit plan',
    body: 'WeWork said it would shut 170 office locations globally as the company shrinks its footprint from over 700 locations to fewer than 400 to achieve profitability.',
    publishedDaysAgo: 95,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'laid_off', 95, {
        evidence: 'shut 170 office locations globally, shrinks its footprint from over 700 to fewer than 400',
        confidence: 0.94,
        sourceType: 'serp_news',
        url: 'https://www.bloomberg.com/news/wework-closes-170-locations',
        attributes: { locationsClosed: 170, locationsRemaining: 400 },
      }),
    ],
    events: [
      evt('layoff', 'Closure: 170 locations', 95, 'WeWork shuts 170 locations as part of bankruptcy exit plan.'),
    ],
  }),

  // ── Landlord lawsuit ──────────────────────────────────────────────────
  beat({
    id: 'wework-landlord-suit',
    source: 'pacer',
    url: 'https://www.courtlistener.com/docket/wework-landlord-litigation',
    title: 'Major landlords sue WeWork over unpaid rent',
    body: 'A group of commercial landlords filed suit against WeWork for $340 million in unpaid rent, arguing the company\'s bankruptcy plan improperly extinguishes their lease claims.',
    publishedDaysAgo: 70,
    entities: [
      company(COMPANY),
      {
        id: 'wework-landlord-lawsuit',
        type: 'lawsuit' as const,
        name: 'WeWork Landlord Rent Dispute',
        aliases: [],
        attributes: { court: 'D.N.J.', type: 'commercial', claimedAmount: '340M' },
        sources: [] as SourceRef[],
        observedAt: daysAgoIso(70),
      },
    ],
    relations: [
      rel(COMPANY_ID, 'wework-landlord-lawsuit', 'litigated_with', 70, {
        evidence: 'landlords filed suit against WeWork for $340 million in unpaid rent',
        confidence: 0.91,
        sourceType: 'pacer',
        url: 'https://www.courtlistener.com/docket/wework-landlord-litigation',
      }),
    ],
    events: [
      evt('litigation', 'Landlord lawsuit: $340M', 70, 'Commercial landlords sue over unpaid rent.'),
    ],
  }),

  // ── CFO resignation (within 90d window) ──────────────────────────────
  beat({
    id: 'wework-cfo-departure',
    source: 'serp_news',
    url: 'https://www.ft.com/content/wework-cfo-resigns-debt-talks',
    title: 'WeWork CFO resigns as restructuring enters final phase',
    body: 'WeWork chief financial officer Andre Fernandez has resigned as the shared-office company entered the final phase of its post-bankruptcy restructuring.',
    publishedDaysAgo: 80,
    entities: [company(COMPANY), person('Andre Fernandez', { role: 'CFO' })],
    relations: [
      rel('andre-fernandez', COMPANY_ID, 'departed', 80, {
        evidence: 'chief financial officer Andre Fernandez has resigned',
        confidence: 0.95,
        sourceType: 'serp_news',
        url: 'https://www.ft.com/content/wework-cfo-resigns-debt-talks',
      }),
    ],
    events: [
      evt('leadership_change', 'CFO resignation', 80, 'WeWork CFO Andre Fernandez resigns during restructuring final phase.'),
    ],
  }),

  // ── CEO departure (within 90d window) ────────────────────────────────
  beat({
    id: 'wework-ceo-departure',
    source: 'serp_news',
    url: 'https://www.wsj.com/articles/wework-ceo-david-tolley-steps-down',
    title: 'WeWork CEO David Tolley steps down',
    body: 'David Tolley will step down as chief executive of WeWork as the company completes its Chapter 11 restructuring, with the board appointing an interim CEO.',
    publishedDaysAgo: 60,
    entities: [company(COMPANY), person('David Tolley', { role: 'CEO' })],
    relations: [
      rel('david-tolley', COMPANY_ID, 'departed', 60, {
        evidence: 'David Tolley will step down as chief executive of WeWork',
        confidence: 0.96,
        sourceType: 'serp_news',
        url: 'https://www.wsj.com/articles/wework-ceo-david-tolley-steps-down',
      }),
    ],
    events: [
      evt('leadership_change', 'CEO departure', 60, 'CEO David Tolley exits as Chapter 11 restructuring completes.'),
    ],
  }),

  // ── Glassdoor sentiment crash ─────────────────────────────────────────
  beat({
    id: 'wework-glassdoor',
    source: 'glassdoor_reviews',
    url: 'https://www.glassdoor.com/Reviews/WeWork-reviews.htm',
    title: 'Glassdoor reviews — WeWork',
    body: 'Recent reviews cite extreme uncertainty, office closures, and lack of leadership direction. Multiple employees report learning about their office closure from the news. Overall rating has fallen sharply.',
    publishedDaysAgo: 45,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'reviewed_negatively', 45, {
        evidence: 'extreme uncertainty, office closures, and lack of leadership direction',
        confidence: 0.87,
        sourceType: 'glassdoor_reviews',
        url: 'https://www.glassdoor.com/Reviews/WeWork-reviews.htm',
        attributes: { ratingNow: 2.3, ratingPrev: 3.8, deltaStars: -1.5 },
      }),
    ],
    events: [],
  }),

  // ── Pricing / occupancy decline ───────────────────────────────────────
  beat({
    id: 'wework-pricing',
    source: 'pricing_page',
    url: 'https://www.wework.com/plans',
    title: 'WeWork membership pricing',
    body: 'WeWork has reduced Hot Desk pricing by 35% across North American locations in an attempt to boost occupancy, which has fallen to below 60% at many sites.',
    publishedDaysAgo: 20,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'priced_at', 20, {
        evidence: 'reduced Hot Desk pricing by 35% across North American locations',
        confidence: 0.88,
        sourceType: 'pricing_page',
        url: 'https://www.wework.com/plans',
        attributes: { priceCutPct: 35, occupancyPct: 60 },
      }),
    ],
    events: [
      evt('pricing_change', 'Price cut: 35% on Hot Desk', 20, 'WeWork slashes prices to drive occupancy at struggling locations.'),
    ],
  }),
];

export const WEWORK_DOCS: RawDoc[] = BEATS.map((b) => b.doc);

export const WEWORK_EXTRACTIONS: Record<string, ExtractionResult> = Object.fromEntries(
  BEATS.map((b) => [b.doc.id, b.extraction]),
);
