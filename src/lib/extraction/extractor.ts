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
import { isDemoMode, getDemoTarget } from '@/lib/fixtures';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const MODEL = 'claude-sonnet-4-5-20250929'; // bump to 4.6 when available

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
1. Every relation MUST have a validFrom date. If the document doesn't state one, use the publication date.
2. Every relation MUST have an evidence excerpt — a direct quote from the document.
3. Be conservative: only extract facts the document clearly states. Do not infer.
4. Confidence reflects how directly the document supports the fact:
   - 0.9+ = direct statement
   - 0.7  = strong implication
   - 0.5  = inferred from context
   - <0.5 = don't emit
5. Use canonical names (e.g. "Peloton Interactive" not "Peloton", "Barry McCarthy" not "Mr. McCarthy").
6. For exec departures: emit \`departed\` with validTo on the company, validFrom on date of leaving.
`;

export async function extract(
  doc: RawDoc,
  targetCompany: string,
): Promise<ExtractionResultT> {
  // DEMO_MODE — return the pre-extracted facts for this fixture doc.
  if (isDemoMode()) {
    const demo = getDemoTarget(targetCompany);
    const cached = demo?.extractions[doc.id];
    if (cached) return ExtractionResult.parse(cached);
    // demo mode but unknown doc — fall through to live extraction
  }

  const userMessage = buildUserMessage(doc, targetCompany);

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: 0,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'record_extraction' },
    messages: [{ role: 'user', content: userMessage }],
  });

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
      validFrom: r.validFrom,
      validTo: r.validTo ?? null,
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
      occurredAt: e.occurredAt,
      description: e.description,
      sources: [source],
    })),
    summary: raw.summary,
  });
}

function buildUserMessage(doc: RawDoc, targetCompany: string): string {
  return `Target company: ${targetCompany}
Source: ${doc.source}
URL: ${doc.url}
Published: ${doc.publishedAt ?? 'unknown'}
Scraped: ${doc.scrapedAt}

---

${doc.title ? `# ${doc.title}\n\n` : ''}${doc.body}

---

Extract all entities, temporal relations, and events relevant to ${targetCompany}.
Use the publication date (${doc.publishedAt ?? nowIso()}) as the default validFrom if a relation's date is implicit.`;
}

function slugifyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
