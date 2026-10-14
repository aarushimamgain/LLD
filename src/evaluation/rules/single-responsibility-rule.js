import { Dimension, EntityKind, Severity } from '../../domain/enums.js';
import { Rule } from './rule.js';

const MAX_RESPONSIBILITIES = 5;

// Verbs that typically start a responsibility. "X and <verb> Y" joins two jobs;
// "Hold the name and price" (and + noun) does not, which keeps false positives down.
const RESPONSIBILITY_VERBS = new Set([
  'accept', 'add', 'allocate', 'apply', 'assign', 'calculate', 'cancel', 'charge', 'check', 'choose', 'close',
  'collect', 'compute', 'create', 'decide', 'decrement', 'delete', 'dispatch', 'dispense', 'display', 'emit',
  'find', 'generate', 'handle', 'hold', 'issue', 'keep', 'load', 'log', 'manage', 'move', 'notify', 'open',
  'parse', 'pay', 'pick', 'print', 'process', 'record', 'refund', 'reject', 'release', 'remove', 'render',
  'reserve', 'return', 'route', 'save', 'schedule', 'select', 'send', 'show', 'start', 'stop', 'store',
  'switch', 'track', 'update', 'validate', 'verify',
]);

/**
 * SRP heuristic: more than five responsibilities, or responsibilities joining two jobs with
 * "and". Thresholds misfire sometimes, so findings are suggestions, not issues.
 */
export class SingleResponsibilityRule extends Rule {
  constructor() {
    super({ dimension: Dimension.RESPONSIBILITIES });
  }

  check(problem, submission) {
    return submission.entities
      .filter((e) => e.kind !== EntityKind.ENUM)
      .flatMap((entity) => [this.#tooMany(entity), this.#compound(entity)].filter(Boolean));
  }

  #tooMany(entity) {
    const count = entity.responsibilities.length;
    if (count <= MAX_RESPONSIBILITIES) return null;
    const movable = entity.responsibilities.slice(-2).map((r) => `"${r}"`).join(' and ');
    return this.finding({
      key: `SRP_TOO_MANY:${entity.name}`,
      severity: Severity.SUGGESTION,
      message: `${entity.name} has ${count} responsibilities; a class with more than ${MAX_RESPONSIBILITIES} usually mixes several jobs.`,
      evidence: [entity.name],
      suggestion: `Keep ${entity.name} as a coordinator and move groups of related work, such as ${movable}, into their own classes.`,
    });
  }

  #compound(entity) {
    const compound = entity.responsibilities.filter(joinsTwoJobs);
    if (compound.length === 0) return null;
    const more = compound.length > 1 ? ` (and ${compound.length - 1} more)` : '';
    return this.finding({
      key: `SRP_COMPOUND:${entity.name}`,
      severity: Severity.SUGGESTION,
      message: `${entity.name} has responsibilities that join two separate jobs with "and": "${compound[0]}"${more}.`,
      evidence: [entity.name],
      suggestion: 'Split each into two responsibilities. If the two halves belong to different concepts, they probably belong to different classes.',
    });
  }
}

function joinsTwoJobs(text) {
  return [...text.toLowerCase().matchAll(/\band\s+([a-z]+)/g)].some(([, word]) => RESPONSIBILITY_VERBS.has(word));
}
