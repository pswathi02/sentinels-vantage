import {
  type RawDoc,
  type ExtractionResult,
  type SourceRef,
  type SourceType,
  daysAgoIso,
  slugify,
} from '@/lib/schema';

const COMPANY = 'Klaviyo';
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
    id: `evt-klaviyo-${slugify(title)}-${daysAgo}`,
    companyId: COMPANY_ID,
    category,
    title,
    occurredAt: daysAgoIso(daysAgo),
    description,
    sources: [src('https://ir.klaviyo.com', 'serp_news', daysAgo, description)],
  };
}

const BEATS: Beat[] = [
  // ── Strong quarterly earnings ─────────────────────────────────────────
  beat({
    id: 'klaviyo-q3-earnings',
    source: 'sec_edgar',
    url: 'https://ir.klaviyo.com/news/detail/klaviyo-q3-results',
    title: 'Klaviyo reports Q3 revenue of $235M, up 34% year-over-year',
    body: 'Klaviyo reported third-quarter revenue of $235 million, a 34% increase year-over-year, beating analyst expectations. The company raised full-year guidance and said customer count exceeded 160,000.',
    publishedDaysAgo: 170,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'mentioned_in', 170, {
        evidence: 'third-quarter revenue of $235 million, a 34% increase year-over-year',
        confidence: 0.97,
        sourceType: 'sec_edgar',
        url: 'https://ir.klaviyo.com/news/detail/klaviyo-q3-results',
        attributes: { revenue: 235, yoyGrowth: 34, customers: 160000 },
      }),
    ],
    events: [
      evt('earnings', 'Q3: $235M revenue (+34% YoY)', 170, 'Klaviyo beats estimates; raises full-year guidance.'),
    ],
  }),

  // ── CRO hire ─────────────────────────────────────────────────────────
  beat({
    id: 'klaviyo-cro-hire',
    source: 'linkedin_company',
    url: 'https://www.linkedin.com/company/klaviyo',
    title: 'Klaviyo appoints new Chief Revenue Officer from Salesforce',
    body: 'Klaviyo appointed Stephanie Buscemi as Chief Revenue Officer. Buscemi joins from Salesforce, where she served as Chief Marketing Officer and led a $4 billion revenue portfolio.',
    publishedDaysAgo: 155,
    entities: [
      company(COMPANY),
      company('Salesforce', 155),
      person('Stephanie Buscemi', { role: 'CRO' }),
    ],
    relations: [
      rel('stephanie-buscemi', COMPANY_ID, 'joined', 155, {
        evidence: 'appointed Stephanie Buscemi as Chief Revenue Officer',
        confidence: 0.95,
        sourceType: 'linkedin_company',
        url: 'https://www.linkedin.com/company/klaviyo',
      }),
      rel('stephanie-buscemi', 'salesforce', 'departed', 155, {
        evidence: 'Buscemi joins from Salesforce, where she served as Chief Marketing Officer',
        confidence: 0.90,
        sourceType: 'linkedin_company',
        url: 'https://www.linkedin.com/company/klaviyo',
      }),
    ],
    events: [
      evt('leadership_change', 'CRO hire: Stephanie Buscemi', 155, 'Ex-Salesforce CMO joins as Klaviyo CRO.'),
    ],
  }),

  // ── Shopify partnership expansion ─────────────────────────────────────
  beat({
    id: 'klaviyo-shopify-partnership',
    source: 'serp_news',
    url: 'https://www.reuters.com/klaviyo-shopify-expanded-partnership',
    title: 'Klaviyo and Shopify expand partnership with deeper integration',
    body: 'Klaviyo and Shopify announced an expanded partnership that makes Klaviyo the default email and SMS marketing platform for new Shopify merchants. Shopify also increased its equity stake in Klaviyo.',
    publishedDaysAgo: 140,
    entities: [company(COMPANY), company('Shopify', 140)],
    relations: [
      rel(COMPANY_ID, 'shopify', 'partnered_with', 140, {
        evidence: 'makes Klaviyo the default email and SMS marketing platform for new Shopify merchants',
        confidence: 0.96,
        sourceType: 'serp_news',
        url: 'https://www.reuters.com/klaviyo-shopify-expanded-partnership',
      }),
    ],
    events: [
      evt('press_release', 'Shopify partnership expanded', 140, 'Klaviyo becomes default marketing platform for Shopify merchants; Shopify increases equity stake.'),
    ],
  }),

  // ── AI product launch ─────────────────────────────────────────────────
  beat({
    id: 'klaviyo-ai-launch',
    source: 'corporate_site',
    url: 'https://www.klaviyo.com/blog/ai-personalization-suite',
    title: 'Klaviyo launches AI Personalization Suite',
    body: 'Klaviyo launched its AI Personalization Suite, a set of machine-learning tools that automatically optimize send times, predict customer lifetime value, and generate personalized product recommendations at scale.',
    publishedDaysAgo: 120,
    entities: [
      company(COMPANY),
      {
        id: 'klaviyo-ai-personalization-suite',
        type: 'product' as const,
        name: 'Klaviyo AI Personalization Suite',
        aliases: [],
        attributes: { category: 'AI/ML', segment: 'email marketing' },
        sources: [] as SourceRef[],
        observedAt: daysAgoIso(120),
      },
    ],
    relations: [
      rel(COMPANY_ID, 'klaviyo-ai-personalization-suite', 'launched', 120, {
        evidence: 'launched its AI Personalization Suite, a set of machine-learning tools',
        confidence: 0.97,
        sourceType: 'corporate_site',
        url: 'https://www.klaviyo.com/blog/ai-personalization-suite',
      }),
    ],
    events: [
      evt('product_launch', 'AI Personalization Suite launched', 120, 'ML-powered send-time optimization, CLV prediction, and product recommendations.'),
    ],
  }),

  // ── APAC expansion ────────────────────────────────────────────────────
  beat({
    id: 'klaviyo-apac-expansion',
    source: 'serp_news',
    url: 'https://www.bloomberg.com/news/klaviyo-apac-expansion',
    title: 'Klaviyo expands into Asia-Pacific with Singapore headquarters',
    body: 'Klaviyo opened its Asia-Pacific headquarters in Singapore and announced plans to hire 200 employees in the region over the next 18 months, targeting the fast-growing Southeast Asian e-commerce market.',
    publishedDaysAgo: 100,
    entities: [
      company(COMPANY),
      { id: 'singapore', type: 'location' as const, name: 'Singapore', aliases: [], attributes: {}, sources: [] as SourceRef[], observedAt: daysAgoIso(100) },
    ],
    relations: [
      rel(COMPANY_ID, 'singapore', 'expanded_to', 100, {
        evidence: 'opened its Asia-Pacific headquarters in Singapore',
        confidence: 0.95,
        sourceType: 'serp_news',
        url: 'https://www.bloomberg.com/news/klaviyo-apac-expansion',
        attributes: { hires: 200, timeline: '18 months' },
      }),
    ],
    events: [
      evt('press_release', 'APAC expansion: Singapore HQ', 100, 'Klaviyo opens APAC HQ in Singapore; targets 200 regional hires.'),
    ],
  }),

  // ── Strong Q4 earnings beat ───────────────────────────────────────────
  beat({
    id: 'klaviyo-q4-earnings',
    source: 'sec_edgar',
    url: 'https://ir.klaviyo.com/news/detail/klaviyo-q4-results',
    title: 'Klaviyo Q4 revenue $272M, raises FY guidance to $1B+',
    body: 'Klaviyo reported Q4 revenue of $272 million, up 31% year-over-year, and full-year revenue of $937 million. The company issued FY guidance above $1 billion for the first time.',
    publishedDaysAgo: 75,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'mentioned_in', 75, {
        evidence: 'Q4 revenue of $272 million, up 31% year-over-year',
        confidence: 0.97,
        sourceType: 'sec_edgar',
        url: 'https://ir.klaviyo.com/news/detail/klaviyo-q4-results',
        attributes: { revenue: 272, yoyGrowth: 31, fyRevenue: 937 },
      }),
    ],
    events: [
      evt('earnings', 'Q4: $272M revenue (+31% YoY); FY guidance >$1B', 75, 'First time guiding above $1B annual revenue.'),
    ],
  }),

  // ── Enterprise customer wins ──────────────────────────────────────────
  beat({
    id: 'klaviyo-enterprise-wins',
    source: 'serp_news',
    url: 'https://www.ft.com/content/klaviyo-enterprise-expansion',
    title: 'Klaviyo wins major enterprise contracts, including Gap and L\'Oréal',
    body: 'Klaviyo announced it had signed enterprise agreements with Gap Inc. and L\'Oréal, as the company pushes upmarket from its SMB roots. Enterprise customers (over $50K ARR) now represent 28% of revenue.',
    publishedDaysAgo: 50,
    entities: [
      company(COMPANY),
      company('Gap Inc.', 50),
      company('L\'Oréal', 50),
    ],
    relations: [
      rel('gap-inc-', COMPANY_ID, 'customer_of', 50, {
        evidence: 'signed enterprise agreements with Gap Inc.',
        confidence: 0.93,
        sourceType: 'serp_news',
        url: 'https://www.ft.com/content/klaviyo-enterprise-expansion',
      }),
      rel('l-or-al', COMPANY_ID, 'customer_of', 50, {
        evidence: 'signed enterprise agreements with ... L\'Oréal',
        confidence: 0.93,
        sourceType: 'serp_news',
        url: 'https://www.ft.com/content/klaviyo-enterprise-expansion',
      }),
    ],
    events: [
      evt('press_release', 'Enterprise wins: Gap & L\'Oréal', 50, 'Enterprise segment now 28% of revenue.'),
    ],
  }),

  // ── Positive Glassdoor / employer brand ───────────────────────────────
  beat({
    id: 'klaviyo-glassdoor',
    source: 'glassdoor_reviews',
    url: 'https://www.glassdoor.com/Reviews/Klaviyo-reviews.htm',
    title: 'Glassdoor reviews — Klaviyo',
    body: 'Klaviyo continues to rank among the highest-rated marketing tech employers. Reviews consistently highlight strong product culture, competitive compensation, and transparent leadership. Rating has increased over the past two quarters.',
    publishedDaysAgo: 25,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'reviewed_positively', 25, {
        evidence: 'strong product culture, competitive compensation, and transparent leadership',
        confidence: 0.88,
        sourceType: 'glassdoor_reviews',
        url: 'https://www.glassdoor.com/Reviews/Klaviyo-reviews.htm',
        attributes: { ratingNow: 4.5, ratingPrev: 4.2, deltaStars: 0.3 },
      }),
    ],
    events: [],
  }),
];

export const KLAVIYO_DOCS: RawDoc[] = BEATS.map((b) => b.doc);

export const KLAVIYO_EXTRACTIONS: Record<string, ExtractionResult> = Object.fromEntries(
  BEATS.map((b) => [b.doc.id, b.extraction]),
);
