import { z } from 'zod';
import { ValidationError } from '../domain/errors.js';

const learnerId = z.string().trim().regex(/^[A-Za-z0-9_-]{8,64}$/, 'must be 8–64 letters, digits, "-" or "_"');
const problemId = z.string().trim().min(1).max(64);
const draftText = z.string().max(50_000, 'is too long (max 50,000 characters)');

export const schemas = {
  learnerParams: z.object({ learnerId }),
  startAttempt: z.object({ learnerId, problemId }),
  saveDraft: z.object({ learnerId, draftText }),
  submit: z.object({ learnerId, draftText: draftText.optional() }),
  retry: z.object({ learnerId }),
  historyQuery: z.object({ problemId: problemId.optional() }),
};

/**
 * Parses request input or throws a ValidationError (→ 400) listing every problem.
 * @template T
 * @param {z.ZodType<T>} schema
 * @param {unknown} input
 * @returns {T}
 */
export function validate(schema, input) {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => {
    const field = issue.path.join('.') || 'body';
    const value = issue.path.reduce((node, key) => node?.[key], input);
    if (issue.code === 'invalid_type' && value === undefined) return `${field} is required`;
    if (issue.code === 'invalid_type') return `${field} must be ${issue.expected === 'string' ? 'text' : `a ${issue.expected}`}`;
    return `${field} ${issue.message}`;
  });
  throw new ValidationError('The request is invalid.', details);
}
