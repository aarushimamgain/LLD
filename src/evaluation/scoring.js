import { DimensionScore } from '../domain/dimension-score.js';
import { Dimension, FeedbackSource, Severity } from '../domain/enums.js';

export const MAX_DIMENSION_POINTS = 10;

/**
 * Points deducted per finding. Deduction-based scoring keeps every lost point traceable to a
 * visible feedback item: "6/10 = two issues" is explainable; a ratio of hidden checks is not.
 */
export const SEVERITY_PENALTY = Object.freeze({
  [Severity.ISSUE]: 2,
  [Severity.SUGGESTION]: 1,
  [Severity.INFO]: 0,
});

/**
 * Scores each dimension 0–10 from RULE findings only (LLM items never move the score).
 * @param {import('../domain/feedback-item.js').FeedbackItem[]} items
 * @param {Record<string, number>} weights per-dimension weight, e.g. from problem.rubric.weights
 * @returns {DimensionScore[]}
 */
export function scoreDimensions(items, weights) {
  return Object.values(Dimension).map((dimension) => {
    const penalty = items
      .filter((item) => item.source === FeedbackSource.RULE && item.dimension === dimension)
      .reduce((sum, item) => sum + SEVERITY_PENALTY[item.severity], 0);
    return new DimensionScore({
      dimension,
      earned: Math.max(0, MAX_DIMENSION_POINTS - penalty),
      possible: MAX_DIMENSION_POINTS,
      weight: weights[dimension],
    });
  });
}
