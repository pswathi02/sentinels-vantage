/**
 * Demo fixtures — Wiz (wiz.io).
 *
 * A breakout-growth arc ending in the record $32B Google acquisition. Every
 * source URL below is a REAL, verified article (news, corporate blog,
 * Glassdoor) so each cited claim opens the exact post — same as the live
 * pipeline. Dates are anchored relative to *now* via daysAgoIso().
 */

import {
  type RawDoc,
  type ExtractionResult,
  type SourceRef,
  type SourceType,
  daysAgoIso,
  slugify,
} from '@/lib/schema';

const COMPANY = 'Wiz';
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
  url: string,
  sourceType: SourceType = 'serp_news',
): ExtractionResult['events'][number] {
  return {
    id: `evt-wiz-${slugify(title)}-${daysAgo}`,
    companyId: COMPANY_ID,
    category,
    title,
    occurredAt: daysAgoIso(daysAgo),
    description,
    sources: [src(url, sourceType, daysAgo, description)],
  };
}

const BEATS: Beat[] = [
  // ── Series D: $300M at $10B ───────────────────────────────────────────
  beat({
    id: 'wiz-series-d',
    source: 'serp_news',
    url: 'https://techcrunch.com/2023/02/27/cloud-security-startup-wiz-now-valued-at-10b-raises-300m/',
    title: 'Cloud security startup Wiz, now valued at $10B, raises $300M',
    body: 'Wiz raised a $300 million Series D at a $10 billion valuation led by Lightspeed Venture Partners and Greenoaks Capital, even as broader tech valuations fell. CEO Assaf Rappaport said the company crossed $100M ARR faster than any software startup.',
    publishedDaysAgo: 178,
    entities: [
      company(COMPANY),
      person('Assaf Rappaport', { role: 'CEO' }, 178),
      company('Lightspeed Venture Partners', 178),
      company('Greenoaks Capital', 178),
    ],
    relations: [
      rel('lightspeed-venture-partners', COMPANY_ID, 'invested_in', 178, {
        evidence: 'a $300 million Series D round led by Lightspeed Venture Partners and Greenoaks Capital',
        confidence: 0.95,
        sourceType: 'serp_news',
        url: 'https://techcrunch.com/2023/02/27/cloud-security-startup-wiz-now-valued-at-10b-raises-300m/',
        attributes: { amount: 300, valuation: 10000, round: 'Series D' },
      }),
      rel('greenoaks-capital', COMPANY_ID, 'invested_in', 178, {
        evidence: 'led by Lightspeed Venture Partners and Greenoaks Capital',
        confidence: 0.9,
        sourceType: 'serp_news',
        url: 'https://techcrunch.com/2023/02/27/cloud-security-startup-wiz-now-valued-at-10b-raises-300m/',
      }),
      rel('assaf-rappaport', COMPANY_ID, 'reports_to', 178, {
        evidence: 'CEO Assaf Rappaport',
        confidence: 0.9,
        sourceType: 'serp_news',
        url: 'https://techcrunch.com/2023/02/27/cloud-security-startup-wiz-now-valued-at-10b-raises-300m/',
      }),
    ],
    events: [
      evt('fundraise', 'Series D — $300M at $10B', 178, 'Wiz raises $300M led by Lightspeed and Greenoaks at a $10B valuation.',
        'https://techcrunch.com/2023/02/27/cloud-security-startup-wiz-now-valued-at-10b-raises-300m/'),
    ],
  }),

  // ── Acquires Gem Security ─────────────────────────────────────────────
  beat({
    id: 'wiz-acquires-gem',
    source: 'serp_news',
    url: 'https://fortune.com/2024/04/10/exclusive-wiz-acquires-gem-security/',
    title: 'Exclusive: Wiz acquires Gem Security',
    body: 'Wiz agreed to acquire cloud threat-detection startup Gem Security for roughly $350 million, expanding into cloud detection and response (CDR) as it builds an end-to-end security platform.',
    publishedDaysAgo: 150,
    entities: [company(COMPANY), company('Gem Security', 150)],
    relations: [
      rel(COMPANY_ID, 'gem-security', 'acquired', 150, {
        evidence: 'Wiz acquires Gem Security for around $350 million',
        confidence: 0.93,
        sourceType: 'serp_news',
        url: 'https://fortune.com/2024/04/10/exclusive-wiz-acquires-gem-security/',
        attributes: { price: 350 },
      }),
    ],
    events: [
      evt('mna', 'Acquires Gem Security (~$350M)', 150, 'Wiz buys cloud detection-and-response startup Gem Security.',
        'https://fortune.com/2024/04/10/exclusive-wiz-acquires-gem-security/'),
    ],
  }),

  // ── Raises $1B at $12B ────────────────────────────────────────────────
  beat({
    id: 'wiz-raises-1b',
    source: 'serp_news',
    url: 'https://techcrunch.com/2024/05/07/wiz-raises-1b-at-12b-valuation-expanding-through-acquisitions/',
    title: 'Wiz raises $1B at $12B valuation, expanding through acquisitions',
    body: 'Wiz closed a $1 billion round at a $12 billion valuation, co-led by Andreessen Horowitz, Lightspeed, and Thrive Capital, earmarking capital for acquisitions and a push toward $1B in ARR.',
    publishedDaysAgo: 140,
    entities: [
      company(COMPANY),
      company('Andreessen Horowitz', 140),
      company('Thrive Capital', 140),
    ],
    relations: [
      rel('andreessen-horowitz', COMPANY_ID, 'invested_in', 140, {
        evidence: 'a $1 billion round co-led by Andreessen Horowitz and Thrive Capital',
        confidence: 0.94,
        sourceType: 'serp_news',
        url: 'https://techcrunch.com/2024/05/07/wiz-raises-1b-at-12b-valuation-expanding-through-acquisitions/',
        attributes: { amount: 1000, valuation: 12000 },
      }),
      rel('thrive-capital', COMPANY_ID, 'invested_in', 140, {
        evidence: 'co-led by Andreessen Horowitz and Thrive Capital',
        confidence: 0.9,
        sourceType: 'serp_news',
        url: 'https://techcrunch.com/2024/05/07/wiz-raises-1b-at-12b-valuation-expanding-through-acquisitions/',
      }),
    ],
    events: [
      evt('fundraise', 'Raises $1B at $12B', 140, 'Mega-round co-led by a16z and Thrive to fund acquisitions.',
        'https://techcrunch.com/2024/05/07/wiz-raises-1b-at-12b-valuation-expanding-through-acquisitions/'),
    ],
  }),

  // ── Walks away from Google's $23B offer ───────────────────────────────
  beat({
    id: 'wiz-rejects-google-23b',
    source: 'serp_news',
    url: 'https://techcrunch.com/2024/07/22/wiz-walks-away-from-googles-23b-acquisition-offer-read-the-ceos-note-to-employees/',
    title: "Wiz walks away from Google's $23B acquisition offer",
    body: "In a note to employees, CEO Assaf Rappaport said Wiz turned down Google's roughly $23 billion acquisition offer to pursue an IPO and a target of $1 billion in ARR.",
    publishedDaysAgo: 120,
    entities: [
      company(COMPANY),
      company('Google', 120),
      person('Assaf Rappaport', { role: 'CEO' }, 120),
    ],
    relations: [
      rel('google', COMPANY_ID, 'mentioned_in', 120, {
        evidence: "Wiz walks away from Google's $23 billion acquisition offer",
        confidence: 0.92,
        sourceType: 'serp_news',
        url: 'https://techcrunch.com/2024/07/22/wiz-walks-away-from-googles-23b-acquisition-offer-read-the-ceos-note-to-employees/',
        attributes: { offer: 23000, outcome: 'rejected' },
      }),
    ],
    events: [
      evt('mna', "Rejects Google's $23B offer", 120, 'Wiz turns down Google to pursue an IPO and $1B ARR.',
        'https://techcrunch.com/2024/07/22/wiz-walks-away-from-googles-23b-acquisition-offer-read-the-ceos-note-to-employees/'),
    ],
  }),

  // ── $500M ARR milestone ───────────────────────────────────────────────
  beat({
    id: 'wiz-500m-arr',
    source: 'serp_news',
    url: 'https://techcrunch.com/2024/10/23/wiz-hopes-to-hit-1b-in-arr-in-2025-before-an-ipo-after-turning-down-googles-23b/',
    title: 'Wiz hopes to hit $1B in ARR in 2025 before an IPO',
    body: 'Wiz disclosed it reached roughly $500 million in ARR, more than doubling year over year, and aims for $1 billion in ARR in 2025 ahead of a planned IPO. VP of R&D Roy Reznik detailed the platform roadmap.',
    publishedDaysAgo: 95,
    entities: [
      company(COMPANY),
      person('Roy Reznik', { role: 'VP R&D' }, 95),
    ],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'mentioned_in', 95, {
        evidence: 'reached around $500 million in ARR, more than doubling year over year',
        confidence: 0.9,
        sourceType: 'serp_news',
        url: 'https://techcrunch.com/2024/10/23/wiz-hopes-to-hit-1b-in-arr-in-2025-before-an-ipo-after-turning-down-googles-23b/',
        attributes: { arr: 500, yoyGrowth: 103 },
      }),
      rel('roy-reznik', COMPANY_ID, 'reports_to', 95, {
        evidence: 'VP of R&D Roy Reznik',
        confidence: 0.85,
        sourceType: 'serp_news',
        url: 'https://techcrunch.com/2024/10/23/wiz-hopes-to-hit-1b-in-arr-in-2025-before-an-ipo-after-turning-down-googles-23b/',
      }),
    ],
    events: [
      evt('earnings', '$500M ARR milestone', 95, 'ARR roughly doubles YoY to ~$500M; targets $1B in 2025.',
        'https://techcrunch.com/2024/10/23/wiz-hopes-to-hit-1b-in-arr-in-2025-before-an-ipo-after-turning-down-googles-23b/'),
    ],
  }),

  // ── Acquires Dazz ─────────────────────────────────────────────────────
  beat({
    id: 'wiz-acquires-dazz',
    source: 'serp_news',
    url: 'https://techcrunch.com/2024/11/21/wiz-acquires-dazz-for-450m-to-expand-its-cybersecurity-platform/',
    title: 'Wiz acquires Dazz for $450M to expand its cybersecurity platform',
    body: 'Wiz agreed to acquire security remediation and risk-management startup Dazz for $450 million, adding application security posture management to its cloud platform.',
    publishedDaysAgo: 75,
    entities: [company(COMPANY), company('Dazz', 75)],
    relations: [
      rel(COMPANY_ID, 'dazz', 'acquired', 75, {
        evidence: 'Wiz acquires Dazz for $450 million',
        confidence: 0.93,
        sourceType: 'serp_news',
        url: 'https://techcrunch.com/2024/11/21/wiz-acquires-dazz-for-450m-to-expand-its-cybersecurity-platform/',
        attributes: { price: 450 },
      }),
    ],
    events: [
      evt('mna', 'Acquires Dazz ($450M)', 75, 'Wiz adds remediation/ASPM via the Dazz acquisition.',
        'https://techcrunch.com/2024/11/21/wiz-acquires-dazz-for-450m-to-expand-its-cybersecurity-platform/'),
    ],
  }),

  // ── Launches Wiz Defend ───────────────────────────────────────────────
  beat({
    id: 'wiz-launches-defend',
    source: 'corporate_site',
    url: 'https://www.wiz.io/blog/introducing-wiz-defend',
    title: 'Introducing Wiz Defend',
    body: 'Wiz launched Wiz Defend, a cloud detection and response product that extends the platform from prevention into real-time threat detection across cloud workloads.',
    publishedDaysAgo: 65,
    entities: [
      company(COMPANY),
      {
        id: 'wiz-defend',
        type: 'product' as const,
        name: 'Wiz Defend',
        aliases: [],
        attributes: { category: 'cloud detection and response' },
        sources: [] as SourceRef[],
        observedAt: daysAgoIso(65),
      },
    ],
    relations: [
      rel(COMPANY_ID, 'wiz-defend', 'launched', 65, {
        evidence: 'Introducing Wiz Defend, a cloud detection and response product',
        confidence: 0.92,
        sourceType: 'corporate_site',
        url: 'https://www.wiz.io/blog/introducing-wiz-defend',
      }),
    ],
    events: [
      evt('product_launch', 'Launches Wiz Defend', 65, 'New CDR product extends Wiz from prevention into detection and response.',
        'https://www.wiz.io/blog/introducing-wiz-defend', 'corporate_site'),
    ],
  }),

  // ── Google acquires Wiz for $32B ──────────────────────────────────────
  beat({
    id: 'wiz-google-acquires-32b',
    source: 'corporate_site',
    url: 'https://blog.google/inside-google/company-announcements/google-agreement-acquire-wiz/',
    title: 'Google signs definitive agreement to acquire Wiz',
    body: 'Google agreed to acquire Wiz for $32 billion in an all-cash deal — its largest acquisition ever — to be folded into Google Cloud. Google Cloud CEO Thomas Kurian said Wiz will continue to operate across multiple clouds.',
    publishedDaysAgo: 40,
    entities: [
      company(COMPANY),
      company('Google', 40),
      person('Thomas Kurian', { role: 'Google Cloud CEO' }, 40),
    ],
    relations: [
      rel('google', COMPANY_ID, 'acquired', 40, {
        evidence: 'Google has signed a definitive agreement to acquire Wiz for $32 billion',
        confidence: 0.97,
        sourceType: 'corporate_site',
        url: 'https://blog.google/inside-google/company-announcements/google-agreement-acquire-wiz/',
        attributes: { price: 32000, structure: 'all-cash' },
      }),
    ],
    events: [
      evt('mna', 'Google to acquire Wiz for $32B', 40, "Google's largest-ever acquisition; Wiz folds into Google Cloud.",
        'https://blog.google/inside-google/company-announcements/google-agreement-acquire-wiz/', 'corporate_site'),
    ],
  }),

  // ── Glassdoor sentiment ───────────────────────────────────────────────
  beat({
    id: 'wiz-glassdoor',
    source: 'glassdoor_reviews',
    url: 'https://www.glassdoor.com/Reviews/Wiz-Reviews-E5304442.htm',
    title: 'Glassdoor reviews — Wiz',
    body: 'Wiz holds roughly 4.8/5 on Glassdoor. Reviewers cite a fast-paced, high-talent culture and strong leadership; cons mention intensity and rapid change during hypergrowth.',
    publishedDaysAgo: 20,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'reviewed_positively', 20, {
        evidence: 'employees rate Wiz highly, citing strong leadership and a high-talent culture',
        confidence: 0.85,
        sourceType: 'glassdoor_reviews',
        url: 'https://www.glassdoor.com/Reviews/Wiz-Reviews-E5304442.htm',
        attributes: { ratingNow: 4.8, ratingPrev: 4.6, deltaStars: 0.2 },
      }),
    ],
    events: [],
  }),
];

export const WIZ_DOCS: RawDoc[] = BEATS.map((b) => b.doc);

export const WIZ_EXTRACTIONS: Record<string, ExtractionResult> = Object.fromEntries(
  BEATS.map((b) => [b.doc.id, b.extraction]),
);
