import { EntityKind } from '../domain/enums.js';
import { containsSequence, tokenize } from '../domain/text.js';

/** Submission sections that feedback can point at, besides entity names and requirement ids. */
export const SUBMISSION_SECTIONS = Object.freeze(['entities', 'relationships', 'patterns', 'keyFlows', 'tradeOffs', 'assumptions', 'codeSkeleton']);

export function isAbstractKind(entity) {
  return entity.kind === EntityKind.INTERFACE || entity.kind === EntityKind.ABSTRACT;
}

/** An entity with no responsibilities and no methods is a name, not a design decision. */
export function hasSubstance(entity) {
  return entity.responsibilities.length > 0 || entity.methods.length > 0;
}

/**
 * Which rubric concepts the submission covers. A concept only counts when a matching entity
 * has substance, so naming an empty class "ParkingStrategy" earns nothing.
 * @returns {{concept: object, entities: object[], substantive: object[]}[]}
 */
export function analyzeConcepts(problem, submission) {
  const matches = problem.rubric.matchEntities(submission.entities);
  return problem.rubric.concepts.map((concept) => {
    const entities = matches.get(concept.id);
    return { concept, entities, substantive: entities.filter(hasSubstance) };
  });
}

/**
 * Tokens from everything that describes behaviour: names, responsibilities, methods, flows and
 * assumptions. Trade-offs are excluded so "we did not handle X" doesn't count as handling X.
 */
export function behaviourTokens(submission) {
  const texts = [
    ...submission.entities.flatMap((e) => [e.name, ...e.responsibilities, ...e.methods]),
    submission.keyFlows,
    submission.assumptions,
  ];
  return tokenize(texts.join(' '));
}

/**
 * True when every token of the keyword appears in order. Keyword tokens of 4+ characters also
 * match as prefixes, so "lock" finds "locking" and "concurren" style stems work.
 */
export function mentionsKeyword(tokens, keyword) {
  const wanted = tokenize(keyword);
  if (wanted.length === 0) return false;
  const matchesToken = (actual, expected) => actual === expected || (expected.length >= 4 && actual.startsWith(expected));
  for (let start = 0; start <= tokens.length - wanted.length; start++) {
    if (wanted.every((token, i) => matchesToken(tokens[start + i], token))) return true;
  }
  return false;
}

/** Entities named in free text, e.g. "PricingStrategy and HourlyPricing" or a key-flow walkthrough. */
export function entitiesMentionedIn(submission, text) {
  const tokens = tokenize(text);
  return submission.entities.filter((e) => containsSequence(tokens, tokenize(e.name)));
}

export function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function quoteList(names, max = 3) {
  const shown = names.slice(0, max).map((n) => `"${n}"`);
  return names.length > max ? `${shown.join(', ')} and ${names.length - max} more` : shown.join(', ');
}
