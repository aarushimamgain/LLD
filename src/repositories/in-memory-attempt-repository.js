import { Attempt } from '../domain/attempt.js';
import { AttemptStatus } from '../domain/enums.js';
import { ConflictError } from '../domain/errors.js';
import { AttemptRepository } from './attempt-repository.js';

/**
 * Keeps attempts in a Map for tests and keyless local runs. Stores JSON snapshots rather than
 * live objects so it behaves like a real database: changes are only visible after save().
 * Data is lost when the process exits.
 */
export class InMemoryAttemptRepository extends AttemptRepository {
  #rows = new Map();

  async save(attempt) {
    // Mirrors the unique (learner_id, problem_id, attempt_number) constraint in supabase/schema.sql.
    const clash = [...this.#rows.values()].some((row) => row.id !== attempt.id
      && row.learnerId === attempt.learnerId && row.problemId === attempt.problemId && row.attemptNumber === attempt.attemptNumber);
    if (clash) throw new ConflictError('Another attempt at this problem was started at the same moment. Reload and try again.');
    this.#rows.set(attempt.id, structuredClone(attempt.toJSON()));
    return Attempt.fromJSON(this.#rows.get(attempt.id));
  }

  async findById(id) {
    const row = this.#rows.get(id);
    return row ? Attempt.fromJSON(row) : null;
  }

  async listByLearnerAndProblem(learnerId, problemId) {
    return this.#list((row) => row.learnerId === learnerId && row.problemId === problemId);
  }

  async listByLearner(learnerId) {
    return this.#list((row) => row.learnerId === learnerId);
  }

  async findStuckEvaluating({ olderThan = new Date() } = {}) {
    return this.#list((row) => row.status === AttemptStatus.EVALUATING && new Date(row.updatedAt) < olderThan);
  }

  #list(predicate) {
    return [...this.#rows.values()]
      .filter(predicate)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((row) => Attempt.fromJSON(row));
  }
}
