import { jest } from '@jest/globals';
import { AttemptStatus } from '../../src/domain/index.js';
import { createEvaluator } from '../../src/evaluation/create-evaluator.js';
import { RuleBasedEvaluator } from '../../src/evaluation/rule-based-evaluator.js';
import { MockLLMClient } from '../../src/llm/mock-llm-client.js';
import { StructuredJsonParser } from '../../src/parsers/structured-json-parser.js';
import { InMemoryAttemptRepository } from '../../src/repositories/in-memory-attempt-repository.js';
import { ProblemCatalog } from '../../src/repositories/problem-catalog.js';
import { PracticeService } from '../../src/services/practice-service.js';
import { loadSample, makeSubmittedAttempt } from '../helpers.js';

const LEARNER = 'learner-0001';
let catalog;
beforeAll(async () => {
  catalog = await ProblemCatalog.fromDirectory();
});

function build({ evaluator = new RuleBasedEvaluator(), repo = new InMemoryAttemptRepository() } = {}) {
  const logger = { warn: jest.fn(), error: jest.fn() };
  const service = new PracticeService({ attemptRepository: repo, problemCatalog: catalog, evaluator, parser: new StructuredJsonParser(), logger });
  return { service, repo, logger };
}

/** Evaluator whose result is released by the test, to observe intermediate states. */
function gatedEvaluator() {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const inner = new RuleBasedEvaluator();
  return {
    release: () => release(),
    async evaluate(problem, submission, { onRuleResult } = {}) {
      const result = await inner.evaluate(problem, submission);
      await onRuleResult?.(result);
      await gate;
      return result;
    },
  };
}

async function submitSample(service) {
  const { attempt } = await service.startAttempt({ learnerId: LEARNER, problemId: 'parking-lot' });
  return service.submit(attempt.id, { learnerId: LEARNER, draftText: JSON.stringify(await loadSample('parking-lot')) });
}

describe('PracticeService evaluation', () => {
  it('returns SUBMITTED immediately and persists rule feedback while still EVALUATING', async () => {
    const evaluator = gatedEvaluator();
    const { service, repo } = build({ evaluator });

    const submitted = await submitSample(service);
    expect(submitted.status).toBe(AttemptStatus.SUBMITTED);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const midway = await repo.findById(submitted.id);
    expect(midway.status).toBe(AttemptStatus.EVALUATING);
    expect(midway.result.totalScore).toBe(71);

    evaluator.release();
    await service.whenIdle();
    expect((await repo.findById(submitted.id)).status).toBe(AttemptStatus.EVALUATED);
  });

  it('marks the attempt FAILED (retryable) when the evaluator throws', async () => {
    const { service, repo, logger } = build({ evaluator: { evaluate: async () => { throw new Error('rule bug'); } } });
    const submitted = await submitSample(service);
    await service.whenIdle();

    const attempt = await repo.findById(submitted.id);
    expect(attempt.status).toBe(AttemptStatus.FAILED);
    expect(attempt.isRetryable).toBe(true);
    expect(attempt.statusMessage).not.toMatch(/rule bug/);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('rule bug'));
  });

  it('does not let a late result overwrite an attempt that was marked FAILED meanwhile', async () => {
    const evaluator = gatedEvaluator();
    const { service, repo } = build({ evaluator });
    const submitted = await submitSample(service);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(await service.recoverStuckEvaluations()).toBe(1);
    evaluator.release();
    await service.whenIdle();
    expect((await repo.findById(submitted.id)).status).toBe(AttemptStatus.FAILED);
  });
});

describe('PracticeService.recoverStuckEvaluations', () => {
  it('fails attempts left EVALUATING, leaving others alone', async () => {
    const { service, repo } = build();
    const stuck = makeSubmittedAttempt({ now: new Date('2020-01-01T00:00:00Z') });
    stuck.startEvaluation(new Date('2020-01-01T00:00:00Z'));
    await repo.save(stuck);
    await repo.save(makeSubmittedAttempt({ attemptNumber: 2 }));

    expect(await service.recoverStuckEvaluations()).toBe(1);
    const recovered = await repo.findById(stuck.id);
    expect(recovered.status).toBe(AttemptStatus.FAILED);
    expect(recovered.statusMessage).toMatch(/server restarted/);
    expect(recovered.isRetryable).toBe(true);
  });
});

/** Submits `design` as the next attempt at the parking lot and waits for evaluation. */
async function submitDesign(service, design) {
  const { attempt } = await service.startAttempt({ learnerId: LEARNER, problemId: 'parking-lot' });
  const submitted = await service.submit(attempt.id, { learnerId: LEARNER, draftText: JSON.stringify(design) });
  await service.whenIdle();
  return (await service.getAttempt(submitted.id)).attempt;
}

const withMockLLM = (behavior) => createEvaluator({
  llmClient: new MockLLMClient({ behavior }),
  timeoutMs: 50,
  logger: { warn: () => {}, error: () => {} },
});

describe('PracticeService with LLM failures', () => {
  it.each(['error', 'hang', 'invalid-json'])('LLM "%s" → PARTIALLY_EVALUATED with rule feedback kept and retry allowed', async (behavior) => {
    const { service } = build({ evaluator: withMockLLM(behavior) });
    const attempt = await submitDesign(service, await loadSample('parking-lot'));

    expect(attempt.status).toBe(AttemptStatus.PARTIALLY_EVALUATED);
    expect(attempt.isRetryable).toBe(true);
    expect(attempt.statusMessage).toMatch(/Your score and rule-based feedback are complete/);
    expect(attempt.result.totalScore).toBe(71);
    expect(attempt.result.items.map((i) => i.key)).toContain('CONCEPT_MISSING:payment');
  });
});

describe('PracticeService.retryEvaluation', () => {
  it('re-runs a FAILED evaluation to EVALUATED', async () => {
    const inner = new RuleBasedEvaluator();
    let calls = 0;
    const flaky = { evaluate: async (...args) => (++calls === 1 ? Promise.reject(new Error('transient')) : inner.evaluate(...args)) };
    const { service } = build({ evaluator: flaky });

    const failed = await submitDesign(service, await loadSample('parking-lot'));
    expect(failed.status).toBe(AttemptStatus.FAILED);

    const retrying = await service.retryEvaluation(failed.id, { learnerId: LEARNER });
    expect(retrying.status).toBe(AttemptStatus.EVALUATING);
    await service.whenIdle();

    const { attempt } = await service.getAttempt(failed.id);
    expect(attempt.status).toBe(AttemptStatus.EVALUATED);
    expect(attempt.statusMessage).toBeNull();
    expect(attempt.result.totalScore).toBe(71);
    expect(calls).toBe(2);
  });

  it('refuses to retry an attempt that was evaluated successfully', async () => {
    const { service } = build();
    const evaluated = await submitDesign(service, await loadSample('parking-lot'));
    await expect(service.retryEvaluation(evaluated.id, { learnerId: LEARNER })).rejects.toThrow(/Only attempts whose evaluation failed or was partial can be retried/);
  });

  it('refuses to retry someone else\'s attempt', async () => {
    const { service } = build({ evaluator: withMockLLM('error') });
    const partial = await submitDesign(service, await loadSample('parking-lot'));
    await expect(service.retryEvaluation(partial.id, { learnerId: 'someone-else' })).rejects.toThrow(/No attempt with id/);
  });
});

describe('PracticeService history and comparison', () => {
  /** The parking lot sample with the payment concept and cardinality fixed, plus a new orphan class. */
  async function improvedSample() {
    const design = await loadSample('parking-lot');
    design.entities.push(
      { name: 'PaymentMethod', kind: 'interface', responsibilities: ['Pay an amount'], methods: ['pay(amount)'] },
      { name: 'CashPayment', kind: 'class', responsibilities: ['Accept cash'], methods: ['pay(amount)'] },
      { name: 'AuditLog', kind: 'class', responsibilities: ['Record every exit'], methods: ['append(entry)'] },
    );
    design.relationships.push({ from: 'CashPayment', to: 'PaymentMethod', type: 'implements' });
    design.relationships.find((r) => r.from === 'ParkingFloor' && r.to === 'ParkingSpot').cardinality = '1..*';
    return design;
  }

  it('lists attempts oldest first, including the open draft last', async () => {
    const { service } = build();
    const first = await submitDesign(service, await loadSample('parking-lot'));
    const second = await submitDesign(service, await improvedSample());
    const { attempt: draft } = await service.startAttempt({ learnerId: LEARNER, problemId: 'parking-lot' });

    const { attempts } = await service.getHistory(LEARNER, { problemId: 'parking-lot' });
    expect(attempts.map((a) => [a.attemptNumber, a.id, a.status])).toEqual([
      [1, first.id, AttemptStatus.EVALUATED],
      [2, second.id, AttemptStatus.EVALUATED],
      [3, draft.id, AttemptStatus.DRAFT],
    ]);
    expect(attempts.map((a) => a.totalScore)).toEqual([71, 77, null]);
  });

  it('compares an attempt with the previous one: fixed issues, new issues and score deltas', async () => {
    const { service } = build();
    const first = await submitDesign(service, await loadSample('parking-lot'));
    const second = await submitDesign(service, await improvedSample());

    expect(await service.compareWithPrevious(first.id)).toBeNull(); // nothing to compare the first attempt with

    const comparison = await service.compareWithPrevious(second.id);
    expect(comparison.previousAttemptId).toBe(first.id);
    expect(comparison.latestAttemptId).toBe(second.id);
    expect(comparison.fixed.map((i) => i.key).sort()).toEqual(['CARDINALITY_MISSING', 'CONCEPT_MISSING:payment']);
    expect(comparison.introduced.map((i) => i.key)).toEqual(['ORPHAN:AuditLog']);
    // 71 → 77: requirements coverage 6 → 8 (+6 weighted), relationships 6 → 6 (cardinality fixed, new orphan).
    expect(comparison.scoreDelta).toBe(6);
    expect(comparison.dimensionDeltas.find((d) => d.dimension === 'requirementsCoverage')).toMatchObject({ previous: 6, latest: 8, delta: 2 });
    expect(comparison.dimensionDeltas.find((d) => d.dimension === 'relationships')).toMatchObject({ previous: 6, latest: 6, delta: 0 });
  });

  it('skips unscored attempts when finding "previous"', async () => {
    const repo = new InMemoryAttemptRepository();
    const down = build({ repo, evaluator: { evaluate: async () => { throw new Error('down'); } } });
    const scored1 = build({ repo });

    const first = await submitDesign(scored1.service, await loadSample('parking-lot'));
    const failed = await submitDesign(down.service, await loadSample('parking-lot'));
    const third = await submitDesign(scored1.service, await improvedSample());
    expect([first.attemptNumber, failed.attemptNumber, third.attemptNumber]).toEqual([1, 2, 3]);
    expect(failed.status).toBe(AttemptStatus.FAILED);

    // Attempt #2 has no scores, so #3 is compared with #1.
    const comparison = await scored1.service.compareWithPrevious(third.id);
    expect(comparison.previousAttemptId).toBe(first.id);
    expect(comparison.scoreDelta).toBe(6);
  });
});

describe('PracticeService robustness', () => {
  it('ends in FAILED, not stuck EVALUATING, when the problem can no longer be loaded', async () => {
    let problemRemoved = false;
    const flakyCatalog = {
      get: (id) => {
        if (problemRemoved) throw new Error(`problem ${id} gone`);
        return catalog.get(id);
      },
      sample: (id) => catalog.sample(id),
      list: () => catalog.list(),
    };
    const repo = new InMemoryAttemptRepository();
    const logger = { warn: jest.fn(), error: jest.fn() };
    const service = new PracticeService({ attemptRepository: repo, problemCatalog: flakyCatalog, evaluator: new RuleBasedEvaluator(), parser: new StructuredJsonParser(), logger });

    const { attempt } = await service.startAttempt({ learnerId: LEARNER, problemId: 'parking-lot' });
    problemRemoved = true;
    const submitted = await service.submit(attempt.id, { learnerId: LEARNER, draftText: JSON.stringify(await loadSample('parking-lot')) });
    await service.whenIdle();

    const after = await repo.findById(submitted.id);
    expect(after.status).toBe(AttemptStatus.FAILED);
    expect(after.isRetryable).toBe(true);
  });
});
