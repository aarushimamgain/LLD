import { AbstractionUsageRule } from './abstraction-usage-rule.js';
import { CardinalityRule } from './cardinality-rule.js';
import { ConceptCoverageRule } from './concept-coverage-rule.js';
import { DanglingReferenceRule } from './dangling-reference-rule.js';
import { DesignNarrativeRule } from './design-narrative-rule.js';
import { EmptyEntityRule } from './empty-entity-rule.js';
import { ExpectedAbstractionRule } from './expected-abstraction-rule.js';
import { GodClassRule } from './god-class-rule.js';
import { KeyFlowsRule } from './key-flows-rule.js';
import { OrphanEntityRule } from './orphan-entity-rule.js';
import { PatternJustificationRule } from './pattern-justification-rule.js';
import { RequirementCoverageRule } from './requirement-coverage-rule.js';
import { SingleResponsibilityRule } from './single-responsibility-rule.js';

export { Rule } from './rule.js';

/** The rule set used by the app. Adding a check = one new Rule file + one line here. */
export function createDefaultRules() {
  return [
    // requirementsCoverage
    new ConceptCoverageRule(),
    new RequirementCoverageRule(),
    new KeyFlowsRule(),
    // responsibilities
    new SingleResponsibilityRule(),
    new GodClassRule(),
    new EmptyEntityRule(),
    // abstraction
    new ExpectedAbstractionRule(),
    new AbstractionUsageRule(),
    // relationships
    new DanglingReferenceRule(),
    new OrphanEntityRule(),
    new CardinalityRule(),
    // patternsAndTradeoffs
    new PatternJustificationRule(),
    new DesignNarrativeRule(),
  ];
}
