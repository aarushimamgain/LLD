import { Dimension, EntityKind, RelationshipType, Severity } from '../../domain/enums.js';
import { analyzeConcepts, isAbstractKind, quoteList } from '../analysis.js';
import { Rule } from './rule.js';

const INTERFACE_SUFFIXES = /(Strategy|Policy|Method|State|Processor|Algorithm)$/;

/**
 * Concepts the rubric marks as "varies" should be behind an interface or abstract class.
 * Satisfied when a matching entity is abstract, or implements/extends an abstract entity
 * (e.g. "NearestSpotAllocator implements Allocator").
 */
export class ExpectedAbstractionRule extends Rule {
  constructor() {
    super({ dimension: Dimension.ABSTRACTION });
  }

  check(problem, submission) {
    return analyzeConcepts(problem, submission)
      .filter(({ concept, substantive }) => concept.expectAbstraction && substantive.length > 0)
      .filter(({ entities }) => !entities.some((e) => isAbstractKind(e) || this.#extendsAbstraction(submission, e)))
      .map(({ concept, entities }) => {
        const names = entities.map((e) => e.name);
        const interfaceName = concept.aliases.find((a) => INTERFACE_SUFFIXES.test(a)) ?? concept.aliases[0];
        const onlyEnums = entities.every((e) => e.kind === EntityKind.ENUM);
        return this.finding({
          key: `ABSTRACTION_EXPECTED:${concept.id}`,
          severity: Severity.ISSUE,
          message: `${concept.name} is modelled only as ${onlyEnums ? 'the enum' : 'concrete'} ${quoteList(names)}, but this behaviour is expected to vary. ${concept.why}`,
          evidence: names,
          suggestion: onlyEnums
            ? `Replace the enum with an interface such as "${interfaceName}" and one class per value, each implementing the behaviour that differs, so adding a case doesn't mean editing every switch.`
            : `Introduce an interface such as "${interfaceName}", make ${names[0]} one implementation of it, and have callers depend on the interface.`,
        });
      });
  }

  #extendsAbstraction(submission, entity) {
    return submission.relationshipsOf(entity.name).some((r) => {
      if (r.type !== RelationshipType.IMPLEMENTS && r.type !== RelationshipType.IS_A) return false;
      if (r.from.toLowerCase() !== entity.name.toLowerCase()) return false;
      const target = submission.findEntity(r.to);
      return target !== undefined && isAbstractKind(target);
    });
  }
}
