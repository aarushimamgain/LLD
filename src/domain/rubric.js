import { Dimension } from './enums.js';
import { containsSequence, tokenize } from './text.js';

export const DEFAULT_DIMENSION_WEIGHTS = Object.freeze({
  [Dimension.REQUIREMENTS_COVERAGE]: 30,
  [Dimension.RESPONSIBILITIES]: 20,
  [Dimension.ABSTRACTION]: 20,
  [Dimension.RELATIONSHIPS]: 15,
  [Dimension.PATTERNS_AND_TRADEOFFS]: 15,
});

/**
 * A concept a good design should contain, e.g. "spot allocation strategy".
 * Matched by aliases, so different valid namings all count.
 */
export class RubricConcept {
  #aliasTokens;

  constructor({ id, name, aliases, expectAbstraction = false, requirementIds = [], suggestedPatterns = [], why }) {
    if (!aliases?.length) throw new Error(`Concept ${id} needs at least one alias`);
    this.id = id;
    this.name = name;
    this.aliases = Object.freeze([...aliases]);
    this.expectAbstraction = expectAbstraction;
    this.requirementIds = Object.freeze([...requirementIds]);
    this.suggestedPatterns = Object.freeze([...suggestedPatterns]);
    this.why = why;
    this.#aliasTokens = aliases.map(tokenize);
    Object.freeze(this);
  }

  /**
   * How specifically an entity name matches this concept: the token length of the longest alias
   * found inside the name, or 0 for no match. "SpotAllocator" matches alias "SpotAllocator" (2)
   * more strongly than alias "Spot" (1), which lets the rubric pick the best concept.
   * @param {string} entityName
   */
  matchStrength(entityName) {
    const nameTokens = tokenize(entityName);
    return this.#aliasTokens.reduce(
      (best, alias) => (containsSequence(nameTokens, alias) ? Math.max(best, alias.length) : best),
      0,
    );
  }
}

/** The answer key for a problem: expected concepts (not one answer) plus dimension weights. */
export class Rubric {
  constructor({ concepts, weights = {} }) {
    this.concepts = Object.freeze(concepts.map((c) => (c instanceof RubricConcept ? c : new RubricConcept(c))));
    this.weights = Object.freeze({ ...DEFAULT_DIMENSION_WEIGHTS, ...weights });
    Object.freeze(this);
  }

  conceptsForRequirement(requirementId) {
    return this.concepts.filter((c) => c.requirementIds.includes(requirementId));
  }

  /**
   * Assigns each entity to the concept(s) it matches most specifically.
   * @param {{name: string}[]} entities
   * @returns {Map<string, object[]>} concept id → matching entities (every concept id present)
   */
  matchEntities(entities) {
    const matches = new Map(this.concepts.map((c) => [c.id, []]));
    for (const entity of entities) {
      const strengths = this.concepts.map((c) => c.matchStrength(entity.name));
      const best = Math.max(0, ...strengths);
      if (best === 0) continue;
      this.concepts.forEach((c, i) => {
        if (strengths[i] === best) matches.get(c.id).push(entity);
      });
    }
    return matches;
  }
}
