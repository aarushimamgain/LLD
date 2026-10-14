import { Dimension, Severity } from '../../domain/enums.js';
import { behaviourTokens, mentionsKeyword, quoteList } from '../analysis.js';
import { Rule } from './rule.js';

/**
 * Requirements that no rubric concept covers must be handled visibly: their keywords should
 * appear in names, responsibilities, methods, flows or assumptions.
 * Requirements linked to a concept are left to ConceptCoverageRule (covered when the concept is
 * present, reported there when it's missing), so one root cause only costs points once.
 */
export class RequirementCoverageRule extends Rule {
  constructor() {
    super({ dimension: Dimension.REQUIREMENTS_COVERAGE });
  }

  check(problem, submission) {
    const tokens = behaviourTokens(submission);
    return problem.requirements
      .filter((requirement) => problem.rubric.conceptsForRequirement(requirement.id).length === 0)
      .filter((requirement) => !requirement.keywords.some((keyword) => mentionsKeyword(tokens, keyword)))
      .map((requirement) => this.finding({
        key: `REQUIREMENT_UNCOVERED:${requirement.id}`,
        severity: Severity.ISSUE,
        message: `${requirement.id} is not addressed by any class, method or flow: "${requirement.text}"`,
        evidence: [requirement.id],
        suggestion: `Decide which class owns ${requirement.id}, give it a responsibility or method for it, and add a step to keyFlows. A design handling it would usually mention ${quoteList(requirement.keywords)}.`,
      }));
  }
}
