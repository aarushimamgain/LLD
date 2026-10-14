import { Dimension, EntityKind, RelationshipType, Severity } from '../../domain/enums.js';
import { isAbstractKind } from '../analysis.js';
import { Rule } from './rule.js';

/** Abstractions should be used consistently: implemented by something, and "implements" only targets interfaces. */
export class AbstractionUsageRule extends Rule {
  constructor() {
    super({ dimension: Dimension.ABSTRACTION });
  }

  check(problem, submission) {
    const unimplemented = submission.entities
      .filter((e) => isAbstractKind(e) && submission.implementersOf(e.name).length === 0)
      .map((e) => this.finding({
        key: `UNIMPLEMENTED:${e.name}`,
        severity: Severity.SUGGESTION,
        message: `${e.name} is ${e.kind === EntityKind.INTERFACE ? 'an interface' : 'abstract'}, but nothing implements or extends it.`,
        evidence: [e.name],
        suggestion: `Add at least one concrete implementation with an "implements"/"is-a" relationship to ${e.name}, or make it a concrete class if only one version will ever exist.`,
      }));

    const wrongImplements = submission.relationships
      .filter((r) => r.type === RelationshipType.IMPLEMENTS)
      .filter((r) => {
        const target = submission.findEntity(r.to);
        return target !== undefined && target.kind !== EntityKind.INTERFACE;
      })
      .map((r) => this.finding({
        key: `IMPLEMENTS_NON_INTERFACE:${r.from}->${r.to}`,
        severity: Severity.SUGGESTION,
        message: `${r.from} "implements" ${r.to}, but ${r.to} is not an interface.`,
        evidence: [r.from, r.to],
        suggestion: `Use "is-a" to extend a class, or make ${r.to} an interface if it only defines a contract.`,
      }));

    return [...unimplemented, ...wrongImplements];
  }
}
