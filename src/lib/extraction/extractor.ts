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

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
6. For exec departures: emit \`departed\` with validTo on the company, validFrom on date of leaving.
7. For events (conferences, product launches, announcements): use the specific event date, not the post date.
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
    relations: raw.relations.map((r, i) => ({
      id: `rel-${doc.id}-${i}`,
      fromEntityId: slugifyName(r.fromName),
      toEntityId: slugifyName(r.toName),
      kind: r.kind,
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
