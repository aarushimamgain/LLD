import { Dimension, Severity } from '../domain/enums.js';
import { EvaluationResult } from '../domain/evaluation-result.js';
import { Evaluator } from './evaluator.js';
import { createDefaultRules } from './rules/index.js';
import { scoreDimensions } from './scoring.js';

const SEVERITY_ORDER = [Severity.ISSUE, Severity.SUGGESTION, Severity.INFO];
const DIMENSION_ORDER = Object.values(Dimension);

/** Deterministic, instant evaluation: runs every rule and scores the findings. Produces the score. */
export class RuleBasedEvaluator extends Evaluator {
  /** @param {import('./rules/rule.js').Rule[]} [rules] */
  constructor(rules = createDefaultRules()) {
    super();
    this.rules = rules;
  }

  async evaluate(problem, submission) {
    const items = uniqueByKey(this.rules.flatMap((rule) => rule.check(problem, submission)))
      .sort((a, b) =>
        DIMENSION_ORDER.indexOf(a.dimension) - DIMENSION_ORDER.indexOf(b.dimension)
        || SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

    return new EvaluationResult({
      dimensionScores: scoreDimensions(items, problem.rubric.weights),
      items,
    });
  }
}

/**
 * Keys identify a finding across attempts, so each may appear once. A repeat means the same
 * finding twice (e.g. a relationship row written twice) and must not cost points twice.
 */
function uniqueByKey(items) {
  const seen = new Set();
  return items.filter((item) => !seen.has(item.key) && seen.add(item.key));
}
