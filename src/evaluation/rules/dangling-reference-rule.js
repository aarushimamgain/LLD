import { Dimension, Severity } from '../../domain/enums.js';
import { Rule } from './rule.js';

/** Relationships must connect declared entities. */
export class DanglingReferenceRule extends Rule {
  constructor() {
    super({ dimension: Dimension.RELATIONSHIPS });
  }

  check(problem, submission) {
    const undeclared = new Map(); // lower-case → name as first written
    for (const r of submission.relationships) {
      for (const name of [r.from, r.to]) {
        if (!submission.hasEntity(name) && !undeclared.has(name.toLowerCase())) undeclared.set(name.toLowerCase(), name);
      }
    }
    return [...undeclared.values()].map((name) => this.finding({
      key: `DANGLING:${name}`,
      severity: Severity.ISSUE,
      message: `A relationship refers to "${name}", which is not declared as an entity.`,
      evidence: [name],
      suggestion: `Add "${name}" to entities with its kind and responsibilities, or fix the name in the relationship.`,
    }));
  }
}
