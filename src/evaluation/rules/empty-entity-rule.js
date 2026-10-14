import { Dimension, EntityKind, Severity } from '../../domain/enums.js';
import { hasSubstance } from '../analysis.js';
import { Rule } from './rule.js';

/** Every class or interface should say what it does. Enums are exempt: their values are the point. */
export class EmptyEntityRule extends Rule {
  constructor() {
    super({ dimension: Dimension.RESPONSIBILITIES });
  }

  check(problem, submission) {
    return submission.entities
      .filter((e) => e.kind !== EntityKind.ENUM && !hasSubstance(e))
      .map((e) => this.finding({
        key: `EMPTY:${e.name}`,
        severity: Severity.SUGGESTION,
        message: `${e.name} has no responsibilities or methods, so its role in the design is unclear.`,
        evidence: [e.name],
        suggestion: `List what ${e.name} knows and does (1–3 responsibilities) and its main methods, or remove it if nothing needs it.`,
      }));
  }
}
