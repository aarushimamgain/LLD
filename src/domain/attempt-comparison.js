import { roundToTenth } from './dimension-score.js';
import { Dimension, Severity } from './enums.js';

/**
 * Compares two scored attempts of the same problem so the learner can see progress.
 * Only keyed rule findings (suggestions and issues) are diffed, because LLM wording is not stable.
 *
 * @param {import('./attempt.js').Attempt} previous
 * @param {import('./attempt.js').Attempt} latest
 */
export function compareAttempts(previous, latest) {
  if (!previous.hasScores || !latest.hasScores) throw new Error('Both attempts must have scores to compare');
  if (previous.problemId !== latest.problemId) throw new Error('Can only compare attempts of the same problem');

  const before = findingsByKey(previous.result);
  const after = findingsByKey(latest.result);

  return {
    previousAttemptId: previous.id,
    latestAttemptId: latest.id,
    scoreDelta: roundToTenth(latest.result.totalScore - previous.result.totalScore),
    // Per dimension in the learner-facing 0–10 points (the total delta above is weighted, out of 100).
    dimensionDeltas: Object.values(Dimension).map((dimension) => {
      const was = previous.result.scoreFor(dimension);
      const now = latest.result.scoreFor(dimension);
      return { dimension, previous: was.earned, latest: now.earned, possible: now.possible, delta: roundToTenth(now.earned - was.earned) };
    }),
    fixed: [...before.values()].filter((item) => !after.has(item.key)),
    introduced: [...after.values()].filter((item) => !before.has(item.key)),
    persistingCount: [...after.keys()].filter((key) => before.has(key)).length,
  };
}

function findingsByKey(result) {
  return new Map(
    result.items
      .filter((item) => item.isComparable && item.severity !== Severity.INFO)
      .map((item) => [item.key, item]),
  );
}
