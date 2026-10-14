export const AttemptStatus = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  EVALUATING: 'EVALUATING',
  EVALUATED: 'EVALUATED',
  PARTIALLY_EVALUATED: 'PARTIALLY_EVALUATED',
  FAILED: 'FAILED',
});

export const Dimension = Object.freeze({
  REQUIREMENTS_COVERAGE: 'requirementsCoverage',
  RESPONSIBILITIES: 'responsibilities',
  ABSTRACTION: 'abstraction',
  RELATIONSHIPS: 'relationships',
  PATTERNS_AND_TRADEOFFS: 'patternsAndTradeoffs',
});

export const Severity = Object.freeze({
  INFO: 'info',
  SUGGESTION: 'suggestion',
  ISSUE: 'issue',
});

export const FeedbackSource = Object.freeze({
  RULE: 'RULE',
  LLM: 'LLM',
});

export const EntityKind = Object.freeze({
  CLASS: 'class',
  INTERFACE: 'interface',
  ABSTRACT: 'abstract',
  ENUM: 'enum',
});

export const RelationshipType = Object.freeze({
  HAS_A: 'has-a',
  IS_A: 'is-a',
  USES: 'uses',
  IMPLEMENTS: 'implements',
});

export const Difficulty = Object.freeze({
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
});

/**
 * Guards constructor inputs against values outside an enum.
 * @param {string} value
 * @param {Record<string, string>} enumObject
 * @param {string} label used in the error message
 */
export function assertOneOf(value, enumObject, label) {
  if (!Object.values(enumObject).includes(value)) {
    throw new Error(`Invalid ${label}: "${value}". Expected one of ${Object.values(enumObject).join(', ')}`);
  }
}
