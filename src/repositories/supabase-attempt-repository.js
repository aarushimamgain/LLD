import { Attempt } from '../domain/attempt.js';
import { AttemptStatus } from '../domain/enums.js';
import { ConflictError } from '../domain/errors.js';
import { EvaluationResult } from '../domain/evaluation-result.js';
import { Submission } from '../domain/submission.js';
import { AttemptRepository } from './attempt-repository.js';

const TABLE = 'attempts';
const UNIQUE_VIOLATION = '23505'; // Postgres error code
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Stores attempts in the Supabase `attempts` table (see supabase/schema.sql).
 * The client must be created with the service_role key, which bypasses RLS; it is server-only.
 */
export class SupabaseAttemptRepository extends AttemptRepository {
  #client;

  /** @param {import('@supabase/supabase-js').SupabaseClient} client */
  constructor(client) {
    super();
    this.#client = client;
  }

  async save(attempt) {
    const { data, error } = await this.#client
      .from(TABLE)
      .upsert(toRow(attempt), { onConflict: 'id' })
      .select()
      .single();
    return fromRow(unwrap(data, error, 'save attempt'));
  }

  async findById(id) {
    // Postgres rejects malformed uuids with an error; for callers that is simply "not found".
    if (!UUID.test(id)) return null;
    const { data, error } = await this.#client.from(TABLE).select('*').eq('id', id).maybeSingle();
    const row = unwrap(data, error, 'find attempt');
    return row ? fromRow(row) : null;
  }

  async listByLearnerAndProblem(learnerId, problemId) {
    const { data, error } = await this.#client
      .from(TABLE)
      .select('*')
      .eq('learner_id', learnerId)
      .eq('problem_id', problemId)
      .order('created_at', { ascending: true });
    return unwrap(data, error, 'list attempts').map(fromRow);
  }

  async listByLearner(learnerId) {
    const { data, error } = await this.#client
      .from(TABLE)
      .select('*')
      .eq('learner_id', learnerId)
      .order('created_at', { ascending: true });
    return unwrap(data, error, 'list attempts').map(fromRow);
  }

  async findStuckEvaluating({ olderThan = new Date() } = {}) {
    const { data, error } = await this.#client
      .from(TABLE)
      .select('*')
      .eq('status', AttemptStatus.EVALUATING)
      .lt('updated_at', olderThan.toISOString())
      .order('created_at', { ascending: true });
    return unwrap(data, error, 'find stuck attempts').map(fromRow);
  }
}

function unwrap(data, error, action) {
  if (error?.code === UNIQUE_VIOLATION) throw new ConflictError('Another attempt at this problem was started at the same moment. Reload and try again.');
  if (error) throw new Error(`Supabase: could not ${action}: ${error.message}`);
  return data;
}

/** Attempt → table row. The only place that knows column names. */
export function toRow(attempt) {
  return {
    id: attempt.id,
    learner_id: attempt.learnerId,
    problem_id: attempt.problemId,
    attempt_number: attempt.attemptNumber,
    status: attempt.status,
    draft_text: attempt.draftText,
    submission: attempt.submission ? attempt.submission.toJSON() : null,
    evaluation: attempt.result ? attempt.result.toJSON() : null,
    error_message: attempt.statusMessage,
    created_at: attempt.createdAt.toISOString(),
    updated_at: attempt.updatedAt.toISOString(),
  };
}

/** Table row → Attempt. Rehydrates directly, without replaying state transitions. */
export function fromRow(row) {
  return new Attempt({
    id: row.id,
    learnerId: row.learner_id,
    problemId: row.problem_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    draftText: row.draft_text ?? '',
    submission: row.submission ? Submission.fromJSON(row.submission) : null,
    result: row.evaluation ? EvaluationResult.fromJSON(row.evaluation) : null,
    statusMessage: row.error_message,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}
