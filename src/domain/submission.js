import { EntityKind, RelationshipType, assertOneOf } from './enums.js';

/**
 * A learner's structured design. A SubmissionParser produces it with learner-friendly errors;
 * the constructor still guards the invariants evaluators rely on (names, kinds, relationship types).
 */
export class Submission {
  /**
   * @param {object} props
   * @param {{name: string, kind: string, responsibilities: string[], methods: string[]}[]} props.entities
   * @param {{from: string, to: string, type: string, cardinality?: string}[]} [props.relationships]
   * @param {{name: string, where: string, why: string}[]} [props.patterns]
   * @param {string} [props.keyFlows]
   * @param {string} [props.tradeOffs]
   * @param {string} [props.assumptions]
   * @param {string} [props.codeSkeleton]
   */
  constructor({ entities, relationships = [], patterns = [], keyFlows = '', tradeOffs = '', assumptions = '', codeSkeleton = '' }) {
    if (!Array.isArray(entities) || entities.length === 0) throw new Error('Submission needs at least one entity');
    for (const e of entities) {
      if (!e.name) throw new Error('Every entity needs a name');
      assertOneOf(e.kind, EntityKind, `kind of ${e.name}`);
    }
    for (const r of relationships) assertOneOf(r.type, RelationshipType, `relationship type ${r.from} → ${r.to}`);

    this.entities = Object.freeze(entities.map((e) => Object.freeze({
      name: e.name,
      kind: e.kind,
      responsibilities: Object.freeze([...(e.responsibilities ?? [])]),
      methods: Object.freeze([...(e.methods ?? [])]),
    })));
    this.relationships = Object.freeze(relationships.map((r) => Object.freeze({ ...r })));
    this.patterns = Object.freeze(patterns.map((p) => Object.freeze({ ...p })));
    this.keyFlows = keyFlows;
    this.tradeOffs = tradeOffs;
    this.assumptions = assumptions;
    this.codeSkeleton = codeSkeleton;
    Object.freeze(this);
  }

  /** Case-insensitive lookup; learners are inconsistent with casing between sections. */
  findEntity(name) {
    const wanted = normalize(name);
    return this.entities.find((e) => normalize(e.name) === wanted);
  }

  hasEntity(name) {
    return this.findEntity(name) !== undefined;
  }

  relationshipsOf(name) {
    const wanted = normalize(name);
    return this.relationships.filter((r) => normalize(r.from) === wanted || normalize(r.to) === wanted);
  }

  /** Entities that implement or extend `name`. */
  implementersOf(name) {
    const wanted = normalize(name);
    return this.relationships
      .filter((r) => normalize(r.to) === wanted && (r.type === RelationshipType.IMPLEMENTS || r.type === RelationshipType.IS_A))
      .map((r) => r.from);
  }

  toJSON() {
    const { entities, relationships, patterns, keyFlows, tradeOffs, assumptions, codeSkeleton } = this;
    return structuredClone({ entities, relationships, patterns, keyFlows, tradeOffs, assumptions, codeSkeleton });
  }

  static fromJSON(json) {
    return new Submission(json);
  }
}

function normalize(name) {
  return String(name).trim().toLowerCase();
}
