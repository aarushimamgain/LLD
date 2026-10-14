import { Dimension, RelationshipType, Severity } from '../../domain/enums.js';
import { Rule } from './rule.js';

/** has-a relationships should state how many: it decides fields vs collections. */
export class CardinalityRule extends Rule {
  constructor() {
    super({ dimension: Dimension.RELATIONSHIPS });
  }

  check(problem, submission) {
    const missing = submission.relationships.filter((r) => r.type === RelationshipType.HAS_A && !r.cardinality);
    if (missing.length === 0) return [];

    // One finding for all of them: the fix is the same, and it shouldn't cost points per line.
    const pairs = missing.map((r) => `${r.from} → ${r.to}`);
    return [this.finding({
      key: 'CARDINALITY_MISSING',
      severity: Severity.SUGGESTION,
      message: `${missing.length === 1 ? 'A has-a relationship has' : `${missing.length} has-a relationships have`} no cardinality: ${pairs.join(', ')}.`,
      evidence: [...new Set(missing.map((r) => r.from))],
      suggestion: 'Add a cardinality such as "1", "0..1" or "1..*". It states how many objects each instance holds, which decides whether you need a single field or a collection.',
    })];
  }
}
