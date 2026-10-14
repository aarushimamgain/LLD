import { jest } from '@jest/globals';
import { AttemptStatus, ConflictError } from '../../src/domain/index.js';
import { createAttemptRepository } from '../../src/repositories/create-attempt-repository.js';
import { InMemoryAttemptRepository } from '../../src/repositories/in-memory-attempt-repository.js';
import { SupabaseAttemptRepository, fromRow, toRow } from '../../src/repositories/supabase-attempt-repository.js';
import { makeIssue, makeResult, makeSubmittedAttempt } from '../helpers.js';

const at = (iso) => new Date(iso);
const attempt = ({ learnerId = 'learner-1', problemId = 'parking-lot', attemptNumber = 1, now = at('2020-01-01T10:00:00Z') } = {}) =>
  makeSubmittedAttempt({ learnerId, problemId, attemptNumber, now });

describe('InMemoryAttemptRepository', () => {
  let repo;
  beforeEach(() => {
    repo = new InMemoryAttemptRepository();
  });

  it('saves and finds by id', async () => {
    const saved = await repo.save(attempt());
    const found = await repo.findById(saved.id);
    expect(found.toJSON()).toEqual(saved.toJSON());
  });

  it('returns null for unknown ids', async () => {
    expect(await repo.findById('nope')).toBeNull();
  });

  it('does not leak changes made after save', async () => {
    const original = attempt();
    await repo.save(original);
    original.startEvaluation();
    expect((await repo.findById(original.id)).status).toBe(AttemptStatus.SUBMITTED);
  });

  it('updates an existing attempt on save', async () => {
    const a = attempt();
    await repo.save(a);
    a.startEvaluation();
    a.complete(makeResult({ items: [makeIssue('SRP:ParkingLot')] }));
    await repo.save(a);

    const found = await repo.findById(a.id);
    expect(found.status).toBe(AttemptStatus.EVALUATED);
    expect(found.result.items[0].key).toBe('SRP:ParkingLot');
  });

  it('lists by learner and problem, oldest first', async () => {
    const second = attempt({ attemptNumber: 2, now: at('2020-01-01T11:00:00Z') });
    const first = attempt({ attemptNumber: 1, now: at('2020-01-01T10:00:00Z') });
    await repo.save(second);
    await repo.save(first);
    await repo.save(attempt({ problemId: 'elevator' }));
    await repo.save(attempt({ learnerId: 'someone-else' }));

    const list = await repo.listByLearnerAndProblem('learner-1', 'parking-lot');
    expect(list.map((a) => a.attemptNumber)).toEqual([1, 2]);
    expect(await repo.listByLearner('learner-1')).toHaveLength(3);
  });

  it('finds attempts stuck in EVALUATING before a cutoff', async () => {
    const stuck = attempt({ attemptNumber: 1 });
    stuck.startEvaluation(at('2020-01-01T10:00:00Z'));
    const fresh = attempt({ attemptNumber: 2 });
    fresh.startEvaluation(at('2020-01-01T12:00:00Z'));
    await repo.save(stuck);
    await repo.save(fresh);
    await repo.save(attempt({ attemptNumber: 3 }));

    const found = await repo.findStuckEvaluating({ olderThan: at('2020-01-01T11:00:00Z') });
    expect(found.map((a) => a.id)).toEqual([stuck.id]);
    expect(await repo.findStuckEvaluating()).toHaveLength(2);
  });
});

describe('attempt number uniqueness', () => {
  it('rejects a second attempt with the same number, like the database constraint', async () => {
    const repo = new InMemoryAttemptRepository();
    await repo.save(attempt({ attemptNumber: 1 }));
    await expect(repo.save(attempt({ attemptNumber: 1 }))).rejects.toThrow(ConflictError);
    await expect(repo.save(attempt({ attemptNumber: 1, problemId: 'elevator' }))).resolves.toBeDefined();
  });

  it('maps a Postgres unique violation to a ConflictError', async () => {
    const client = { from: () => ({ upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) }) }) };
    await expect(new SupabaseAttemptRepository(client).save(attempt())).rejects.toThrow(ConflictError);
  });
});

describe('Supabase row mapping', () => {
  it('round-trips an evaluated attempt through a row', () => {
    const a = attempt({ attemptNumber: 3 });
    a.startEvaluation();
    a.completePartially(makeResult({ earned: 7, items: [makeIssue('ORPHAN:DisplayBoard')] }), 'AI review timed out');

    const row = toRow(a);
    expect(row).toMatchObject({
      learner_id: 'learner-1',
      problem_id: 'parking-lot',
      attempt_number: 3,
      status: 'PARTIALLY_EVALUATED',
      error_message: 'AI review timed out',
    });
    // Simulate Postgres: jsonb comes back as plain objects, timestamps as strings.
    expect(fromRow(JSON.parse(JSON.stringify(row))).toJSON()).toEqual(a.toJSON());
  });

  it('maps a row without an evaluation', () => {
    const row = JSON.parse(JSON.stringify(toRow(attempt())));
    expect(row.evaluation).toBeNull();
    expect(fromRow(row).result).toBeNull();
  });
});

describe('SupabaseAttemptRepository', () => {
  it('treats a malformed id as not found without querying', async () => {
    const client = { from: jest.fn() };
    expect(await new SupabaseAttemptRepository(client).findById('not-a-uuid')).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('createAttemptRepository', () => {
  const logger = { warn: jest.fn() };
  beforeEach(() => logger.warn.mockClear());

  it('falls back to in-memory with a warning when unconfigured', () => {
    expect(createAttemptRepository({}, logger)).toBeInstanceOf(InMemoryAttemptRepository);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('in-memory'));
  });

  it('uses Supabase when both variables are set', () => {
    const repo = createAttemptRepository({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'key' }, logger);
    expect(repo).toBeInstanceOf(SupabaseAttemptRepository);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('fails fast when only one variable is set', () => {
    expect(() => createAttemptRepository({ SUPABASE_URL: 'https://abc.supabase.co' }, logger)).toThrow(/both/);
  });

  it('explains when given a database connection string instead of the project URL', () => {
    const env = { SUPABASE_URL: 'postgresql://postgres:pw@db.abc.supabase.co:5432/postgres', SUPABASE_SERVICE_ROLE_KEY: 'key' };
    expect(() => createAttemptRepository(env, logger)).toThrow(/project URL.*"postgresql:\.\.\."/);
  });
});
