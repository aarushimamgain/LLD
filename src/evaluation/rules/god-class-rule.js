import { Dimension, EntityKind, Severity } from '../../domain/enums.js';
import { Rule } from './rule.js';

const MAX_METHODS = 10;
const MAX_CONNECTED_SHARE = 0.5;
const MIN_CLASSES = 5; // in tiny designs every class is "connected to most others"

/**
 * A class with too many methods, or wired to most of the design, is becoming a god class.
 * Enums are values held in fields, not collaborators, so they count on neither side of the share.
 */
export class GodClassRule extends Rule {
  constructor() {
    super({ dimension: Dimension.RESPONSIBILITIES });
  }

  check(problem, submission) {
    const classes = submission.entities.filter((e) => e.kind !== EntityKind.ENUM);
    const total = classes.length;
    if (total < MIN_CLASSES) return [];

    return classes
      .flatMap((entity) => {
        const connected = this.#connectedEntities(submission, entity);
        const share = connected / (total - 1);
        const tooManyMethods = entity.methods.length > MAX_METHODS;
        if (share <= MAX_CONNECTED_SHARE && !tooManyMethods) return [];

        const reasons = [
          share > MAX_CONNECTED_SHARE ? `is connected to ${connected} of the other ${total - 1} classes` : null,
          tooManyMethods ? `has ${entity.methods.length} methods` : null,
        ].filter(Boolean);
        return [this.finding({
          key: `GOD_CLASS:${entity.name}`,
          severity: Severity.SUGGESTION,
          message: `${entity.name} ${reasons.join(' and ')}; it may be turning into a god class.`,
          evidence: [entity.name],
          suggestion: `Let ${entity.name} coordinate and delegate: push the actual work down into the classes it talks to, so a change in one area doesn't touch ${entity.name}.`,
        })];
      });
  }

  #connectedEntities(submission, entity) {
    const self = entity.name.toLowerCase();
    const others = submission.relationshipsOf(entity.name)
      .map((r) => (r.from.toLowerCase() === self ? r.to : r.from))
      .filter((name) => {
        const other = submission.findEntity(name);
        return other !== undefined && other.kind !== EntityKind.ENUM;
      })
      .map((name) => name.toLowerCase());
    return new Set(others).size;
  }
}
