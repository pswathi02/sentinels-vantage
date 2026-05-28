/**
 * Quick sanity check that Zod schemas are well-formed.
 * Run:  npx tsx scripts/test-schema.ts
 */

import {
  Entity,
  TemporalRelation,
  RiskSignal,
  ExtractionResult,
  nowIso,
  daysAgoIso,
  slugify,
} from '@/lib/schema';

const entity = Entity.parse({
  id: slugify('Peloton Interactive'),
  type: 'company',
  name: 'Peloton Interactive',
  aliases: ['Peloton'],
  attributes: { ticker: 'PTON' },
  sources: [
    {
      url: 'https://nytimes.com/example',
      type: 'serp_news',
      scrapedAt: nowIso(),
      excerpt: 'Peloton announces...',
    },
  ],
  observedAt: nowIso(),
});

const relation = TemporalRelation.parse({
  id: 'rel-test-1',
  fromEntityId: slugify('Barry McCarthy'),
  toEntityId: slugify('Peloton Interactive'),
  kind: 'departed',
  observedAt: nowIso(),
  validFrom: daysAgoIso(21),
  validTo: null,
  sources: [
    {
      url: 'https://linkedin.com/in/example',
      type: 'linkedin_employee',
      scrapedAt: nowIso(),
    },
  ],
  evidence: '"Excited to share I\'ve left Peloton..."',
  confidence: 0.95,
  attributes: {},
});

const flag = RiskSignal.parse({
  id: 'flag-test-1',
  companyId: slugify('Peloton Interactive'),
  category: 'mgmt',
  severity: 'critical',
  observedAt: nowIso(),
  description: 'Second CFO departure in 18 months',
  evidence: [
    {
      url: 'https://nytimes.com/example',
      type: 'serp_news',
      scrapedAt: nowIso(),
    },
  ],
  suggestedICQuestion: 'What is mgmt\'s plan for finance leadership continuity?',
  detectionMethod: 'rule',
});

const result = ExtractionResult.parse({
  entities: [entity],
  relations: [relation],
  events: [],
  summary: 'Peloton CFO Barry McCarthy departed.',
});

console.log('✓ Entity   parsed:', entity.id);
console.log('✓ Relation parsed:', relation.id);
console.log('✓ Flag     parsed:', flag.id);
console.log('✓ Result   parsed:', result.entities.length, 'entities,', result.relations.length, 'relations');
console.log('\nAll schemas valid ✓');
