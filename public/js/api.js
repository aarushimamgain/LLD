const LEARNER_KEY = 'lld.learnerId';
let memoryLearnerId = null;

/**
 * Anonymous learner identity kept in localStorage (no auth; see docs/DESIGN.md §9).
 * Falls back to an in-memory id when storage is blocked.
 */
export function learnerId() {
  try {
    let id = localStorage.getItem(LEARNER_KEY);
    if (!id) {
      id = `learner-${crypto.randomUUID()}`;
      localStorage.setItem(LEARNER_KEY, id);
    }
    return id;
  } catch {
    memoryLearnerId ??= `learner-${crypto.randomUUID()}`;
    return memoryLearnerId;
  }
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `Request failed (${status})`);
    this.status = status;
    this.details = body?.details ?? [];
  }
}

async function call(method, path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: 'Cannot reach the server. Check that it is running.' });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

const me = () => learnerId();

export const api = {
  problems: () => call('GET', '/problems'),
  problem: (id) => call('GET', `/problems/${encodeURIComponent(id)}`),
  sample: (id) => call('GET', `/problems/${encodeURIComponent(id)}/sample`),
  history: (problemId) => call('GET', `/learners/${me()}/attempts${problemId ? `?problemId=${encodeURIComponent(problemId)}` : ''}`),
  attempt: (id) => call('GET', `/attempts/${id}`),
  start: (problemId) => call('POST', '/attempts', { learnerId: me(), problemId }),
  saveDraft: (id, draftText) => call('PUT', `/attempts/${id}`, { learnerId: me(), draftText }),
  submit: (id, draftText) => call('POST', `/attempts/${id}/submit`, { learnerId: me(), draftText }),
  retry: (id) => call('POST', `/attempts/${id}/retry`, { learnerId: me() }),
};
