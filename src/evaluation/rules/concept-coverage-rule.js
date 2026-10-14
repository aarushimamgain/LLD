import { Dimension, Severity } from '../../domain/enums.js';
import { analyzeConcepts, quoteList } from '../analysis.js';
import { Rule } from './rule.js';

/** Every rubric concept should appear as an entity with real responsibilities. */
export class ConceptCoverageRule extends Rule {
  constructor() {
    super({ dimension: Dimension.REQUIREMENTS_COVERAGE });
  }

  check(problem, submission) {
    return analyzeConcepts(problem, submission)
      .filter(({ substantive }) => substantive.length === 0)
      .map(({ concept, entities }) => (entities.length > 0 ? this.#emptyShell(concept, entities) : this.#missing(concept)));
  }

  #missing(concept) {
    const kind = concept.expectAbstraction ? 'an interface' : 'a class';
    const target = concept.requirementIds.length ? ` to address ${concept.requirementIds.join(', ')}` : '';
    return this.finding({
      key: `CONCEPT_MISSING:${concept.id}`,
      severity: Severity.ISSUE,
      message: `Missing concept: ${concept.name}. ${concept.why}`,
      evidence: concept.requirementIds.length ? concept.requirementIds : ['entities'],
      suggestion: `Add ${kind} for it${target}, named for example ${quoteList(concept.aliases)}.`,
    });
  }

  #emptyShell(concept, entities) {
    const names = entities.map((e) => e.name);
    return this.finding({
      key: `CONCEPT_EMPTY:${concept.id}`,
      severity: Severity.ISSUE,
      message: `${quoteList(names)} looks like the ${concept.name}, but has no responsibilities or methods, so it doesn't count yet.`,
      evidence: names,
      suggestion: `Give ${names[0]} its responsibilities and key methods. ${concept.why}`,
    });
  }
}
