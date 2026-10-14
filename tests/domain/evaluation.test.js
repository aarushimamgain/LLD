import { compareAttempts, Dimension, DimensionScore, FeedbackSource, Submission } from '../../src/domain/index.js';
import { makeIssue, makeResult, makeSubmittedAttempt } from '../helpers.js';

describe('DimensionScore', () => {
  it('scales earned/possible to the weight', () => {
    expect(new DimensionScore({ dimension: Dimension.ABSTRACTION, earned: 1, possible: 3, weight: 20 }).score).toBe(6.7);
  });

  it('gives full marks when there was nothing to check', () => {
    expect(new DimensionScore({ dimension: Dimension.ABSTRACTION, earned: 0, possible: 0, weight: 20 }).score).toBe(20);
  });

  it('rejects earned > possible', () => {
    expect(() => new DimensionScore({ dimension: Dimension.ABSTRACTION, earned: 4, possible: 3, weight: 20 })).toThrow();
  });
});

describe('EvaluationResult.merge', () => {
  it('keeps rule scores and appends LLM items', () => {
    const rules = makeResult({ earned: 5, items: [makeIssue('SRP:A')] });
    const llm = makeResult({ earned: 10, items: [makeIssue(null, { source: FeedbackSource.LLM })] });

    const merged = rules.merge(llm);
    expect(merged.totalScore).toBe(rules.totalScore);
    expect(merged.items).toHaveLength(2);
  });
});

describe('compareAttempts', () => {
  const scored = (earned, items) => {
    const attempt = makeSubmittedAttempt({ learnerId: 'l', problemId: 'p' });
    attempt.startEvaluation();
    attempt.complete(makeResult({ earned, items }));
    return attempt;
  };

  it('reports fixed and new issues and the score delta', () => {
    const previous = scored(5, [makeIssue('SRP:A'), makeIssue('ORPHAN:B')]);
    const latest = scored(8, [makeIssue('ORPHAN:B'), makeIssue('GOD_CLASS:C')]);

    const diff = compareAttempts(previous, latest);
    expect(diff.scoreDelta).toBe(30);
    expect(diff.fixed.map((i) => i.key)).toEqual(['SRP:A']);
    expect(diff.introduced.map((i) => i.key)).toEqual(['GOD_CLASS:C']);
    expect(diff.persistingCount).toBe(1);
    expect(diff.dimensionDeltas.every((d) => d.delta === 3 && d.possible === 10)).toBe(true); // 5/10 → 8/10
  });

  it('ignores LLM items, which have no stable key', () => {
    const llmItem = makeIssue(null, { source: FeedbackSource.LLM });
    const diff = compareAttempts(scored(5, [llmItem]), scored(5, []));
    expect(diff.fixed).toEqual([]);
  });
});

describe('Submission invariants', () => {
  it.each([
    [{ entities: [{ name: 'A', kind: 'klass' }] }, /Invalid kind of A/],
    [{ entities: [{ kind: 'class' }] }, /Every entity needs a name/],
    [{ entities: [{ name: 'A', kind: 'class' }], relationships: [{ from: 'A', to: 'A', type: 'likes' }] }, /Invalid relationship type/],
  ])('rejects invalid input even without the parser: %j', (input, error) => {
    expect(() => new Submission(input)).toThrow(error);
  });
});
