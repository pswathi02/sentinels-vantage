/**
 * Diligence analytics derived purely from a Dossier.
 *
 * Everything here is a deterministic function over the plain entity/relation/
 * event arrays — no network, no credentials, no React. That keeps the demo
 * honest (same numbers the UI shows are reproducible) and lets a future API
 * route reuse the exact same computation when live data lands.
 */

import type { Dossier } from '@/lib/pipeline';
import type {
  TemporalRelation,
  RelationKind,
  RiskCategory,
  RiskSeverity,
  Event,
  SourceRef,
} from '@/lib/schema';

const DAY = 24 * 60 * 60 * 1000;

// ── shared lookups ────────────────────────────────────────────────────
const REL_CATEGORY: Partial<Record<RelationKind, RiskCategory>> = {
  departed: 'mgmt',
  laid_off: 'mgmt',
  promoted_to: 'mgmt',
  joined: 'mgmt',
  reviewed_negatively: 'culture',
  reviewed_positively: 'culture',
  litigated_with: 'legal',
  filed_with_sec: 'legal',
  priced_at: 'financial',
  partnered_with: 'market',
  invested_in: 'market',
  acquired: 'market',
  launched: 'market',
  expanded_to: 'market',
};

export const CATEGORY_LABEL: Record<RiskCategory, string> = {
  mgmt: 'Management',
  culture: 'Culture',
  financial: 'Financial',
  legal: 'Legal',
  market: 'Market',
  customer: 'Customer',
};

const SEVERITY_RANK: Record<RiskSeverity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

const NEGATIVE_KINDS = new Set<RelationKind>([
  'departed',
  'laid_off',
  'litigated_with',
  'reviewed_negatively',
]);

export function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function nameMap(dossier: Dossier): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of dossier.entities) m.set(e.id, e.name);
  return m;
}

function relInWindow(r: TemporalRelation, fromMs: number, toMs: number): boolean {
  const v = Date.parse(r.validFrom);
  return v > fromMs && v <= toMs;
}

// ── Frame 5: Δ Delta Report ───────────────────────────────────────────
export interface DeltaItem {
  text: string;
  date: string;
  url?: string;
  host?: string;
}

export interface DeltaRow {
  category: RiskCategory;
  label: string;
  delta: string;
  severity: RiskSeverity;
  items: DeltaItem[];
}

/** What changed between two timestamps, grouped by risk category, severity-sorted. */
export function computeDelta(dossier: Dossier, fromMs: number, toMs: number): DeltaRow[] {
  const names = nameMap(dossier);
  const byCat = new Map<RiskCategory, TemporalRelation[]>();

  for (const r of dossier.relations) {
    if (!relInWindow(r, fromMs, toMs)) continue;
    const cat = REL_CATEGORY[r.kind];
    if (!cat) continue;
    (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(r);
  }

  const rows: DeltaRow[] = [];
  for (const [category, rels] of byCat) {
    const seenText = new Set<string>();
    const items: DeltaItem[] = rels
      .sort((a, b) => Date.parse(b.validFrom) - Date.parse(a.validFrom))
      .map((r) => {
        const subject =
          r.fromEntityId === r.toEntityId
            ? names.get(r.fromEntityId) ?? r.fromEntityId
            : `${names.get(r.fromEntityId) ?? r.fromEntityId} ${r.kind.replace(/_/g, ' ')} ${
                names.get(r.toEntityId) ?? r.toEntityId
              }`;
        const s = r.sources[0];
        return {
          text: r.evidence?.trim() ? r.evidence : subject,
          date: fmt(Date.parse(r.validFrom)),
          url: s?.url,
          host: s ? host(s.url) : undefined,
        };
      })
      // Collapse identical evidence lines (the model often emits the same quote
      // for several relations drawn from one sentence).
      .filter((it) => {
        const key = it.text.trim().toLowerCase();
        if (seenText.has(key)) return false;
        seenText.add(key);
        return true;
      });

    rows.push({
      category,
      label: CATEGORY_LABEL[category],
      delta: deltaText(category, rels),
      severity: severityFor(category, rels),
      items,
    });
  }

  return rows.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

function deltaText(category: RiskCategory, rels: TemporalRelation[]): string {
  switch (category) {
    case 'mgmt': {
      const dep = rels.filter((r) => r.kind === 'departed').length;
      const lay = rels.filter((r) => r.kind === 'laid_off').length;
      const joined = rels.filter((r) => r.kind === 'joined').length;
      const promoted = rels.filter((r) => r.kind === 'promoted_to').length;
      const parts: string[] = [];
      if (dep) parts.push(`-${dep} exec${dep > 1 ? 's' : ''}`);
      if (lay) parts.push(`${lay} layoff${lay > 1 ? 's' : ''}`);
      if (joined) parts.push(`+${joined} hire${joined > 1 ? 's' : ''}`);
      if (promoted) parts.push(`${promoted} promotion${promoted > 1 ? 's' : ''}`);
      return parts.join(' · ') || `${rels.length} change${rels.length > 1 ? 's' : ''}`;
    }
    case 'culture': {
      const neg = rels.some((r) => r.kind === 'reviewed_negatively');
      return neg ? 'sentiment ↓' : 'sentiment ↑';
    }
    case 'legal': {
      // Litigation is the risk; SEC filings are routine disclosure — count them
      // separately so a 10-K doesn't read like a lawsuit.
      const cases = rels.filter((r) => r.kind === 'litigated_with').length;
      const filings = rels.filter((r) => r.kind === 'filed_with_sec').length;
      const parts: string[] = [];
      if (cases) parts.push(`+${cases} case${cases > 1 ? 's' : ''}`);
      if (filings) parts.push(`${filings} SEC filing${filings > 1 ? 's' : ''}`);
      return parts.join(' · ') || `${rels.length} update${rels.length > 1 ? 's' : ''}`;
    }
    case 'financial':
      return 'pricing change';
    case 'market': {
      const count = (kind: RelationKind, sing: string, plur: string): string | null => {
        const n = rels.filter((r) => r.kind === kind).length;
        return n ? `${n} ${n > 1 ? plur : sing}` : null;
      };
      const parts = [
        count('acquired', 'acquisition', 'acquisitions'),
        count('partnered_with', 'partnership', 'partnerships'),
        count('invested_in', 'investment', 'investments'),
        count('launched', 'launch', 'launches'),
        count('expanded_to', 'expansion', 'expansions'),
      ].filter((p): p is string => p !== null);
      return parts.join(' · ') || `${rels.length} update${rels.length > 1 ? 's' : ''}`;
    }
    default:
      return `${rels.length} change${rels.length > 1 ? 's' : ''}`;
  }
}

function severityFor(category: RiskCategory, rels: TemporalRelation[]): RiskSeverity {
  switch (category) {
    case 'mgmt': {
      // Only exits drive risk severity. Hires/promotions alone are not a red flag.
      const dep = rels.filter((r) => r.kind === 'departed').length;
      if (dep >= 2) return 'critical';
      if (dep === 1 || rels.some((r) => r.kind === 'laid_off')) return 'high';
      return 'low';
    }
    case 'culture':
      return rels.some((r) => r.kind === 'reviewed_negatively') ? 'high' : 'low';
    case 'legal': {
      // Only active litigation drives legal risk; SEC filings are routine.
      const cases = rels.filter((r) => r.kind === 'litigated_with').length;
      if (cases >= 2) return 'high';
      if (cases === 1) return 'medium';
      return 'low';
    }
    case 'financial':
      return 'low';
    default:
      return 'low';
  }
}

// ── Frame 7: the memo ─────────────────────────────────────────────────
export interface TimelineRow {
  date: string;
  label: string;
  url?: string;
  host?: string;
}

export interface NarrativeItem {
  text: string;
  citations: Citation[];
}

export interface MemoModel {
  target: string;
  asOf: string;
  lookbackDays: number;
  critical: number;
  high: number;
  summary: string;
  confidence: number;
  summaryCitations: Citation[];
  timeline: TimelineRow[];
  narrative: NarrativeItem[];
  analog: AnalogMatch[];
}

/** Build the IC-ready memo for the window ending at `cursorMs`. */
export function buildMemo(
  dossier: Dossier,
  cursorMs: number,
  lookbackDays = 90,
): MemoModel {
  const fromMs = cursorMs - lookbackDays * DAY;
  const rows = computeDelta(dossier, fromMs, cursorMs);
  const critical = rows.filter((r) => r.severity === 'critical').length;
  const high = rows.filter((r) => r.severity === 'high').length;

  // Timeline: events + negative relation changes inside the window, each kept
  // with the source behind it so the memo can render a clickable [n] ref.
  const tl: Array<{ ms: number; label: string; url?: string; host?: string }> = [];
  for (const ev of dossier.events) {
    const ms = Date.parse(ev.occurredAt);
    if (ms > fromMs && ms <= cursorMs) {
      const s = ev.sources[0];
      tl.push({ ms, label: ev.title, url: s?.url, host: s ? host(s.url) : undefined });
    }
  }
  const names = nameMap(dossier);
  for (const r of dossier.relations) {
    if (!relInWindow(r, fromMs, cursorMs)) continue;
    if (!NEGATIVE_KINDS.has(r.kind)) continue;
    const subj = names.get(r.fromEntityId) ?? r.fromEntityId;
    const obj = r.fromEntityId === r.toEntityId ? '' : ` — ${names.get(r.toEntityId) ?? ''}`;
    const s = r.sources[0];
    tl.push({
      ms: Date.parse(r.validFrom),
      label: `${subj} ${r.kind.replace(/_/g, ' ')}${obj}`,
      url: s?.url,
      host: s ? host(s.url) : undefined,
    });
  }
  tl.sort((a, b) => a.ms - b.ms);
  const timeline: TimelineRow[] = dedupe(tl).map((t) => ({
    date: fmt(t.ms),
    label: t.label,
    url: t.url,
    host: t.host,
  }));

  // Confidence + exact citations behind the executive summary: tie them to the
  // top (highest-severity) categories the summary actually names.
  const topCats = new Set(rows.slice(0, 2).map((r) => r.category));
  const topRels = dossier.relations.filter(
    (r) => relInWindow(r, fromMs, cursorMs) && topCats.has(REL_CATEGORY[r.kind] as RiskCategory),
  );
  const confidence = topRels.length
    ? topRels.reduce((s, r) => s + r.confidence, 0) / topRels.length
    : 1;
  const summaryCitations = dedupeCitations(
    rows
      .slice(0, 2)
      .flatMap((r) => r.items)
      .filter((i) => i.url)
      .map((i) => ({ label: i.host ?? '', url: i.url!, host: i.host ?? '', date: i.date })),
  );

  return {
    target: dossier.target,
    asOf: fmt(cursorMs),
    lookbackDays,
    critical,
    high,
    summary: summarize(dossier.target, lookbackDays, critical, high, rows),
    confidence,
    summaryCitations,
    timeline,
    narrative: narrate(dossier, fromMs, cursorMs),
    analog: analogMatches(dossier),
  };
}

function dedupeCitations(cites: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of cites) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
  }
  return out;
}

function summarize(
  target: string,
  lookbackDays: number,
  critical: number,
  high: number,
  rows: DeltaRow[],
): string {
  if (rows.length === 0) {
    return `Over the last ${lookbackDays} days, no material changes registered on ${target}'s open-web footprint.`;
  }
  const top = rows
    .slice(0, 2)
    .map((r) => r.label.toLowerCase())
    .join(' and ');
  const sev = critical
    ? `${critical} critical-severity change${critical > 1 ? 's' : ''}`
    : `${high} high-severity change${high > 1 ? 's' : ''}`;
  return `Over the last ${lookbackDays} days, ${sev} registered on ${target}'s open-web footprint, weighted toward ${top}.`;
}

/** Lag-aware risk narrative — knows what preceded what, with sources per fact. */
function narrate(dossier: Dossier, fromMs: number, cursorMs: number): NarrativeItem[] {
  const out: NarrativeItem[] = [];
  const eventOf = (cat: string): Event | null =>
    dossier.events
      .filter(
        (x) =>
          x.category === cat &&
          Date.parse(x.occurredAt) > fromMs &&
          Date.parse(x.occurredAt) <= cursorMs,
      )
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))[0] ?? null;
  const eventCite = (e: Event): Citation => {
    const s = e.sources[0];
    return { label: e.title, url: s.url, host: host(s.url), date: fmt(Date.parse(e.occurredAt)) };
  };
  const relCite = (r: TemporalRelation): Citation => {
    const s = r.sources[0];
    return {
      label: r.evidence?.trim() ? trunc(r.evidence, 60) : r.kind.replace(/_/g, ' '),
      url: s.url,
      host: host(s.url),
      date: fmt(Date.parse(r.validFrom)),
    };
  };
  const days = (a: number, b: number) => Math.round(Math.abs(a - b) / DAY);

  const pricingEv = eventOf('pricing_change');
  const legalEv = eventOf('litigation');
  const cultureEv = eventOf('leadership_change');
  const pricing = pricingEv ? Date.parse(pricingEv.occurredAt) : null;
  const legal = legalEv ? Date.parse(legalEv.occurredAt) : null;
  const culture = cultureEv ? Date.parse(cultureEv.occurredAt) : null;

  if (pricing && legal && pricingEv && legalEv && pricing < legal) {
    out.push({
      text: `The pricing change preceded the legal event by ${days(pricing, legal)} days, consistent with margin pressure surfacing before disclosure.`,
      citations: [eventCite(pricingEv), eventCite(legalEv)],
    });
  }
  const negRevRel = dossier.relations
    .filter((r) => r.kind === 'reviewed_negatively' && relInWindow(r, fromMs, cursorMs))
    .sort((a, b) => Date.parse(a.validFrom) - Date.parse(b.validFrom))[0];
  const negRev = negRevRel ? Date.parse(negRevRel.validFrom) : null;
  if (negRev && culture && cultureEv && negRevRel && culture < negRev) {
    out.push({
      text: `Employee sentiment turned negative ${days(culture, negRev)} days after the leadership change — a lagging confirmation of internal disruption.`,
      citations: [eventCite(cultureEv), relCite(negRevRel)],
    });
  }
  const lastDepartureRel = dossier.relations
    .filter((r) => r.kind === 'departed' && relInWindow(r, fromMs, cursorMs))
    .sort((a, b) => Date.parse(b.validFrom) - Date.parse(a.validFrom))[0];
  if (lastDepartureRel) {
    out.push({
      text: `The most recent executive departure (${fmt(Date.parse(lastDepartureRel.validFrom))}) is the freshest signal and the most likely catalyst for further change.`,
      citations: [relCite(lastDepartureRel)],
    });
  }
  if (out.length === 0) {
    out.push({
      text: `No ordered signal chain detected in the window; changes appear independent.`,
      citations: [],
    });
  }
  return out;
}

function dedupe<T extends { ms: number; label: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = `${r.ms}|${r.label}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// ── Frame 6: Ask Hindsight (cited Q&A) ────────────────────────────────
export interface Citation {
  label: string;
  url: string;
  host: string;
  date: string;
}

export interface QA {
  id: string;
  question: string;
  answer: string;
  citations: Citation[];
}

/**
 * Demo Q&A: deterministic, cited answers computed from the graph. The same
 * question set wires to a live Claude call once an API key is present — the
 * answer/citation shape is identical, so the UI never changes.
 */
export function answerQuestions(dossier: Dossier): QA[] {
  const names = nameMap(dossier);
  const cite = (r: TemporalRelation): Citation => {
    const s = r.sources[0];
    return {
      label: r.evidence?.trim() ? trunc(r.evidence, 60) : r.kind.replace(/_/g, ' '),
      url: s.url,
      host: host(s.url),
      date: fmt(Date.parse(r.validFrom)),
    };
  };

  const departures = dossier.relations.filter((r) => r.kind === 'departed');
  const legal = dossier.relations.filter(
    (r) => r.kind === 'litigated_with' || r.kind === 'filed_with_sec',
  );
  const negative = dossier.relations.filter((r) => r.kind === 'reviewed_negatively');
  const layoffs = dossier.relations.filter((r) => r.kind === 'laid_off');

  const out: QA[] = [];

  if (departures.length || layoffs.length) {
    const who = departures.map((r) => names.get(r.fromEntityId) ?? r.fromEntityId);
    out.push({
      id: 'mgmt',
      question: 'What are the management red flags?',
      answer:
        `${departures.length} executive departure${departures.length === 1 ? '' : 's'}` +
        (who.length ? ` (${who.join(', ')})` : '') +
        (layoffs.length ? ` plus ${layoffs.length} workforce reduction${layoffs.length === 1 ? '' : 's'}` : '') +
        ` in the lookback window. Repeated C-suite churn is the strongest single predictor of further instability.`,
      citations: [...departures, ...layoffs].map(cite),
    });
  }

  if (legal.length) {
    out.push({
      id: 'legal',
      question: 'What is the legal exposure?',
      answer: `${legal.length} legal/regulatory item${legal.length === 1 ? '' : 's'} on file, including litigation and SEC disclosure activity within the window.`,
      citations: legal.map(cite),
    });
  }

  if (negative.length) {
    out.push({
      id: 'culture',
      question: 'How has employee sentiment changed?',
      answer: `Glassdoor / review sentiment turned negative in the window, with reviews citing morale and leadership churn — a lagging confirmation of the management changes above.`,
      citations: negative.map(cite),
    });
  }

  return out;
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/**
 * Answer a free-text question against the dossier. Demo-mode: keyword routing
 * over the same cited relations the canned Q&A uses, with a graceful fallback.
 * Swaps to a live Claude call (identical QA shape) once an API key is present.
 */
export function answerAdHoc(dossier: Dossier, question: string): QA {
  const q = question.toLowerCase();
  const canned = answerQuestions(dossier);
  const match = (...keys: string[]) => keys.some((k) => q.includes(k));

  if (match('depart', 'exec', 'management', 'ceo', 'cfo', 'cmo', 'leadership', 'churn', 'layoff')) {
    const a = canned.find((c) => c.id === 'mgmt');
    if (a) return { ...a, id: 'ask:' + Date.now(), question };
  }
  if (match('legal', 'lawsuit', 'litigat', 'sec', 'regulat', 'sue')) {
    const a = canned.find((c) => c.id === 'legal');
    if (a) return { ...a, id: 'ask:' + Date.now(), question };
  }
  if (match('sentiment', 'glassdoor', 'culture', 'morale', 'review', 'employee')) {
    const a = canned.find((c) => c.id === 'culture');
    if (a) return { ...a, id: 'ask:' + Date.now(), question };
  }

  // Fallback: summarise the highest-severity changes in the full window, cited.
  const toMs = Date.parse(dossier.window.to);
  const fromMs = Date.parse(dossier.window.from);
  const rows = computeDelta(dossier, fromMs, toMs);
  if (rows.length === 0) {
    return {
      id: 'ask:' + Date.now(),
      question,
      answer: `Nothing in the indexed corpus directly answers that. No material changes are on file for ${dossier.target} in the window.`,
      citations: [],
    };
  }
  const top = rows.slice(0, 2);
  const citations = dedupeCitations(
    top
      .flatMap((r) => r.items)
      .filter((i) => i.url)
      .map((i) => ({ label: i.host ?? '', url: i.url!, host: i.host ?? '', date: i.date })),
  ).slice(0, 6);
  return {
    id: 'ask:' + Date.now(),
    question,
    answer:
      `Based on the indexed signals, the most material activity is in ` +
      `${top.map((r) => r.label.toLowerCase()).join(' and ')} ` +
      `(${top.map((r) => r.delta).join('; ')}). See the cited sources below.`,
    citations,
  };
}

// ── Frame 6b: analog pattern search (demo mock) ───────────────────────
export interface AnalogMatch {
  name: string;
  similarity: number;
  note: string;
}

/**
 * DEMO MOCK. A real analog search embeds each company's signal trajectory and
 * does nearest-neighbour over a multi-company index. We only have one company
 * in the demo corpus, so these are illustrative comparables, not computed.
 */
export function analogMatches(_dossier: Dossier): AnalogMatch[] {
  return [
    { name: 'Peloton 2022-Q3', similarity: 0.87, note: 'CFO exit · Glassdoor ↓ · hiring −38%' },
    { name: 'Allbirds 2026-Q2', similarity: 0.81, note: 'CMO departed −45d · sentiment ↓' },
    { name: 'Beyond Meat 2025-Q4', similarity: 0.72, note: 'CFO exit −67d · 1 lawsuit' },
  ];
}

export { DAY };
