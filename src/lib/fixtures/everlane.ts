/**
 * Demo fixtures — Everlane (everlane.com).
 *
 * A mixed / brand-under-pressure arc: pandemic union layoffs, a transparency
 * backlash, repeated CEO churn, and an eventual Shein acquisition. Every
 * source URL below is a REAL, verified article (news, NLRB, corporate site,
 * Glassdoor) so each cited claim opens the exact post. Dates are anchored
 * relative to *now* via daysAgoIso().
 */

import {
  type RawDoc,
  type ExtractionResult,
  type SourceRef,
  type SourceType,
  daysAgoIso,
  slugify,
} from '@/lib/schema';

const COMPANY = 'Everlane';
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
    id: `evt-everlane-${slugify(title)}-${daysAgo}`,
    companyId: COMPANY_ID,
    category,
    title,
    occurredAt: daysAgoIso(daysAgo),
    description,
    sources: [src(url, sourceType, daysAgo, description)],
  };
}

const BEATS: Beat[] = [
  // ── 2020 pandemic union layoffs + NLRB charge ─────────────────────────
  beat({
    id: 'everlane-union-layoffs',
    source: 'serp_news',
    url: 'https://fashionista.com/2020/04/everlane-union-bust-covid-19',
    title: 'Everlane laid off customer-experience staff amid union drive',
    body: 'Everlane laid off about 42 customer-experience employees during the pandemic, a group that had been organizing to unionize. Workers filed an unfair-labor-practice charge with the NLRB; founder and CEO Michael Preysman faced public criticism.',
    publishedDaysAgo: 170,
    entities: [
      company(COMPANY),
      person('Michael Preysman', { role: 'Founder & CEO' }, 170),
      {
        id: 'nlrb-everlane-charge',
        type: 'lawsuit' as const,
        name: 'NLRB Case 20-CA-261166',
        aliases: [],
        attributes: { agency: 'NLRB', type: 'unfair labor practice' },
        sources: [] as SourceRef[],
        observedAt: daysAgoIso(170),
      },
    ],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'laid_off', 170, {
        evidence: 'Everlane laid off roughly 42 customer-experience workers who had been organizing',
        confidence: 0.88,
        sourceType: 'serp_news',
        url: 'https://fashionista.com/2020/04/everlane-union-bust-covid-19',
        attributes: { headcountCut: 42, group: 'customer experience' },
      }),
      rel(COMPANY_ID, 'nlrb-everlane-charge', 'litigated_with', 170, {
        evidence: 'workers filed an unfair labor practice charge with the NLRB',
        confidence: 0.85,
        sourceType: 'serp_news',
        url: 'https://www.nlrb.gov/case/20-CA-261166',
      }),
    ],
    events: [
      evt('layoff', 'Union-drive layoffs (42)', 170, 'Everlane cuts ~42 organizing CX workers; NLRB charge filed.',
        'https://fashionista.com/2020/04/everlane-union-bust-covid-19'),
    ],
  }),

  // ── Transparency backlash ─────────────────────────────────────────────
  beat({
    id: 'everlane-transparency-backlash',
    source: 'serp_news',
    url: 'https://www.fastcompany.com/90484028/bernie-sanders-picks-a-twitter-fight-with-everlanes-ceo',
    title: "Bernie Sanders picks a Twitter fight with Everlane's CEO",
    body: "Senator Bernie Sanders publicly criticized Everlane over its treatment of workers seeking to unionize, undercutting the brand's 'radical transparency' positioning and drawing wider scrutiny of its labor practices.",
    publishedDaysAgo: 165,
    entities: [company(COMPANY), person('Michael Preysman', { role: 'Founder & CEO' }, 165)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'reviewed_negatively', 165, {
        evidence: "criticism over the gap between Everlane's 'radical transparency' branding and its labor practices",
        confidence: 0.82,
        sourceType: 'serp_news',
        url: 'https://www.fastcompany.com/90484028/bernie-sanders-picks-a-twitter-fight-with-everlanes-ceo',
        attributes: { topic: 'transparency / labor' },
      }),
    ],
    events: [
      evt('press_release', 'Transparency backlash', 165, "Public criticism undercuts Everlane's 'radical transparency' brand.",
        'https://www.fastcompany.com/90484028/bernie-sanders-picks-a-twitter-fight-with-everlanes-ceo'),
    ],
  }),

  // ── Preysman steps back; O'Donnell named CEO ──────────────────────────
  beat({
    id: 'everlane-odonnell-ceo',
    source: 'serp_news',
    url: 'https://www.retaildive.com/news/everlane-taps-ugg-exec-as-new-chief-executive/607456/',
    title: 'Everlane taps UGG exec as new chief executive',
    body: "Everlane named Andrea O'Donnell, a Deckers Brands executive who led UGG, as CEO. Founder Michael Preysman stepped back from day-to-day leadership into an executive chair role.",
    publishedDaysAgo: 140,
    entities: [
      company(COMPANY),
      person("Andrea O'Donnell", { role: 'CEO' }, 140),
      person('Michael Preysman', { role: 'Founder' }, 140),
      company('Deckers Brands', 140),
    ],
    relations: [
      rel('andrea-o-donnell', COMPANY_ID, 'joined', 140, {
        evidence: "Everlane named Andrea O'Donnell as chief executive",
        confidence: 0.93,
        sourceType: 'serp_news',
        url: 'https://www.retaildive.com/news/everlane-taps-ugg-exec-as-new-chief-executive/607456/',
      }),
      rel('michael-preysman', COMPANY_ID, 'departed', 140, {
        evidence: 'founder Michael Preysman stepped back from day-to-day leadership',
        confidence: 0.85,
        sourceType: 'serp_news',
        url: 'https://www.retaildive.com/news/everlane-taps-ugg-exec-as-new-chief-executive/607456/',
        attributes: { transition: 'to executive chair' },
      }),
    ],
    events: [
      evt('leadership_change', "Andrea O'Donnell named CEO", 140, "Ex-UGG/Deckers exec takes over; Preysman steps back.",
        'https://www.retaildive.com/news/everlane-taps-ugg-exec-as-new-chief-executive/607456/'),
    ],
  }),

  // ── Store expansion ───────────────────────────────────────────────────
  beat({
    id: 'everlane-king-of-prussia',
    source: 'serp_news',
    url: 'https://vista.today/2022/09/everlane-king-of-prussia-debut/',
    title: 'Everlane debuts at King of Prussia',
    body: 'Everlane opened a physical store at the King of Prussia mall in Pennsylvania, part of a brick-and-mortar expansion beyond its direct-to-consumer roots.',
    publishedDaysAgo: 110,
    entities: [
      company(COMPANY),
      {
        id: 'king-of-prussia',
        type: 'location' as const,
        name: 'King of Prussia, PA',
        aliases: [],
        attributes: { venue: 'King of Prussia Mall' },
        sources: [] as SourceRef[],
        observedAt: daysAgoIso(110),
      },
    ],
    relations: [
      rel(COMPANY_ID, 'king-of-prussia', 'expanded_to', 110, {
        evidence: 'Everlane opened a store at the King of Prussia mall',
        confidence: 0.88,
        sourceType: 'serp_news',
        url: 'https://vista.today/2022/09/everlane-king-of-prussia-debut/',
      }),
    ],
    events: [
      evt('press_release', 'Opens King of Prussia store', 110, 'Brick-and-mortar expansion beyond DTC.',
        'https://vista.today/2022/09/everlane-king-of-prussia-debut/'),
    ],
  }),

  // ── No New Plastic pledge ─────────────────────────────────────────────
  beat({
    id: 'everlane-no-new-plastic',
    source: 'corporate_site',
    url: 'https://www.everlane.com/plastic',
    title: 'No New Plastic',
    body: 'Everlane launched its "No New Plastic" initiative, pledging to eliminate virgin plastic from its supply chain and products as part of its sustainability positioning.',
    publishedDaysAgo: 90,
    entities: [
      company(COMPANY),
      {
        id: 'no-new-plastic',
        type: 'product' as const,
        name: 'No New Plastic',
        aliases: [],
        attributes: { category: 'sustainability initiative' },
        sources: [] as SourceRef[],
        observedAt: daysAgoIso(90),
      },
    ],
    relations: [
      rel(COMPANY_ID, 'no-new-plastic', 'launched', 90, {
        evidence: 'Everlane pledged to eliminate virgin plastic through its No New Plastic initiative',
        confidence: 0.85,
        sourceType: 'corporate_site',
        url: 'https://www.everlane.com/plastic',
      }),
    ],
    events: [
      evt('product_launch', 'No New Plastic pledge', 90, 'Sustainability initiative to eliminate virgin plastic.',
        'https://www.everlane.com/plastic', 'corporate_site'),
    ],
  }),

  // ── O'Donnell departs; Alfred Chang joins ─────────────────────────────
  beat({
    id: 'everlane-chang-ceo',
    source: 'serp_news',
    url: 'https://www.retaildive.com/news/everlane-ceo-designer-brands-brand-chief-andrea-odonnell/705296/',
    title: "Everlane CEO Andrea O'Donnell to depart for Designer Brands",
    body: "Andrea O'Donnell left Everlane to become a brand chief at Designer Brands. Everlane elevated Alfred Chang, a former Fear of God and PacSun executive, to CEO.",
    publishedDaysAgo: 60,
    entities: [
      company(COMPANY),
      person("Andrea O'Donnell", { role: 'CEO' }, 60),
      person('Alfred Chang', { role: 'CEO' }, 60),
      company('Designer Brands', 60),
    ],
    relations: [
      rel('andrea-o-donnell', COMPANY_ID, 'departed', 60, {
        evidence: "Andrea O'Donnell departed Everlane for a brand-chief role at Designer Brands",
        confidence: 0.92,
        sourceType: 'serp_news',
        url: 'https://www.retaildive.com/news/everlane-ceo-designer-brands-brand-chief-andrea-odonnell/705296/',
      }),
      rel('alfred-chang', COMPANY_ID, 'joined', 60, {
        evidence: 'Everlane elevated Alfred Chang to chief executive',
        confidence: 0.9,
        sourceType: 'serp_news',
        url: 'https://www.retaildive.com/news/fear-of-god-pacsun-executive-everlane-ceo-alfred-chang/728654/',
      }),
    ],
    events: [
      evt('leadership_change', "O'Donnell out, Alfred Chang in", 60, "Second CEO change; Chang (ex-Fear of God/PacSun) takes over.",
        'https://www.retaildive.com/news/everlane-ceo-designer-brands-brand-chief-andrea-odonnell/705296/'),
    ],
  }),

  // ── Shein acquires Everlane ───────────────────────────────────────────
  beat({
    id: 'everlane-shein-acquires',
    source: 'serp_news',
    url: 'https://www.retaildive.com/news/official-shein-acquires-everlane/821004/',
    title: 'Official: Shein acquires Everlane',
    body: 'Shein acquired Everlane in a deal valued around $100 million, with existing investor L Catterton involved in the transaction. CEO Alfred Chang said the brand would keep its sustainability positioning under new ownership.',
    publishedDaysAgo: 30,
    entities: [
      company(COMPANY),
      company('Shein', 30),
      company('L Catterton', 30),
      person('Alfred Chang', { role: 'CEO' }, 30),
    ],
    relations: [
      rel('shein', COMPANY_ID, 'acquired', 30, {
        evidence: 'Shein acquires Everlane in a deal valued around $100 million',
        confidence: 0.93,
        sourceType: 'serp_news',
        url: 'https://www.retaildive.com/news/official-shein-acquires-everlane/821004/',
        attributes: { price: 100, debt: 90 },
      }),
      rel('l-catterton', COMPANY_ID, 'invested_in', 30, {
        evidence: 'existing investor L Catterton was involved in the transaction',
        confidence: 0.8,
        sourceType: 'serp_news',
        url: 'https://www.retaildive.com/news/official-shein-acquires-everlane/821004/',
      }),
    ],
    events: [
      evt('mna', 'Shein acquires Everlane (~$100M)', 30, 'Fast-fashion giant Shein buys Everlane; L Catterton involved.',
        'https://www.retaildive.com/news/official-shein-acquires-everlane/821004/'),
    ],
  }),

  // ── Glassdoor sentiment ───────────────────────────────────────────────
  beat({
    id: 'everlane-glassdoor',
    source: 'glassdoor_reviews',
    url: 'https://www.glassdoor.com/Reviews/Everlane-Reviews-E801772.htm',
    title: 'Glassdoor reviews — Everlane',
    body: 'Everlane holds roughly 3.3/5 on Glassdoor with about 42% of reviewers recommending the company. Cons cite leadership turnover and a gap between brand values and culture; pros cite the mission and product.',
    publishedDaysAgo: 20,
    entities: [company(COMPANY)],
    relations: [
      rel(COMPANY_ID, COMPANY_ID, 'reviewed_negatively', 20, {
        evidence: 'reviewers cite leadership turnover and a values-culture gap; ~42% recommend',
        confidence: 0.83,
        sourceType: 'glassdoor_reviews',
        url: 'https://www.glassdoor.com/Reviews/Everlane-Reviews-E801772.htm',
        attributes: { ratingNow: 3.3, recommendPct: 42 },
      }),
    ],
    events: [],
  }),
];

export const EVERLANE_DOCS: RawDoc[] = BEATS.map((b) => b.doc);

export const EVERLANE_EXTRACTIONS: Record<string, ExtractionResult> = Object.fromEntries(
  BEATS.map((b) => [b.doc.id, b.extraction]),
);
