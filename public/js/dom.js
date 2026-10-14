/** Escapes text for safe use inside HTML. Every learner- or server-provided string goes through this. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const DIMENSIONS = [
  { id: 'requirementsCoverage', label: 'Requirements coverage' },
  { id: 'responsibilities', label: 'Responsibilities' },
  { id: 'abstraction', label: 'Abstraction' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'patternsAndTradeoffs', label: 'Patterns & trade-offs' },
];

export const dimensionLabel = (id) => DIMENSIONS.find((d) => d.id === id)?.label ?? id;

const STATUS = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'Submitted', tone: 'info' },
  EVALUATING: { label: 'Evaluating', tone: 'info' },
  EVALUATED: { label: 'Evaluated', tone: 'good' },
  PARTIALLY_EVALUATED: { label: 'Partial', tone: 'warn' },
  FAILED: { label: 'Failed', tone: 'bad' },
};

export const IN_PROGRESS = new Set(['SUBMITTED', 'EVALUATING']);

export function statusBadge(status) {
  const { label, tone } = STATUS[status] ?? { label: status, tone: 'neutral' };
  const spinner = IN_PROGRESS.has(status) ? '<span class="spinner" aria-hidden="true"></span>' : '';
  return `<span class="badge badge-${tone}">${spinner}${esc(label)}</span>`;
}

export function difficultyBadge(difficulty) {
  return `<span class="pill pill-${esc(difficulty)}">${esc(difficulty)}</span>`;
}

export function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatScore(value) {
  return value === null || value === undefined ? '—' : String(Math.round(value * 10) / 10);
}

export function signed(value) {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export function debounce(fn, ms) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}
