/**
 * Storage for Attempts. Implementations map to and from their own storage format and
 * always hand back fresh Attempt instances, so callers never share mutable state with storage.
 * Lists are ordered oldest first (by createdAt).
 * @abstract
 */
export class AttemptRepository {
  /**
   * Inserts or replaces the attempt with the same id.
   * @param {import('../domain/attempt.js').Attempt} attempt
   * @returns {Promise<import('../domain/attempt.js').Attempt>}
   */
  async save(attempt) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} id
   * @returns {Promise<import('../domain/attempt.js').Attempt | null>} null when not found or the id is malformed
   */
  async findById(id) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} learnerId
   * @param {string} problemId
   * @returns {Promise<import('../domain/attempt.js').Attempt[]>}
   */
  async listByLearnerAndProblem(learnerId, problemId) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} learnerId
   * @returns {Promise<import('../domain/attempt.js').Attempt[]>}
   */
  async listByLearner(learnerId) {
    throw new Error('Not implemented');
  }

  /**
   * Attempts left in EVALUATING, e.g. by a server restart mid-evaluation.
   * @param {{olderThan?: Date}} [options] only attempts last updated before this time (default: now)
   * @returns {Promise<import('../domain/attempt.js').Attempt[]>}
   */
  async findStuckEvaluating(options) {
    throw new Error('Not implemented');
  }
}
