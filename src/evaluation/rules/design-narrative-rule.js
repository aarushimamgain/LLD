import { Dimension, Severity } from '../../domain/enums.js';
import { wordCount } from '../analysis.js';
import { Rule } from './rule.js';

const MIN_TRADEOFF_WORDS = 15;

/** Trade-offs and assumptions are where design thinking becomes visible. */
export class DesignNarrativeRule extends Rule {
  constructor() {
    super({ dimension: Dimension.PATTERNS_AND_TRADEOFFS });
  }

  check(problem, submission) {
    const findings = [];
    const tradeOffWords = wordCount(submission.tradeOffs);

    if (tradeOffWords === 0) {
      findings.push(this.finding({
        key: 'TRADEOFFS_MISSING',
        severity: Severity.ISSUE,
        message: 'No trade-offs are stated.',
        evidence: ['tradeOffs'],
        suggestion: 'Name 2–3 decisions and what each one costs, e.g. "Strategy for pricing: one more interface, but new tariffs don\'t touch ParkingLot."',
      }));
    } else if (tradeOffWords < MIN_TRADEOFF_WORDS) {
      findings.push(this.finding({
        key: 'TRADEOFFS_THIN',
        severity: Severity.SUGGESTION,
        message: `Trade-offs are very brief (${tradeOffWords} words).`,
        evidence: ['tradeOffs'],
        suggestion: 'For each key decision, state the alternative you rejected and what you gave up (simplicity, performance, flexibility).',
      }));
    }

    if (wordCount(submission.assumptions) === 0) {
      findings.push(this.finding({
        key: 'ASSUMPTIONS_MISSING',
        severity: Severity.SUGGESTION,
        message: 'No assumptions are stated.',
        evidence: ['assumptions'],
        suggestion: 'Write down how you answered the clarifying questions (scale, concurrency, edge cases). Assumptions explain why the design looks the way it does.',
      }));
    }
    return findings;
  }
}
