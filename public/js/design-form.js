import { esc } from './dom.js';

/**
 * The structured design editor. Form state mirrors the submission format, except that
 * responsibilities and methods are kept as one-per-line text for easy typing.
 *
 * Inputs carry data-path="entities.0.name" etc.; updateField() writes them back into state.
 */

const KINDS = ['class', 'interface', 'abstract', 'enum'];
const RELATIONSHIP_TYPES = [
  { value: 'has-a', label: 'has-a (owns)' },
  { value: 'is-a', label: 'is-a (extends)' },
  { value: 'implements', label: 'implements' },
  { value: 'uses', label: 'uses' },
];
const COMMON_PATTERNS = ['Strategy', 'State', 'Observer', 'Factory', 'Singleton', 'Command', 'Decorator', 'Chain of Responsibility', 'Mediator', 'Builder'];

const blankEntity = () => ({ name: '', kind: 'class', responsibilities: '', methods: '' });
const blankRelationship = () => ({ from: '', to: '', type: 'has-a', cardinality: '' });
const blankPattern = () => ({ name: '', where: '', why: '' });

export function emptyForm() {
  return { entities: [blankEntity()], relationships: [], patterns: [], keyFlows: '', tradeOffs: '', assumptions: '' };
}

/** Builds form state from saved draft text (submission JSON). Unreadable text starts an empty form. */
export function formFromDraft(draftText) {
  if (!draftText?.trim()) return { form: emptyForm(), warning: null };
  try {
    return { form: formFromSubmission(JSON.parse(draftText)), warning: null };
  } catch {
    return { form: emptyForm(), warning: 'Your saved draft could not be read, so the form starts empty.' };
  }
}

export function formFromSubmission(design) {
  const text = (value) => (Array.isArray(value) ? value.join('\n') : String(value ?? ''));
  const entities = (design.entities ?? []).map((e) => ({
    name: e.name ?? '',
    kind: KINDS.includes(e.kind) ? e.kind : 'class',
    responsibilities: text(e.responsibilities),
    methods: text(e.methods),
  }));
  return {
    entities: entities.length ? entities : [blankEntity()],
    relationships: (design.relationships ?? []).map((r) => ({ ...blankRelationship(), ...r, cardinality: r.cardinality ?? '' })),
    patterns: (design.patterns ?? []).map((p) => ({ ...blankPattern(), ...p })),
    keyFlows: text(design.keyFlows),
    tradeOffs: text(design.tradeOffs),
    assumptions: text(design.assumptions),
  };
}

/** Form state → submission JSON. Completely blank rows are dropped; half-filled ones are kept so the server can explain them. */
export function formToSubmission(form) {
  const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    entities: form.entities
      .filter((e) => e.name.trim() || e.responsibilities.trim() || e.methods.trim())
      .map((e) => ({ name: e.name.trim(), kind: e.kind, responsibilities: lines(e.responsibilities), methods: lines(e.methods) })),
    relationships: form.relationships
      .filter((r) => r.from || r.to)
      .map((r) => ({ from: r.from, to: r.to, type: r.type, ...(r.cardinality.trim() ? { cardinality: r.cardinality.trim() } : {}) })),
    patterns: form.patterns
      .filter((p) => p.name.trim() || p.why.trim())
      .map((p) => ({ name: p.name.trim(), where: p.where.trim(), why: p.why.trim() })),
    keyFlows: form.keyFlows,
    tradeOffs: form.tradeOffs,
    assumptions: form.assumptions,
  };
}

/** Writes an input's value into form state. Returns true if other parts of the form depend on it. */
export function updateField(form, path, value) {
  const keys = path.split('.');
  let target = form;
  for (const key of keys.slice(0, -1)) target = target[key];
  target[keys.at(-1)] = value;
  return /^entities\.\d+\.name$/.test(path); // entity names feed the relationship and pattern dropdowns
}

/** Add/remove rows. Returns false for unknown actions. */
export function applyFormAction(form, action, index) {
  const actions = {
    'add-entity': () => form.entities.push(blankEntity()),
    'remove-entity': () => form.entities.splice(index, 1),
    'add-relationship': () => form.relationships.push(blankRelationship()),
    'remove-relationship': () => form.relationships.splice(index, 1),
    'add-pattern': () => form.patterns.push(blankPattern()),
    'remove-pattern': () => form.patterns.splice(index, 1),
  };
  if (!actions[action]) return false;
  actions[action]();
  if (form.entities.length === 0) form.entities.push(blankEntity());
  return true;
}

export function renderDesignForm(form, { readOnly = false } = {}) {
  const disabled = readOnly ? 'disabled' : '';
  const names = form.entities.map((e) => e.name.trim()).filter(Boolean);

  return `
    <section class="form-section">
      <div class="section-head">
        <div>
          <h3>Entities</h3>
          <p class="hint">Classes, interfaces, abstract classes and enums. One responsibility or method per line.</p>
        </div>
        ${readOnly ? '' : '<button type="button" class="btn btn-secondary" data-action="add-entity">+ Entity</button>'}
      </div>
      <div class="entity-grid">
        ${form.entities.map((e, i) => renderEntity(e, i, disabled, readOnly)).join('')}
      </div>
    </section>

    <section class="form-section">
      <div class="section-head">
        <div>
          <h3>Relationships</h3>
          <p class="hint">How entities connect. Give has-a relationships a cardinality like 1, 0..1 or 1..*.</p>
        </div>
        ${readOnly ? '' : '<button type="button" class="btn btn-secondary" data-action="add-relationship">+ Relationship</button>'}
      </div>
      ${form.relationships.length === 0 ? '<p class="empty-row">No relationships yet.</p>' : `
        <div class="rows">
          ${form.relationships.map((r, i) => `
            <div class="row relationship-row">
              ${entitySelect(`relationships.${i}.from`, r.from, names, disabled, 'From')}
              <select data-path="relationships.${i}.type" aria-label="Relationship type" ${disabled}>
                ${RELATIONSHIP_TYPES.map((t) => `<option value="${t.value}" ${t.value === r.type ? 'selected' : ''}>${t.label}</option>`).join('')}
              </select>
              ${entitySelect(`relationships.${i}.to`, r.to, names, disabled, 'To')}
              <input data-path="relationships.${i}.cardinality" value="${esc(r.cardinality)}" placeholder="cardinality" aria-label="Cardinality" ${disabled}>
              ${readOnly ? '' : `<button type="button" class="icon-btn" data-action="remove-relationship" data-index="${i}" aria-label="Remove relationship">✕</button>`}
            </div>`).join('')}
        </div>`}
    </section>

    <section class="form-section">
      <div class="section-head">
        <div>
          <h3>Patterns</h3>
          <p class="hint">Name a pattern only where something varies, and say why it is worth its cost.</p>
        </div>
        ${readOnly ? '' : '<button type="button" class="btn btn-secondary" data-action="add-pattern">+ Pattern</button>'}
      </div>
      <datalist id="pattern-names">${COMMON_PATTERNS.map((p) => `<option value="${p}">`).join('')}</datalist>
      ${form.patterns.length === 0 ? '<p class="empty-row">No patterns yet.</p>' : `
        <div class="rows">
          ${form.patterns.map((p, i) => `
            <div class="row pattern-row">
              <input data-path="patterns.${i}.name" value="${esc(p.name)}" list="pattern-names" placeholder="Pattern" aria-label="Pattern name" ${disabled}>
              ${entitySelect(`patterns.${i}.where`, p.where, names, disabled, 'Where')}
              <input data-path="patterns.${i}.why" value="${esc(p.why)}" placeholder="Why here? What does it cost?" aria-label="Why" ${disabled}>
              ${readOnly ? '' : `<button type="button" class="icon-btn" data-action="remove-pattern" data-index="${i}" aria-label="Remove pattern">✕</button>`}
            </div>`).join('')}
        </div>`}
    </section>

    <section class="form-section two-col">
      <label class="field">
        <span class="field-label">Key flows</span>
        <span class="hint">Walk through the main use cases as calls between your classes, including failure paths.</span>
        <textarea data-path="keyFlows" rows="${rowsFor(form.keyFlows, 7)}" placeholder="Park: Gate → ParkingLot.park(vehicle) → SpotAllocator.allocate(vehicle) → new Ticket(...)&#10;If no spot fits: …" ${disabled}>${esc(form.keyFlows)}</textarea>
      </label>
      <label class="field">
        <span class="field-label">Trade-offs</span>
        <span class="hint">Key decisions, the alternative you rejected, and what each one costs.</span>
        <textarea data-path="tradeOffs" rows="${rowsFor(form.tradeOffs, 7)}" placeholder="Strategy for pricing: one more interface, but new tariffs don't touch ParkingLot." ${disabled}>${esc(form.tradeOffs)}</textarea>
      </label>
    </section>`;
}

function renderEntity(entity, i, disabled, readOnly) {
  return `
    <div class="entity-card">
      <div class="entity-head">
        <input class="entity-name" data-path="entities.${i}.name" value="${esc(entity.name)}" placeholder="EntityName" aria-label="Entity name" ${disabled}>
        <select data-path="entities.${i}.kind" aria-label="Kind" ${disabled}>
          ${KINDS.map((k) => `<option ${k === entity.kind ? 'selected' : ''}>${k}</option>`).join('')}
        </select>
        ${readOnly ? '' : `<button type="button" class="icon-btn" data-action="remove-entity" data-index="${i}" aria-label="Remove entity">✕</button>`}
      </div>
      <label class="mini-label">Responsibilities
        <textarea data-path="entities.${i}.responsibilities" rows="${rowsFor(entity.responsibilities, 3)}" placeholder="Know which spots are free" ${disabled}>${esc(entity.responsibilities)}</textarea>
      </label>
      <label class="mini-label">Methods
        <textarea data-path="entities.${i}.methods" rows="${rowsFor(entity.methods, 2)}" placeholder="park(vehicle): Ticket" ${disabled}>${esc(entity.methods)}</textarea>
      </label>
    </div>`;
}

/** Dropdown of declared entity names; keeps an undeclared current value visible instead of silently dropping it. */
function entitySelect(path, value, names, disabled, label) {
  return `
    <select class="entity-select" data-path="${path}" data-label="${label}" aria-label="${label}" ${disabled}>
      ${entityOptions(value, names, label)}
    </select>`;
}

function entityOptions(value, names, label) {
  const options = value && !names.includes(value) ? [...names, value] : names;
  return `<option value="">${label}…</option>`
    + options.map((n) => `<option value="${esc(n)}" ${n === value ? 'selected' : ''}>${esc(n)}${names.includes(n) ? '' : ' (undeclared)'}</option>`).join('');
}

/**
 * After an entity is renamed, refreshes only the entity dropdowns in place. A full re-render here
 * would steal focus from the field the learner just clicked into.
 */
export function refreshEntitySelects(container, form) {
  const names = form.entities.map((e) => e.name.trim()).filter(Boolean);
  for (const select of container.querySelectorAll('select.entity-select')) {
    const keys = select.dataset.path.split('.');
    const value = form[keys[0]][Number(keys[1])][keys[2]];
    select.innerHTML = entityOptions(value, names, select.dataset.label);
  }
}

/** Rows needed to show `text` without scrolling (textareas also grow while typing; see app.js). */
function rowsFor(text, min) {
  return Math.max(min, String(text).split('\n').length + 1);
}
