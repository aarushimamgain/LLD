import { Dimension, Severity } from '../../domain/enums.js';
import { analyzeConcepts, entitiesMentionedIn, wordCount } from '../analysis.js';
import { Rule } from './rule.js';

const MIN_WHY_WORDS = 4;

/**
 * Patterns should be placed on a real entity and justified. Also points out (as info, no
 * penalty) where the rubric expects a pattern that isn't named.
 */
export class PatternJustificationRule extends Rule {
  constructor() {
    super({ dimension: Dimension.PATTERNS_AND_TRADEOFFS });
  }

  check(problem, submission) {
    if (submission.patterns.length === 0) {
      return [this.finding({
        key: 'NO_PATTERNS',
        severity: Severity.SUGGESTION,
        message: 'No design patterns are named.',
        evidence: ['patterns'],
        suggestion: 'Where behaviour varies (a policy, an algorithm, a state), name the pattern you used, where, and why. If none fits, say so in tradeOffs.',
      })];
    }
    return [
      ...submission.patterns.flatMap((pattern) => this.#checkPattern(submission, pattern)),
      ...this.#suggestedPatterns(problem, submission),
    ];
  }

  #checkPattern(submission, pattern) {
    const findings = [];
    const placedOn = entitiesMentionedIn(submission, pattern.where);
    // Keyed by name *and* place: two Strategy patterns are two separate findings in the history diff.
    const id = `${pattern.name}@${pattern.where || '-'}`;

    if (placedOn.length === 0) {
      findings.push(this.finding({
        key: `PATTERN_WHERE:${id}`,
        severity: Severity.SUGGESTION,
        message: pattern.where
          ? `${pattern.name} is placed at "${pattern.where}", which is not one of your entities.`
          : `${pattern.name} doesn't say where it is applied.`,
        evidence: ['patterns'],
        suggestion: `Set "where" to the entity (or entities) that play the ${pattern.name} roles, and declare them in entities.`,
      }));
    }
    if (wordCount(pattern.why) < MIN_WHY_WORDS) {
      findings.push(this.finding({
        key: `PATTERN_NO_WHY:${id}`,
        severity: Severity.SUGGESTION,
        message: `${pattern.name}${pattern.where ? ` at ${pattern.where}` : ''} has no real justification.`,
        evidence: placedOn.length ? placedOn.map((e) => e.name) : ['patterns'],
        suggestion: `Say what changes or problem ${pattern.name} handles here, and what it costs (extra classes, indirection). If you can't, the pattern may not be needed.`,
      }));
    }
    return findings;
  }

  #suggestedPatterns(problem, submission) {
    return analyzeConcepts(problem, submission)
      .filter(({ concept, substantive }) => concept.expectAbstraction && concept.suggestedPatterns.length > 0 && substantive.length > 0)
      .filter(({ concept, entities }) => !submission.patterns.some((p) =>
        concept.suggestedPatterns.some((name) => name.toLowerCase() === p.name.trim().toLowerCase())
        && entitiesMentionedIn(submission, p.where).some((e) => entities.includes(e))))
      .map(({ concept, entities }) => {
        const names = entities.map((e) => e.name);
        return this.finding({
          key: `PATTERN_SUGGESTED:${concept.id}`,
          severity: Severity.INFO,
          message: `${concept.name} (${names.join(', ')}) is a natural fit for ${concept.suggestedPatterns.join(' or ')}.`,
          evidence: names,
          suggestion: `If you apply ${concept.suggestedPatterns[0]} there, record it under patterns with where and why.`,
        });
      });
  }
}
