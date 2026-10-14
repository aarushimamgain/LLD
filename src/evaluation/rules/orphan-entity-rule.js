import { Dimension, Severity } from '../../domain/enums.js';
import { Rule } from './rule.js';

/** Every entity should be connected to the rest of the design. */
export class OrphanEntityRule extends Rule {
  constructor() {
    super({ dimension: Dimension.RELATIONSHIPS });
  }

  check(problem, submission) {
    if (submission.entities.length < 2) return [];

    if (submission.relationships.length === 0) {
      return [this.finding({
        key: 'NO_RELATIONSHIPS',
        severity: Severity.ISSUE,
        message: 'Your design has no relationships, so it does not show how the classes work together.',
        evidence: ['relationships'],
        suggestion: 'Add has-a, is-a, uses and implements relationships between your entities, with cardinality for has-a.',
      })];
    }

    return submission.entities
      .filter((e) => submission.relationshipsOf(e.name).length === 0)
      .map((e) => this.finding({
        key: `ORPHAN:${e.name}`,
        severity: Severity.SUGGESTION,
        message: `${e.name} is not connected to any other entity.`,
        evidence: [e.name],
        suggestion: `Show who owns or uses ${e.name} (e.g. "SomeClass has-a ${e.name}" or "SomeClass uses ${e.name}"), or remove it if nothing needs it.`,
      }));
  }
}
