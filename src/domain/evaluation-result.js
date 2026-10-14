import { DimensionScore, roundToTenth } from './dimension-score.js';
import { Dimension } from './enums.js';
import { FeedbackItem } from './feedback-item.js';

/**
 * Scores for all five dimensions plus the feedback items that explain them.
 * `partialReason` is set when part of the evaluation (the LLM review) did not finish.
 */
export class EvaluationResult {
  /**
   * @param {object} props
   * @param {DimensionScore[]} props.dimensionScores exactly one per Dimension
   * @param {FeedbackItem[]} [props.items]
   * @param {string|null} [props.partialReason] learner-facing reason, null when complete
   */
  constructor({ dimensionScores, items = [], partialReason = null }) {
    const byDimension = new Map(dimensionScores.map((s) => [s.dimension, s]));
    const missing = Object.values(Dimension).filter((d) => !byDimension.has(d));
    if (missing.length > 0 || byDimension.size !== dimensionScores.length) {
      throw new Error(`EvaluationResult needs exactly one score per dimension; missing: ${missing.join(', ') || 'none'}`);
    }

    this.dimensionScores = Object.freeze(Object.values(Dimension).map((d) => byDimension.get(d)));
    this.items = Object.freeze([...items]);
    this.partialReason = partialReason;
    Object.freeze(this);
  }

  get totalScore() {
    return roundToTenth(this.dimensionScores.reduce((sum, s) => sum + s.score, 0));
  }

  get maxScore() {
    return this.dimensionScores.reduce((sum, s) => sum + s.weight, 0);
  }

  get isPartial() {
    return this.partialReason !== null;
  }

  /** Same scores and items, flagged as incomplete. */
  asPartial(reason) {
    return new EvaluationResult({ dimensionScores: this.dimensionScores, items: this.items, partialReason: reason });
  }

  scoreFor(dimension) {
    return this.dimensionScores.find((s) => s.dimension === dimension);
  }

  /**
   * Adds another result's feedback to this one. Scores always come from `this` (the rule result),
   * which keeps the score deterministic no matter what the LLM says.
   * @param {EvaluationResult} other
   */
  merge(other) {
    const seenKeys = new Set(this.items.filter((i) => i.key).map((i) => i.key));
    const extra = other.items.filter((i) => !i.key || !seenKeys.has(i.key));
    return new EvaluationResult({ dimensionScores: this.dimensionScores, items: [...this.items, ...extra], partialReason: this.partialReason });
  }

  toJSON() {
    return {
      totalScore: this.totalScore,
      maxScore: this.maxScore,
      dimensionScores: this.dimensionScores.map((s) => s.toJSON()),
      items: this.items.map((i) => i.toJSON()),
      partialReason: this.partialReason,
    };
  }

  static fromJSON(json) {
    return new EvaluationResult({
      dimensionScores: json.dimensionScores.map(DimensionScore.fromJSON),
      items: json.items.map(FeedbackItem.fromJSON),
      partialReason: json.partialReason ?? null,
    });
  }
}
