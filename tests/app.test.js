import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { MockLLMClient } from '../src/llm/mock-llm-client.js';
import { InMemoryAttemptRepository } from '../src/repositories/in-memory-attempt-repository.js';
import { loadSample } from './helpers.js';

const LEARNER = 'learner-0001';
const silent = { warn: jest.fn(), error: jest.fn() };

async function buildApp(overrides = {}) {
  return createApp({ attemptRepository: new InMemoryAttemptRepository(), llmClient: new MockLLMClient(), logger: silent, ...overrides });
}

/** Starts a draft, submits `design`, waits for evaluation, returns the evaluated attempt body. */
async function submitAndWait(app, service, design, problemId = 'parking-lot') {
  const start = await request(app).post('/api/attempts').send({ learnerId: LEARNER, problemId });
  const id = start.body.attempt.id;
  const submitted = await request(app).post(`/api/attempts/${id}/submit`).send({ learnerId: LEARNER, draftText: JSON.stringify(design) });
  expect(submitted.status).toBe(202);
  expect(submitted.body.attempt.status).toBe('SUBMITTED');
  await service.whenIdle();
  return (await request(app).get(`/api/attempts/${id}`)).body;
}

describe('problems API', () => {
  let app;
  beforeAll(async () => ({ app } = await buildApp()));

  it('lists problems', async () => {
    const res = await request(app).get('/api/problems');
    expect(res.status).toBe(200);
    expect(res.body.problems.map((p) => p.id)).toEqual(['elevator', 'parking-lot', 'vending-machine']);
  });

  it('returns a problem without its rubric', async () => {
    const res = await request(app).get('/api/problems/parking-lot');
    expect(res.body.problem.clarifyingQuestions.length).toBeGreaterThan(0);
    expect(res.body.problem.rubric).toBeUndefined();
  });

  it('serves a sample design for the demo', async () => {
    const res = await request(app).get('/api/problems/parking-lot/sample');
    expect(res.body.sample.entities[0].name).toBe('ParkingLot');
  });

  it('404s unknown problems and routes as JSON', async () => {
    expect((await request(app).get('/api/problems/chess')).body).toEqual({ error: 'No problem with id "chess"' });
    expect((await request(app).get('/api/nope')).status).toBe(404);
  });
});

describe('attempt lifecycle', () => {
  let app;
  let service;
  beforeEach(async () => ({ app, service } = await buildApp()));

  it('drafts, submits, evaluates and shows feedback', async () => {
    const created = await request(app).post('/api/attempts').send({ learnerId: LEARNER, problemId: 'parking-lot' });
    expect(created.status).toBe(201);
    expect(created.body.attempt).toMatchObject({ status: 'DRAFT', attemptNumber: 1, draftText: '' });
    expect(created.body.attempt.learnerId).toBeUndefined();

    // Reopening returns the same draft instead of creating a second one.
    const reopened = await request(app).post('/api/attempts').send({ learnerId: LEARNER, problemId: 'parking-lot' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.attempt.id).toBe(created.body.attempt.id);

    // Half-written JSON is fine in a draft.
    const id = created.body.attempt.id;
    const saved = await request(app).put(`/api/attempts/${id}`).send({ learnerId: LEARNER, draftText: '{ "entities": [' });
    expect(saved.body.attempt.draftText).toBe('{ "entities": [');
    expect((await request(app).get(`/api/attempts/${id}`)).body.concepts).toBeNull(); // rubric stays hidden until submit

    const body = await submitAndWait(app, service, await loadSample('parking-lot'));
    expect(body.attempt).toMatchObject({ id, status: 'EVALUATED', isRetryable: false });
    expect(body.attempt.result.totalScore).toBe(71);
    expect(body.attempt.result.items.some((i) => i.source === 'LLM')).toBe(true);
    expect(body.comparison).toBeNull();
    expect(body.concepts.find((c) => c.id === 'payment')).toMatchObject({ covered: false, entities: [] });
    expect(body.concepts.find((c) => c.id === 'pricing')).toMatchObject({ covered: true, entities: ['PricingStrategy', 'HourlyPricing'] });
  });

  it('rejects an invalid design with learner-friendly details but keeps the draft', async () => {
    const { body } = await request(app).post('/api/attempts').send({ learnerId: LEARNER, problemId: 'parking-lot' });
    const id = body.attempt.id;

    const res = await request(app).post(`/api/attempts/${id}/submit`).send({ learnerId: LEARNER, draftText: '{"entities": [{"kind": "class"}]}' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Your design has 1 problem to fix before it can be evaluated.', details: ['Entity #1 has no name.'] });

    const after = await request(app).get(`/api/attempts/${id}`);
    expect(after.body.attempt).toMatchObject({ status: 'DRAFT', draftText: '{"entities": [{"kind": "class"}]}' });
  });

  it('pre-fills the next attempt with the previous design and shows progress', async () => {
    const sample = await loadSample('parking-lot');
    await submitAndWait(app, service, sample);

    const next = await request(app).post('/api/attempts').send({ learnerId: LEARNER, problemId: 'parking-lot' });
    expect(next.body.attempt.attemptNumber).toBe(2);
    expect(JSON.parse(next.body.attempt.draftText).entities).toHaveLength(sample.entities.length);

    // Fix two findings: add a payment abstraction, and the missing cardinality.
    const improved = structuredClone(sample);
    improved.entities.push(
      { name: 'PaymentMethod', kind: 'interface', responsibilities: ['Pay an amount'], methods: ['pay(amount): Receipt'] },
      { name: 'CardPayment', kind: 'class', responsibilities: ['Charge a card'], methods: ['pay(amount): Receipt'] },
    );
    improved.relationships.push({ from: 'CardPayment', to: 'PaymentMethod', type: 'implements' });
    improved.relationships.find((r) => r.to === 'ParkingSpot' && r.from === 'ParkingFloor').cardinality = '1..*';
    const id = next.body.attempt.id;
    await request(app).post(`/api/attempts/${id}/submit`).send({ learnerId: LEARNER, draftText: JSON.stringify(improved) });
    await service.whenIdle();

    const { body } = await request(app).get(`/api/attempts/${id}`);
    expect(body.comparison.scoreDelta).toBeGreaterThan(0);
    expect(body.comparison.fixed.map((i) => i.key)).toEqual(expect.arrayContaining(['CONCEPT_MISSING:payment', 'CARDINALITY_MISSING']));

    const history = await request(app).get(`/api/learners/${LEARNER}/attempts?problemId=parking-lot`);
    expect(history.body.attempts.map((a) => a.attemptNumber)).toEqual([1, 2]);
    expect(history.body.attempts[0].totalScore).toBe(71);
    expect(history.body.comparison.latestAttemptId).toBe(id);
  });

  it('refuses to edit or resubmit a submitted attempt', async () => {
    const { attempt } = await submitAndWait(app, service, await loadSample('parking-lot'));
    const edit = await request(app).put(`/api/attempts/${attempt.id}`).send({ learnerId: LEARNER, draftText: '{}' });
    expect(edit.status).toBe(409);
    expect(edit.body.error).toMatch(/already been submitted/);
    expect((await request(app).post(`/api/attempts/${attempt.id}/retry`).send({ learnerId: LEARNER })).status).toBe(409);
  });

  it('answers 409 when two drafts are started at the same moment', async () => {
    // Hold both history reads until both requests have made them, so both really see 'no draft yet'.
    const repo = new InMemoryAttemptRepository();
    const list = repo.listByLearnerAndProblem.bind(repo);
    let waiting = 0;
    let releaseBoth;
    const bothArrived = new Promise((resolve) => { releaseBoth = resolve; });
    repo.listByLearnerAndProblem = async (...args) => {
      const result = await list(...args);
      if (++waiting === 2) releaseBoth();
      await bothArrived;
      return result;
    };
    const { app: racyApp } = await buildApp({ attemptRepository: repo });

    const [first, second] = await Promise.all([
      request(racyApp).post('/api/attempts').send({ learnerId: LEARNER, problemId: 'elevator' }),
      request(racyApp).post('/api/attempts').send({ learnerId: LEARNER, problemId: 'elevator' }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const conflict = first.status === 409 ? first : second;
    expect(conflict.body).toEqual({ error: 'Another attempt at this problem was started at the same moment. Reload and try again.' });
  });

  it('hides attempts from a different learnerId', async () => {
    const { body } = await request(app).post('/api/attempts').send({ learnerId: LEARNER, problemId: 'parking-lot' });
    const res = await request(app).put(`/api/attempts/${body.attempt.id}`).send({ learnerId: 'someone-else', draftText: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('full flow over HTTP, polling like the browser', () => {
  /** Polls GET /api/attempts/:id until evaluation settles, recording every status seen. */
  async function pollUntilSettled(app, id) {
    const seen = [];
    for (let i = 0; i < 100; i++) {
      const res = await request(app).get(`/api/attempts/${id}`);
      expect(res.status).toBe(200);
      if (seen.at(-1) !== res.body.attempt.status) seen.push(res.body.attempt.status);
      if (!['SUBMITTED', 'EVALUATING'].includes(res.body.attempt.status)) return { body: res.body, seen };
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Attempt ${id} never finished evaluating (saw ${seen.join(' → ')})`);
  }

  it('create → submit → poll → evaluated → history', async () => {
    // A slow mock LLM so the intermediate states are observable through the API.
    const { app } = await buildApp({ llmClient: new MockLLMClient({ delayMs: 80 }) });

    const created = await request(app).post('/api/attempts').send({ learnerId: LEARNER, problemId: 'vending-machine' });
    expect(created.status).toBe(201);
    const id = created.body.attempt.id;

    const submitted = await request(app)
      .post(`/api/attempts/${id}/submit`)
      .send({ learnerId: LEARNER, draftText: JSON.stringify(await loadSample('vending-machine')) });
    expect(submitted.status).toBe(202);
    expect(submitted.body.attempt.status).toBe('SUBMITTED');

    const { body, seen } = await pollUntilSettled(app, id);
    expect(seen).toContain('EVALUATING');
    expect(seen.at(-1)).toBe('EVALUATED');
    // 6/10 coverage (payment method, R7), 8 responsibilities, 8 abstraction, 9 relationships, 8 patterns.
    expect(body.attempt.result.totalScore).toBe(75.5);
    expect(body.attempt.result.dimensionScores).toHaveLength(5);
    expect(body.attempt.result.items.filter((i) => i.source === 'RULE').map((i) => i.key)).toEqual([
      'CONCEPT_MISSING:payment-method',
      'REQUIREMENT_UNCOVERED:R7',
      'SRP_TOO_MANY:VendingMachine',
      'SRP_COMPOUND:VendingMachine',
      'ABSTRACTION_EXPECTED:machine-state',
      'ORPHAN:Display',
      'PATTERN_NO_WHY:Singleton@VendingMachine',
      'TRADEOFFS_THIN',
      'PATTERN_SUGGESTED:machine-state',
    ]);
    expect(body.attempt.result.items.some((i) => i.source === 'LLM')).toBe(true);
    expect(body.concepts.filter((c) => !c.covered).map((c) => c.id)).toEqual(['payment-method']);

    const history = await request(app).get(`/api/learners/${LEARNER}/attempts?problemId=vending-machine`);
    expect(history.status).toBe(200);
    expect(history.body.attempts).toEqual([expect.objectContaining({ id, attemptNumber: 1, status: 'EVALUATED', totalScore: 75.5 })]);
    expect(history.body.comparison).toBeNull();

    const all = await request(app).get(`/api/learners/${LEARNER}/attempts`);
    expect(all.body.attempts.map((a) => a.problemId)).toEqual(['vending-machine']);
  });

  it('shows rule feedback while the AI review is still running', async () => {
    const { app } = await buildApp({ llmClient: new MockLLMClient({ delayMs: 200 }) });
    const { body } = await request(app).post('/api/attempts').send({ learnerId: LEARNER, problemId: 'parking-lot' });
    await request(app).post(`/api/attempts/${body.attempt.id}/submit`).send({ learnerId: LEARNER, draftText: JSON.stringify(await loadSample('parking-lot')) });

    let midway;
    for (let i = 0; i < 50; i++) {
      midway = (await request(app).get(`/api/attempts/${body.attempt.id}`)).body.attempt;
      if (midway.result) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(midway.status).toBe('EVALUATING');
    expect(midway.result.totalScore).toBe(71);
    expect(midway.result.items.every((i) => i.source === 'RULE')).toBe(true);
    await pollUntilSettled(app, body.attempt.id);
  });
});

describe('API error cases', () => {
  let app;
  beforeAll(async () => ({ app } = await buildApp()));

  it.each([
    ['GET', '/api/problems/chess', undefined],
    ['GET', '/api/problems/chess/sample', undefined],
    ['POST', '/api/attempts', { learnerId: LEARNER, problemId: 'chess' }],
    ['GET', `/api/learners/${LEARNER}/attempts?problemId=chess`, undefined],
  ])('%s %s → 404 for an unknown problem', async (method, url, body) => {
    const res = await request(app)[method.toLowerCase()](url).send(body);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'No problem with id "chess"' });
  });

  it('404s an unknown attempt', async () => {
    const res = await request(app).get('/api/attempts/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it.each([
    ['an empty design', '', 'Your design is empty.', ['Add at least one entity, then its relationships, key flows and trade-offs.']],
    ['broken JSON', '{"entities": [', 'Your design is not valid JSON.', [expect.stringMatching(/Check for missing commas/)]],
    [
      'invalid fields',
      JSON.stringify({ entities: [{ name: 'Car', kind: 'klass' }], relationships: [{ from: 'Car', to: 'Car', type: 'likes' }] }),
      'Your design has 2 problems to fix before it can be evaluated.',
      [
        'Entity #1 (Car) has kind "klass"; use one of: class, interface, abstract, enum.',
        'Relationship #1 (Car → Car) has type "likes"; use one of: has-a, is-a, uses, implements.',
      ],
    ],
  ])('400 for an invalid submission (%s), and the draft stays editable', async (_, draftText, error, details) => {
    const created = await request(app).post('/api/attempts').send({ learnerId: LEARNER, problemId: 'parking-lot' });
    const res = await request(app).post(`/api/attempts/${created.body.attempt.id}/submit`).send({ learnerId: LEARNER, draftText });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error, details });
    const after = await request(app).get(`/api/attempts/${created.body.attempt.id}`);
    expect(after.body.attempt).toMatchObject({ status: 'DRAFT', draftText });
  });
});

describe('partial evaluation and retry', () => {
  it('keeps rule feedback when the AI review fails, and retries on request', async () => {
    // The delay keeps the retried evaluation running while the second retry arrives.
    const { app, service } = await buildApp({ llmClient: new MockLLMClient({ behavior: 'error', delayMs: 100 }) });
    const { attempt } = await submitAndWait(app, service, await loadSample('elevator'), 'elevator');
    expect(attempt.status).toBe('PARTIALLY_EVALUATED');
    expect(attempt.statusMessage).toMatch(/rule-based feedback are complete/);
    expect(attempt.result.totalScore).toBe(62.5);

    const retry = await request(app).post(`/api/attempts/${attempt.id}/retry`).send({ learnerId: LEARNER });
    expect(retry.status).toBe(202);
    expect(retry.body.attempt.status).toBe('EVALUATING');
    expect((await request(app).post(`/api/attempts/${attempt.id}/retry`).send({ learnerId: LEARNER })).status).toBe(409);
    await service.whenIdle();
  });
});

describe('request validation and errors', () => {
  let app;
  beforeAll(async () => ({ app } = await buildApp()));

  it('explains invalid request bodies', async () => {
    const start = await request(app).post('/api/attempts').send({ learnerId: 'x' });
    expect(start.status).toBe(400);
    expect(start.body.details).toEqual([
      'learnerId must be 8–64 letters, digits, "-" or "_"',
      'problemId is required',
    ]);

    const save = await request(app).put('/api/attempts/abc').send({ learnerId: LEARNER, draftText: 5 });
    expect(save.status).toBe(400);
    expect(save.body.details).toEqual(['draftText must be text']);
  });

  it('answers malformed JSON with 400 and no stack trace', async () => {
    const res = await request(app).post('/api/attempts').set('content-type', 'application/json').send('{"learnerId": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'The request body is not valid JSON.' });
  });

  it('hides unexpected errors behind a generic 500 and logs them', async () => {
    const broken = new InMemoryAttemptRepository();
    broken.findById = async () => { throw new Error('connection refused at db.internal:5432'); };
    const logger = { warn: jest.fn(), error: jest.fn() };
    const { app: brokenApp } = await buildApp({ attemptRepository: broken, logger });

    const res = await request(brokenApp).get('/api/attempts/abc');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our side. Please try again.' });
    expect(JSON.stringify(res.body)).not.toMatch(/db\.internal|at /);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('connection refused'));
  });

  it('still serves health and the static frontend', async () => {
    expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/')).status).toBe(200);
  });
});
