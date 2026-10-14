import { z } from 'zod';
import { EntityKind, RelationshipType } from '../domain/enums.js';
import { ValidationError } from '../domain/errors.js';
import { Submission } from '../domain/submission.js';
import { SubmissionParser } from './submission-parser.js';

const MAX_REPORTED_PROBLEMS = 15;

// Common ways learners write kinds and relationship types, mapped to the canonical value.
const KIND_SYNONYMS = { 'abstract class': 'abstract', 'abstract-class': 'abstract', enumeration: 'enum', concrete: 'class' };
const RELATIONSHIP_SYNONYMS = {
  has: 'has-a', hasa: 'has-a', contains: 'has-a', composition: 'has-a', aggregation: 'has-a',
  isa: 'is-a', extends: 'is-a', inherits: 'is-a', inheritance: 'is-a',
  association: 'uses', dependency: 'uses', 'depends-on': 'uses', 'uses-a': 'uses',
  implement: 'implements', realizes: 'implements', realization: 'implements',
};

const normalizeKind = (value) => {
  if (typeof value !== 'string') return value;
  const key = value.trim().toLowerCase();
  return KIND_SYNONYMS[key] ?? key;
};

const normalizeRelationshipType = (value) => {
  if (typeof value !== 'string') return value;
  const key = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return RELATIONSHIP_SYNONYMS[key] ?? key;
};

// keyFlows etc. are text, but a list of steps is a natural thing to send too.
const longText = z.preprocess(
  (value) => (Array.isArray(value) ? value.join('\n') : value),
  z.string().trim().max(4000),
).default('');

const entityName = z.string().trim().min(1).max(80);

const entitySchema = z.strictObject({
  name: entityName,
  kind: z.preprocess(normalizeKind, z.enum(Object.values(EntityKind))),
  responsibilities: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  methods: z.array(z.string().trim().min(1).max(200)).max(40).default([]),
});

const relationshipSchema = z.strictObject({
  from: entityName,
  to: entityName,
  type: z.preprocess(normalizeRelationshipType, z.enum(Object.values(RelationshipType))),
  cardinality: z.preprocess(
    (value) => (typeof value === 'number' ? String(value) : value),
    z.string().trim().max(20),
  ).optional(),
});

const patternSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  where: z.string().trim().max(300).default(''),
  why: z.string().trim().max(1000).default(''),
});

const submissionSchema = z.strictObject({
  entities: z.array(entitySchema).min(1).max(30),
  relationships: z.array(relationshipSchema).max(60).default([]),
  patterns: z.array(patternSchema).max(15).default([]),
  keyFlows: longText,
  tradeOffs: longText,
  assumptions: longText,
  codeSkeleton: z.string().max(8000).default(''),
});

const ITEM_LABELS = {
  entities: 'entity',
  relationships: 'relationship',
  patterns: 'pattern',
  responsibilities: 'responsibility',
  methods: 'method',
};

const ALLOWED_FIELDS = {
  root: Object.keys(submissionSchema.shape),
  entities: Object.keys(entitySchema.shape),
  relationships: Object.keys(relationshipSchema.shape),
  patterns: Object.keys(patternSchema.shape),
};

/** Parses the structured JSON design format described in docs/DESIGN.md. */
export class StructuredJsonParser extends SubmissionParser {
  /**
   * @param {unknown} raw a JSON string or an already-parsed object
   * @returns {Submission}
   * @throws {ValidationError}
   */
  parse(raw) {
    if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) {
      throw new ValidationError('Your design is empty.', ['Add at least one entity, then its relationships, key flows and trade-offs.']);
    }
    const input = typeof raw === 'string' ? parseJsonText(raw) : raw;
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new ValidationError('Your design must be a JSON object.', [
        'Start from the template: an object with an "entities" list, plus "relationships", "patterns", "keyFlows", "tradeOffs" and "assumptions".',
      ]);
    }

    const parsed = submissionSchema.safeParse(input);
    if (!parsed.success) {
      throw invalid([...new Set(parsed.error.issues.map((issue) => formatIssue(issue, input)))]);
    }

    const duplicates = describeDuplicateNames(parsed.data.entities);
    if (duplicates.length > 0) throw invalid(duplicates);

    return new Submission(parsed.data);
  }
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ValidationError('Your design is not valid JSON.', [
      `${error.message}. Check for missing commas, unquoted names or a trailing comma.`,
    ]);
  }
}

function invalid(details) {
  const shown = details.slice(0, MAX_REPORTED_PROBLEMS);
  if (details.length > shown.length) shown.push(`…and ${details.length - shown.length} more.`);
  const count = details.length === 1 ? '1 problem' : `${details.length} problems`;
  return new ValidationError(`Your design has ${count} to fix before it can be evaluated.`, shown);
}

function describeDuplicateNames(entities) {
  const positions = new Map();
  entities.forEach((entity, i) => {
    const key = entity.name.toLowerCase();
    positions.set(key, [...(positions.get(key) ?? []), i]);
  });
  return [...positions.values()]
    .filter((indexes) => indexes.length > 1)
    .map((indexes) => {
      const where = indexes.map((i) => `#${i + 1}`).join(', ');
      return `Entities ${where} are all named "${entities[indexes[0]].name}". Each entity needs a unique name so relationships can refer to it.`;
    });
}

/** Turns a zod issue into a sentence like 'Entity #3 has no name.' */
function formatIssue(issue, input) {
  const { subject, field, collection, value } = describeLocation(issue.path, input);
  const fieldText = field ? ` "${field}"` : '';

  switch (issue.code) {
    case 'invalid_type':
      if (value === undefined) return field === 'name' ? `${subject} has no name.` : `${subject} is missing${fieldText}.`;
      return `${subject}${fieldText} should be ${describeExpected(issue.expected)}, not ${describeValue(value)}.`;

    case 'too_small':
      if (issue.origin === 'string') return field === 'name' ? `${subject} has no name.` : `${subject}${fieldText} is empty.`;
      if (issue.origin === 'array') return `${subject} needs at least ${issue.minimum} ${plural(ITEM_LABELS[field] ?? 'item', issue.minimum)}.`;
      break;

    case 'too_big':
      if (issue.origin === 'string') return `${subject}${fieldText} is too long (max ${issue.maximum} characters).`;
      if (issue.origin === 'array') return `${subject} has too many ${plural(ITEM_LABELS[field] ?? 'item', 2)} (max ${issue.maximum}).`;
      break;

    case 'invalid_value': {
      const options = issue.values.join(', ');
      if (value === undefined) return `${subject} is missing${fieldText} (use one of: ${options}).`;
      return `${subject} has ${field ?? 'value'} "${value}"; use one of: ${options}.`;
    }

    case 'unrecognized_keys': {
      const allowed = ALLOWED_FIELDS[collection ?? 'root'];
      return `${subject} has unknown ${plural('field', issue.keys.length)} ${issue.keys.map((k) => `"${k}"`).join(', ')}. Allowed: ${allowed.join(', ')}.`;
    }
  }
  return `${subject}${fieldText}: ${issue.message}.`;
}

/**
 * Walks the issue path through the raw input to build a readable subject:
 * ['entities', 2, 'responsibilities', 0] → 'Entity #3 (ParkingLot), responsibility #1'.
 */
function describeLocation(path, input) {
  const parts = [];
  let node = input;
  let field = null;
  let collection = null;

  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    const index = path[i + 1];
    if (typeof segment === 'string' && typeof index === 'number' && ITEM_LABELS[segment]) {
      node = node?.[segment]?.[index];
      parts.push(`${ITEM_LABELS[segment]} #${index + 1}${describeItem(segment, node)}`);
      if (segment in ALLOWED_FIELDS) collection = segment;
      field = null;
      i++;
    } else {
      field = segment;
      node = node?.[segment];
    }
  }

  const subject = parts.length > 0 ? capitalize(parts.join(', ')) : 'Your design';
  return { subject, field, collection, value: node };
}

function describeItem(collection, item) {
  if (item === null || typeof item !== 'object') return '';
  if (collection === 'relationships' && typeof item.from === 'string' && typeof item.to === 'string') {
    return ` (${item.from} → ${item.to})`;
  }
  return typeof item.name === 'string' && item.name.trim() ? ` (${item.name.trim()})` : '';
}

function describeExpected(expected) {
  return { string: 'text', array: 'a list', object: 'an object', number: 'a number', boolean: 'true or false' }[expected] ?? expected;
}

function describeValue(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  return describeExpected(typeof value);
}

function plural(word, count) {
  if (count === 1) return word;
  if (word.endsWith('y')) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
