import { Difficulty, assertOneOf } from './enums.js';
import { Rubric } from './rubric.js';

/** An LLD practice problem. Input is assumed validated by ProblemCatalog. */
export class Problem {
  constructor({ id, title, difficulty, description, requirements, constraints = [], clarifyingQuestions = [], rubric }) {
    assertOneOf(difficulty, Difficulty, 'difficulty');
    this.id = id;
    this.title = title;
    this.difficulty = difficulty;
    this.description = description;
    this.requirements = Object.freeze(requirements.map((r) => Object.freeze({ ...r, keywords: Object.freeze([...r.keywords]) })));
    this.constraints = Object.freeze([...constraints]);
    this.clarifyingQuestions = Object.freeze([...clarifyingQuestions]);
    this.rubric = rubric instanceof Rubric ? rubric : new Rubric(rubric);
    Object.freeze(this);
  }

  toSummary() {
    const { id, title, difficulty } = this;
    return { id, title, difficulty, requirementCount: this.requirements.length };
  }

  /**
   * What the learner sees before submitting. The rubric and requirement keywords are the
   * answer key, so they stay server-side; feedback reveals the relevant parts afterwards.
   */
  toLearnerView() {
    const { id, title, difficulty, description } = this;
    return {
      id,
      title,
      difficulty,
      description,
      requirements: this.requirements.map(({ id: reqId, text }) => ({ id: reqId, text })),
      constraints: [...this.constraints],
      clarifyingQuestions: [...this.clarifyingQuestions],
    };
  }
}
