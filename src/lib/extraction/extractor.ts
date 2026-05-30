/**
 * VAN-301 — Claude structured extraction.
 *
 * Takes a RawDoc, returns ExtractionResult (entities + temporal relations + events).
 *
 * Key design decisions:
 *   • Use Anthropic tool_use for guaranteed JSON shape (vs prompt engineering)
 *   • Temperature 0 for determinism (we want the same docs to produce the same graph)
 *   • Stream the schema to Claude so the LLM sees exactly what to fill
 *   • Reject + retry once on Zod parse failure
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  ExtractionResult,
  type ExtractionResult as ExtractionResultT,
  type RawDoc,
  nowIso,
} from '@/lib/schema';
import { getDemoTarget } from '@/lib/fixtures';
import { env } from '@/lib/env';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    const apiKey = env('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set (or is empty). Add it to .env.local — live extraction needs it.',
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

const MODEL = 'claude-sonnet-4-6';

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'record_extraction',
  description:
    'Record all entities, temporal relations, and events found in the document.',
  input_schema: {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [
                'company',
                'person',
                'role',
                'event',
                'technology',
                'location',
                'product',
                'document',
                'lawsuit',
              ],
            },
            name: { type: 'string' },
            aliases: { type: 'array', items: { type: 'string' } },
            attributes: { type: 'object' },
          },
          required: ['type', 'name'],
        },
      },
      relations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            fromName: { type: 'string' },
            toName: { type: 'string' },
            kind: {
              type: 'string',
              enum: [
                'departed', 'joined', 'promoted_to', 'reports_to',
                'acquired', 'partnered_with', 'customer_of', 'competitor_of', 'invested_in',
                'launched', 'laid_off', 'expanded_to', 'filed_with_sec', 'litigated_with',
                'priced_at', 'reviewed_negatively', 'reviewed_positively', 'mentioned_in',
              ],
            },
            validFrom: {
              type: 'string',
              description: 'ISO date when the fact became true. Use the publication date if uncertain.',
            },
            validTo: {
              type: ['string', 'null'],
              description: 'ISO date when the fact stopped being true, or null if still valid.',
            },
            evidence: {
              type: 'string',
              description: 'Direct quote or excerpt from the document supporting this relation.',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
            },
          },
          required: ['fromName', 'toName', 'kind', 'validFrom', 'evidence', 'confidence'],
        },
      },
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: [
                'earnings', 'press_release', 'litigation', 'product_launch',
                'mna', 'leadership_change', 'layoff', 'fundraise',
                'pricing_change', 'sec_filing',
              ],
            },
            title: { type: 'string' },
            occurredAt: { type: 'string' },
            description: { type: 'string' },
            companyName: { type: 'string' },
          },
          required: ['category', 'title', 'occurredAt', 'description', 'companyName'],
        },
      },
      summary: {
        type: 'string',
        description: '1-2 sentence summary of the document.',
      },
    },
    required: ['entities', 'relations', 'events', 'summary'],
  },
};

const SYSTEM_PROMPT = `You are a diligence analyst extracting structured intelligence from web documents about companies.

Rules:
1. Every relation MUST have a validFrom date. Use this priority order:
   a. The specific date explicitly stated in the document for that event (e.g. "on March 25th", "Q3 2024", "January 2026").
   b. The publication date of the document (provided as "Published:" in the prompt).
   c. Only use today's date as a last resort if neither is available.
   IMPORTANT: If a document says "speaking at CERAWeek on March 25th" the validFrom is March 25, not the publication date.
2. Every relation MUST have an evidence excerpt — a direct quote from the document.
3. Be conservative: only extract facts the document clearly states. Do not infer.
4. Confidence reflects how directly the document supports the fact:
   - 0.9+ = direct statement
   - 0.7  = strong implication
   - 0.5  = inferred from context
   - <0.5 = don't emit
5. Use canonical names (e.g. "Peloton Interactive" not "Peloton", "Barry McCarthy" not "Mr. McCarthy").
6. Leadership changes — pick the kind by the DIRECTION of the move, not just the topic:
   - Someone LEAVING the company (resigns, steps down, departs, retires, is ousted/fired, or dies/passes away) → \`departed\` (validTo on the company, validFrom = date of leaving). A death or passing is a departure, never a join.
   - Someone JOINING / being HIRED / APPOINTED / NAMED to a role → \`joined\` (validFrom = start or announcement date). Phrases like "will join", "to join", "named as", "appointed", "hired as", "to lead", "becomes the new CEO/CFO" are ARRIVALS — emit \`joined\`, never \`departed\`.
   - An existing insider moving up → \`promoted_to\`.
   A new hire or appointment is a positive/neutral signal — do NOT label it as a departure.
7. For events (conferences, product launches, announcements): use the specific event date, not the post date.
8. Ignore boilerplate. Stock-quote and company-profile pages (e.g. "AAPL Stock Price Today", a Bloomberg/WSJ/FT ticker page, "engages in the design, manufacture, and sale of…") describe what a company *is*, not what just *happened*. Do NOT manufacture events (product launches, partnerships, etc.) from a generic product list or company description. A page listing iPhone/Mac/iPad is NOT evidence that those products "launched" in this window.
9. The evidence excerpt must directly state the specific relation. If you cannot quote a sentence that asserts the exact fact (who/what/when), do not emit the relation. Never reuse a generic company-description sentence as evidence for a specific event.
10. Do not emit \`mentioned_in\`. Only extract relations that represent a concrete, dated development.
`;

export async function extract(
  doc: RawDoc,
  targetCompany: string,
): Promise<ExtractionResultT> {
  // Registered demo targets: return the pre-extracted facts for this fixture
  // doc, never calling the API. Unknown docs fall through to live extraction.
  const demo = getDemoTarget(targetCompany);
  const cached = demo?.extractions[doc.id];
  if (cached) return ExtractionResult.parse(cached);

  const userMessage = buildUserMessage(doc, targetCompany);

  // Retry up to 3 times on 429 rate limit with exponential backoff
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await client().messages.create({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0,
        system: SYSTEM_PROMPT,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: 'tool', name: 'record_extraction' },
        messages: [{ role: 'user', content: userMessage }],
      });
      break;
    } catch (err: unknown) {
      const isRateLimit = err instanceof Error && err.message.includes('429');
      if (!isRateLimit || attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt));
    }
  }
  if (!response) throw new Error('extraction failed after retries');

  // Meter token consumption for the usage widget.
  try {
    const { recordAnthropic } = await import('@/lib/usage');
    recordAnthropic(response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);
  } catch {
    /* metering is best-effort */
  }

  // Extract the tool_use block
  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }

  const raw = toolUse.input as {
    entities: Array<{ type: string; name: string; aliases?: string[]; attributes?: Record<string, unknown> }>;
    relations: Array<{
      fromName: string;
      toName: string;
      kind: string;
      validFrom: string;
      validTo?: string | null;
      evidence: string;
      confidence: number;
    }>;
    events: Array<{
      category: string;
      title: string;
      occurredAt: string;
      description: string;
      companyName: string;
    }>;
    summary: string;
  };

  // Map raw output to schema-validated ExtractionResult
  const observedAt = doc.scrapedAt;
  const source = {
    url: doc.url,
    type: doc.source,
    scrapedAt: doc.scrapedAt,
    excerpt: doc.body.slice(0, 240),
  };

  return ExtractionResult.parse({
    entities: raw.entities.map((e) => ({
      id: slugifyName(e.name),
      type: e.type,
      name: e.name,
      aliases: e.aliases ?? [],
      attributes: e.attributes ?? {},
      sources: [source],
      observedAt,
    })),
    relations: raw.relations
      .filter((r) => isTrackableRelation(r.kind, r.evidence))
      .map((r, i) => ({
        id: `rel-${doc.id}-${i}`,
        fromEntityId: slugifyName(r.fromName),
        toEntityId: slugifyName(r.toName),
        kind: correctMgmtKind(r.kind, r.evidence),
        observedAt,
        validFrom: coerceIso(r.validFrom, observedAt),
        validTo: r.validTo ? coerceIso(r.validTo, null) : null,
        sources: [source],
        evidence: r.evidence,
        confidence: r.confidence,
        attributes: {},
      })),
    events: raw.events.map((e, i) => ({
      id: `evt-${doc.id}-${i}`,
      companyId: slugifyName(e.companyName),
      category: e.category,
      title: e.title,
      occurredAt: coerceIso(e.occurredAt, observedAt),
      description: e.description,
      sources: [source],
    })),
    summary: raw.summary,
  });
}

// Arrival vs. departure language. Used to repair leadership-relation kinds when
// the model mislabels them (e.g. tags an exec *joining* a company as `departed`).
const ARRIVAL_RE =
  /\b(join(s|ed|ing)?|to join|will join|named(\s+as)?|appoint(s|ed|ment|ing)?|hir(e|es|ed|ing)|to lead|takes?\s+over|becomes?\s+(the\s+)?(new\s+)?(chief|ceo|cfo|cmo|coo|cto|president|chair|head)|incoming|onboard)/i;
const DEPARTURE_RE =
  /\b(depart(s|ed|ure|ing)?|resign(s|ed|ation|ing)?|steps?\s+down|stepping\s+down|leav(e|es|ing)|\bleft\b|exit(s|ed|ing)?|oust(s|ed|er)?|fired|terminat(e|ed|ion)|retir(e|es|ed|ing|ement)|to leave|is leaving|out\s+as|removed|died|dies|death|passed\s+away|passing|deceased)/i;

/**
 * Repair obvious arrival/departure mislabels on management relations from the
 * evidence text. Only flips when the language clearly points one way and
 * contradicts the model's kind — otherwise the model's choice is kept.
 */
function correctMgmtKind(kind: string, evidence: string): string {
  const text = evidence ?? '';
  const arrival = ARRIVAL_RE.test(text);
  const departure = DEPARTURE_RE.test(text);
  if (kind === 'departed' && arrival && !departure) return 'joined';
  if ((kind === 'joined' || kind === 'promoted_to') && departure && !arrival) return 'departed';
  return kind;
}

// Boilerplate seen on stock-quote / company-profile pages (Bloomberg/WSJ/FT
// ticker pages). When the "evidence" is this kind of generic blurb, the model
// is fabricating a signal (e.g. "launched Mac") from a page that contains no
// such event — so the citation is meaningless.
const BOILERPLATE_RE =
  /\b(engages in the (design|business)|stock (price|analysis|chart|quote)|key statistics|company profile|company news|including stock price|breaking news and top stories|latest updates on|p\/e ratio|market cap|shares outstanding)\b/i;
// Real product launches use release language — a generic product list does not.
const LAUNCH_VERB_RE =
  /\b(launch|unveil|releas|introduc|debut|announc|roll(ed)?\s+out|ship(s|ped|ping)?|premier|reveal|deliver)/i;

/**
 * Keep only relations that represent a real, citable signal. Drops:
 *  - `mentioned_in` (the page merely references the company — not an event),
 *  - anything whose evidence is stock-quote / profile boilerplate,
 *  - `launched` relations with no actual release language in the evidence.
 */
function isTrackableRelation(kind: string, evidence: string): boolean {
  const text = (evidence ?? '').trim();
  if (text.length < 12) return false;
  if (kind === 'mentioned_in') return false;
  if (BOILERPLATE_RE.test(text)) return false;
  if (kind === 'launched' && !LAUNCH_VERB_RE.test(text)) return false;
  return true;
}

/** Coerce a Claude-returned date string ("2022-02", "Feb 2022", etc.) to a full ISO 8601 timestamp. */
function coerceIso(raw: string, fallback: string | null): string {
  if (!raw) return fallback ?? new Date().toISOString();
  const s = raw.trim();
  // Already a full ISO timestamp
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  // YYYY-MM-DD → append time
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
  // YYYY-MM → first of month
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01T00:00:00.000Z`;
  // YYYY → Jan 1
  if (/^\d{4}$/.test(s)) return `${s}-01-01T00:00:00.000Z`;
  // Try native parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  return fallback ?? new Date().toISOString();
}

function buildUserMessage(doc: RawDoc, targetCompany: string): string {
  const pubDate = doc.publishedAt
    ? new Date(doc.publishedAt).toISOString().slice(0, 10)
    : 'unknown';
  return `Target company: ${targetCompany}
Source: ${doc.source}
URL: ${doc.url}
Published: ${pubDate}
Scraped: ${doc.scrapedAt.slice(0, 10)}

---

${doc.title ? `# ${doc.title}\n\n` : ''}${doc.body}

---

Extract all entities, temporal relations, and events relevant to ${targetCompany}.
For validFrom: prefer specific dates mentioned in the content (e.g. "March 25th", "Q3 2024").
Fallback to publication date ${pubDate} only if no specific date is stated in the text.`;
}

function slugifyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
