/**
 * Demo fixtures — Spirit Airlines (spirit.com).
 *
 * A distress / bankruptcy arc. Every source URL below is a REAL, verified
 * article (news, SEC, Glassdoor) so each cited claim opens the exact post —
 * same as the live pipeline. Dates are anchored relative to *now* via
 * daysAgoIso() so the collapse plays out across the slider window.
 */

import {
  type RawDoc,
  type ExtractionResult,
  type SourceRef,
  type SourceType,
  daysAgoIso,
  slugify,
} from '@/lib/schema';

const COMPANY = 'Spirit Airlines';
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
    id: `evt-spirit-${slugify(title)}-${daysAgo}`,
    companyId: COMPANY_ID,
    category,
    title,
    occurredAt: daysAgoIso(daysAgo),
    description,
    sources: [src(url, sourceType, daysAgo, description)],
  };
}

const BEATS: Beat[] = [
  // ── Judge blocks JetBlue–Spirit merger ────────────────────────────────
  beat({
    id: 'spirit-merger-blocked',
    source: 'serp_news',
    url: 'https://www.cnbc.com/2024/01/16/jetblue-spirit-merger-block-in-win-for-bidens-justice-department.html',
    title: 'Judge blocks JetBlue-Spirit merger after DOJ antitrust challenge',
    body: 'U.S. District Judge William Young blocked JetBlue\'s $3.8 billion acquisition of Spirit on antitrust grounds, ruling the deal would harm consumers reliant on Spirit\'s ultra-low-cost model.',
    publishedDaysAgo: 172,
    entities: [
      company(COMPANY),
      company('JetBlue Airways', 172),
      {
        id: 'doj-antitrust-block',
        type: 'lawsuit' as const,
        name: 'DOJ Antitrust Challenge (JetBlue/Spirit)',
        aliases: [],
        attributes: { court: 'D. Mass.', type: 'antitrust' },
        sources: [] as SourceRef[],
        observedAt: daysAgoIso(172),
      },
    ],
    relations: [
      rel(COMPANY_ID, 'doj-antitrust-block', 'litigated_with', 172, {
        evidence: 'a federal judge blocked the $3.8 billion deal because of antitrust concerns',
        confidence: 0.95,
        sourceType: 'serp_news',
        url: 'https://www.cnbc.com/2024/01/16/jetblue-spirit-merger-block-in-win-for-bidens-justice-department.html',
      }),
      rel('jetblue-airways', COMPANY_ID, 'mentioned_in', 172, {
        evidence: 'JetBlue\'s $3.8 billion acquisition of Spirit',
        confidence: 0.9,
        sourceType: 'serp_news',
        url: 'https://www.cnbc.com/2024/01/16/jetblue-spirit-merger-block-in-win-for-bidens-justice-department.html',
      }),
    ],
    events: [
      evt('mna', 'JetBlue–Spirit merger blocked', 172, 'Federal judge blocks the $3.8B acquisition on antitrust grounds.',
        'https://www.cnbc.com/2024/01/16/jetblue-spirit-merger-block-in-win-for-bidens-justice-department.html'),
    ],
  }),

  // ── JetBlue terminates the merger agreement ───────────────────────────
  beat({
    id: 'spirit-merger-terminated',
    source: 'serp_news',
    url: 'https://www.cbsnews.com/news/jetblue-spirit-airlines-end-merger/',
    title: 'JetBlue scraps $3.8 billion deal to buy Spirit Airlines',
    body: 'JetBlue and Spirit mutually agreed to terminate their merger agreement after the antitrust block made closing unlikely. JetBlue paid Spirit $69 million to resolve outstanding matters.',
    publishedDaysAgo: 150,
    entities: [company(COMPANY), company('JetBlue Airways', 150)],
    relations: [
      rel('jetblue-airways', COMPANY_ID, 'mentioned_in', 150, {
        evidence: 'reached an agreement with Spirit Airlines to terminate their merger agreement',
        confidence: 0.94,
        sourceType: 'serp_news',
        url: 'https://www.cbsnews.com/news/jetblue-spirit-airlines-end-merger/',
      }),
    ],
    events: [
      evt('mna', 'JetBlue terminates merger', 150, 'Merger agreement scrapped; JetBlue pays Spirit $69M to resolve matters.',
        'https://www.cbsnews.com/news/jetblue-spirit-airlines-end-merger/'),
    ],
  }),

  // ── Pratt & Whitney GTF engine groundings ─────────────────────────────
  beat({
    id: 'spirit-pw-engine-groundings',
    source: 'serp_news',
    url: 'https://simpleflying.com/pratt-whitney-engine-spirit-airlines-compensation-200m/',
    title: 'Pratt & Whitney engine issues see Spirit Airlines up $200M in compensation',
    body: 'Pratt & Whitney\'s GTF powdered-metal recall forced Spirit to ground a growing share of its A320neo fleet; Spirit signed a compensation deal worth $150M–$200M through 2024, but expected ~40 jets grounded.',
    publishedDaysAgo: 135,
    entities: [
      company(COMPANY),
      company('Pratt & Whitney', 135),
      {
        id: 'gtf-engines',
        type: 'product' as const,
        name: 'Pratt & Whitney GTF engines',
        aliases: ['PW1100G'],
        attributes: { issue: 'powdered-metal recall' },
        sources: [] as SourceRef[],
        observedAt: daysAgoIso(135),
      },
    ],
    relations: [
      rel('pratt-whitney', COMPANY_ID, 'partnered_with', 135, {
        evidence: 'IAE would provide Spirit monthly credit as compensation for each aircraft unavailable due to GTF engine issues',
        confidence: 0.88,
        sourceType: 'serp_news',
        url: 'https://simpleflying.com/pratt-whitney-engine-spirit-airlines-compensation-200m/',
        attributes: { compensation: 200, groundedAircraft: 40 },
      }),
    ],
    events: [
      evt('press_release', 'P&W engine groundings hit fleet', 135, 'GTF recall grounds ~40 A320neo jets; $150M–$200M compensation.',
        'https://simpleflying.com/pratt-whitney-engine-spirit-airlines-compensation-200m/'),
    ],
  }),

  // ── Airbus deferrals + pilot furloughs ────────────────────────────────
  beat({
    id: 'spirit-airbus-deferral-furloughs',
    source: 'serp_news',
    url: 'https://www.flightglobal.com/analysis/spirit-defers-airbus-deliveries-and-cuts-pilots-in-turnaround-push/159446.article',
    title: 'Spirit defers Airbus deliveries and cuts pilots in turnaround push',
    body: 'Spirit deferred all Airbus aircraft scheduled for Q2 2025–end-2026 out to 2030–2031, improving liquidity ~$340M, and announced furloughs of roughly 260 pilots effective September 1.',
    publishedDaysAgo: 120,
    entities: [company(COMPANY), company('Airbus', 120)],
    relations: [
      rel(COMPANY_ID, 'airbus', 'partnered_with', 120, {
        evidence: 'Spirit reached an agreement with Airbus to defer all aircraft to 2030-2031',
        confidence: 0.9,
        sourceType: 'serp_news',
        url: 'https://www.flightglobal.com/analysis/spirit-defers-airbus-deliveries-and-cuts-pilots-in-turnaround-push/159446.article',
        attributes: { liquidity: 340 },
      }),
      rel(COMPANY_ID, COMPANY_ID, 'laid_off', 120, {
        evidence: 'intends to furlough approximately 260 pilots',
        confidence: 0.92,
        sourceType: 'serp_news',
        url: 'https://www.flightglobal.com/analysis/spirit-defers-airbus-deliveries-and-cuts-pilots-in-turnaround-push/159446.article',
        attributes: { headcountCut: 260, group: 'pilots' },
      }),
    ],
    events: [
      evt('layoff', 'Furlough ~260 pilots', 120, 'Spirit furloughs ~260 pilots and defers Airbus deliveries to 2030–2031.',
        'https://www.flightglobal.com/analysis/spirit-defers-airbus-deliveries-and-cuts-pilots-in-turnaround-push/159446.article'),
    ],
  }),

  // ── Q2 2024 loss widens (SEC) ─────────────────────────────────────────
  beat({
    id: 'spirit-q2-loss',
    source: 'sec_edgar',
    url: 'https://www.sec.gov/Archives/edgar/data/0001498710/000149871024000195/earningsrelease2q24.htm',
    title: 'Spirit Airlines reports second quarter 2024 results',
    body: 'Spirit\'s Q2 2024 net loss widened to $192.9 million (diluted loss per share $1.76) amid a weak domestic-fare environment and grounded aircraft.',
    publishedDaysAgo: 95,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'mentioned_in', 95, {
        evidence: 'net loss of $192.9 million, or a diluted loss per share of $1.76',
        confidence: 0.9,
        sourceType: 'sec_edgar',
        url: 'https://www.sec.gov/Archives/edgar/data/0001498710/000149871024000195/earningsrelease2q24.htm',
        attributes: { netLoss: 192.9, dilutedEps: -1.76 },
      }),
    ],
    events: [
      evt('earnings', 'Q2 net loss $192.9M', 95, 'Loss widens sharply amid weak fares and grounded jets.',
        'https://www.sec.gov/Archives/edgar/data/0001498710/000149871024000195/earningsrelease2q24.htm', 'sec_edgar'),
    ],
  }),

  // ── Exploring bankruptcy; shares plunge ───────────────────────────────
  beat({
    id: 'spirit-exploring-bankruptcy',
    source: 'serp_news',
    url: 'https://www.cnbc.com/2024/10/04/spirit-airlines-tumbles-exploring-bankruptcy-filing.html',
    title: 'Spirit Airlines tumbles on report it is exploring bankruptcy filing',
    body: 'Spirit stock plunged about 59% after reports it was preparing to file for bankruptcy as Frontier merger talks collapsed and it faced renegotiating more than $1 billion in debt.',
    publishedDaysAgo: 70,
    entities: [company(COMPANY), company('Frontier Airlines', 70)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'mentioned_in', 70, {
        evidence: 'exploring a deal with creditors to restructure its debt amid a reported threat of bankruptcy',
        confidence: 0.9,
        sourceType: 'serp_news',
        url: 'https://www.cnbc.com/2024/10/04/spirit-airlines-tumbles-exploring-bankruptcy-filing.html',
        attributes: { stockMove: -59, debt: 1000 },
      }),
      rel('frontier-airlines', COMPANY_ID, 'mentioned_in', 70, {
        evidence: 'Frontier merger talks collapsed',
        confidence: 0.85,
        sourceType: 'serp_news',
        url: 'https://www.cnbc.com/2024/10/04/spirit-airlines-tumbles-exploring-bankruptcy-filing.html',
      }),
    ],
    events: [
      evt('press_release', 'Exploring bankruptcy; shares −59%', 70, 'Bankruptcy preparations reported; Frontier merger talks collapse.',
        'https://www.cnbc.com/2024/10/04/spirit-airlines-tumbles-exploring-bankruptcy-filing.html'),
    ],
  }),

  // ── Chapter 11 filing ─────────────────────────────────────────────────
  beat({
    id: 'spirit-chapter-11',
    source: 'serp_news',
    url: 'https://www.npr.org/2024/11/18/nx-s1-5195224/spirit-airlines-bankruptcy-protection',
    title: 'Spirit Airlines files for bankruptcy protection but plans to keep flying',
    body: 'Spirit filed Chapter 11 in the Southern District of New York with a prearranged plan: $350M equity investment, $795M of debt equitized, and $300M of DIP financing. NYSE moved to delist SAVE the same day.',
    publishedDaysAgo: 55,
    entities: [
      company(COMPANY),
      {
        id: 'spirit-chapter-11-petition',
        type: 'document' as const,
        name: 'Spirit Chapter 11 Petition (SDNY)',
        aliases: [],
        attributes: { court: 'Bankr. S.D.N.Y.', chapter: 11 },
        sources: [] as SourceRef[],
        observedAt: daysAgoIso(55),
      },
    ],
    relations: [
      rel(COMPANY_ID, 'spirit-chapter-11-petition', 'filed_with_sec', 55, {
        evidence: 'filed for Chapter 11 bankruptcy on November 18, 2024',
        confidence: 0.96,
        sourceType: 'serp_news',
        url: 'https://www.npr.org/2024/11/18/nx-s1-5195224/spirit-airlines-bankruptcy-protection',
        attributes: { equityInvestment: 350, debtEquitized: 795, dip: 300 },
      }),
    ],
    events: [
      evt('sec_filing', 'Chapter 11 filed', 55, 'Prearranged restructuring; NYSE delists SAVE same day.',
        'https://www.npr.org/2024/11/18/nx-s1-5195224/spirit-airlines-bankruptcy-protection'),
    ],
  }),

  // ── CEO Ted Christie resigns ──────────────────────────────────────────
  beat({
    id: 'spirit-ceo-resigns',
    source: 'serp_news',
    url: 'https://www.cnbc.com/2025/04/07/spirit-airlines-ceo-ted-christie-steps-down.html',
    title: 'Spirit Airlines CEO Ted Christie steps down',
    body: 'President and CEO Ted Christie resigned from Spirit and its board, just after the airline emerged from bankruptcy. Chief Commercial Officer Matt Klein also departed; an executive office took over.',
    publishedDaysAgo: 30,
    entities: [
      company(COMPANY),
      person('Ted Christie', { role: 'CEO' }, 30),
      person('Matt Klein', { role: 'CCO' }, 30),
    ],
    relations: [
      rel('ted-christie', COMPANY_ID, 'departed', 30, {
        evidence: 'Ted Christie stepped down from the Company and from the Board of Directors',
        confidence: 0.97,
        sourceType: 'serp_news',
        url: 'https://www.cnbc.com/2025/04/07/spirit-airlines-ceo-ted-christie-steps-down.html',
      }),
      rel('matt-klein', COMPANY_ID, 'departed', 30, {
        evidence: 'Chief Commercial Officer Matt Klein also departed',
        confidence: 0.9,
        sourceType: 'serp_news',
        url: 'https://www.cnbc.com/2025/04/07/spirit-airlines-ceo-ted-christie-steps-down.html',
      }),
    ],
    events: [
      evt('leadership_change', 'CEO Ted Christie resigns', 30, 'CEO and CCO depart weeks after emerging from Chapter 11.',
        'https://www.cnbc.com/2025/04/07/spirit-airlines-ceo-ted-christie-steps-down.html'),
    ],
  }),

  // ── Glassdoor sentiment ───────────────────────────────────────────────
  beat({
    id: 'spirit-glassdoor',
    source: 'glassdoor_reviews',
    url: 'https://www.glassdoor.com/Reviews/Spirit-Airlines-Reviews-E13683.htm',
    title: 'Glassdoor reviews — Spirit Airlines',
    body: 'Spirit holds roughly 3.6/5 across 1,700+ reviews. Common cons cite management instability and scheduling friction during the restructuring; pros cite flight benefits and coworkers.',
    publishedDaysAgo: 20,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'reviewed_negatively', 20, {
        evidence: 'employees commonly mention management instability and scheduling friction as cons',
        confidence: 0.84,
        sourceType: 'glassdoor_reviews',
        url: 'https://www.glassdoor.com/Reviews/Spirit-Airlines-Reviews-E13683.htm',
        attributes: { ratingNow: 3.6, ratingPrev: 3.9, deltaStars: -0.3 },
      }),
    ],
    events: [],
  }),
];

export const SPIRIT_DOCS: RawDoc[] = BEATS.map((b) => b.doc);

export const SPIRIT_EXTRACTIONS: Record<string, ExtractionResult> = Object.fromEntries(
  BEATS.map((b) => [b.doc.id, b.extraction]),
);
