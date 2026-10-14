import { Dimension, Severity } from '../../domain/enums.js';
import { entitiesMentionedIn, wordCount } from '../analysis.js';
import { Rule } from './rule.js';

const MIN_FLOW_WORDS = 25;

/** Key flows show the classes actually collaborate to meet the requirements. */
export class KeyFlowsRule extends Rule {
  constructor() {
    super({ dimension: Dimension.REQUIREMENTS_COVERAGE });
  }

  check(problem, submission) {
    const words = wordCount(submission.keyFlows);
    if (words === 0) {
      return [this.finding({
        key: 'KEYFLOWS_MISSING',
        severity: Severity.ISSUE,
        message: 'No key flows: there is no walkthrough showing how your classes handle the main use cases.',
        evidence: ['keyFlows'],
        suggestion: 'Describe the 2–3 main use cases step by step, naming the class and method at each step, e.g. "Park: Gate → ParkingLot.park(vehicle) → SpotAllocator.allocate(vehicle) → new Ticket(...)".',
      })];
    }

    if (entitiesMentionedIn(submission, submission.keyFlows).length === 0) {
      return [this.finding({
        key: 'KEYFLOWS_DISCONNECTED',
        severity: Severity.SUGGESTION,
        message: 'Your key flows never mention any of your entities, so they don\'t show how the design works.',
        evidence: ['keyFlows'],
        suggestion: 'Rewrite each flow as a chain of calls between your classes, e.g. "ClassA.method() → ClassB.method()".',
      })];
    }

    if (words < MIN_FLOW_WORDS) {
      return [this.finding({
        key: 'KEYFLOWS_THIN',
        severity: Severity.SUGGESTION,
        message: `Key flows are very short (${words} words), so failure paths and edge cases are not shown.`,
        evidence: ['keyFlows'],
        suggestion: 'Add the unhappy paths too: what happens when a resource is unavailable, input is invalid, or the user cancels.',
      })];
    }
    return [];
  }
}
