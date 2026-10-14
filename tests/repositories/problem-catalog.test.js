import { NotFoundError } from '../../src/domain/index.js';
import { StructuredJsonParser } from '../../src/parsers/structured-json-parser.js';
import { ProblemCatalog, parseProblemDefinition } from '../../src/repositories/problem-catalog.js';
import { loadSample } from '../helpers.js';

const PROBLEM_IDS = ['elevator', 'parking-lot', 'vending-machine'];

describe('ProblemCatalog', () => {
  let catalog;
  beforeAll(async () => {
    catalog = await ProblemCatalog.fromDirectory();
  });

  it('loads all problem files and ignores samples/', () => {
    expect(catalog.list().map((p) => p.id)).toEqual(PROBLEM_IDS);
  });

  it('throws NotFoundError for unknown ids', () => {
    expect(() => catalog.get('chess')).toThrow(NotFoundError);
  });

  it.each(PROBLEM_IDS)('%s has a complete, consistent definition', (id) => {
    const problem = catalog.get(id);
    expect(problem.requirements.length).toBeGreaterThanOrEqual(5);
    expect(problem.clarifyingQuestions.length).toBeGreaterThanOrEqual(4);
    expect(problem.rubric.concepts.length).toBeGreaterThanOrEqual(5);
    expect(problem.rubric.concepts.some((c) => c.expectAbstraction)).toBe(true);

    // Every requirement should be backed by at least one concept or be checkable by keywords.
    for (const requirement of problem.requirements) expect(requirement.keywords.length).toBeGreaterThan(0);
  });

  it('hides the rubric and keywords from the learner view', () => {
    const view = catalog.get('parking-lot').toLearnerView();
    expect(view.rubric).toBeUndefined();
    expect(view.requirements[0]).toEqual({ id: 'R1', text: expect.any(String) });
  });

  // "Decent but flawed": each sample covers every concept except one deliberate gap.
  it.each([
    ['parking-lot', ['payment']],
    ['elevator', ['door']],
    ['vending-machine', ['payment-method']],
  ])('sample design for %s parses and misses only %j', async (id, expectedMissing) => {
    const submission = new StructuredJsonParser().parse(await loadSample(id));
    const matches = catalog.get(id).rubric.matchEntities(submission.entities);
    const missing = [...matches].filter(([, entities]) => entities.length === 0).map(([conceptId]) => conceptId);
    expect(missing).toEqual(expectedMissing);
  });
});

describe('parseProblemDefinition', () => {
  const valid = {
    id: 'demo',
    title: 'Demo',
    difficulty: 'easy',
    description: 'd',
    requirements: [{ id: 'R1', text: 't', keywords: ['k'] }],
    rubric: { concepts: [{ id: 'c', name: 'C', aliases: ['C'], requirementIds: ['R1'], why: 'w' }] },
  };

  it('builds a Problem from a valid definition', () => {
    expect(parseProblemDefinition(valid).id).toBe('demo');
  });

  it('names the file and the bad field', () => {
    expect(() => parseProblemDefinition({ ...valid, difficulty: 'extreme' }, 'demo.json')).toThrow(/Invalid demo.json[\s\S]*difficulty/);
  });

  it('rejects concepts that reference unknown requirements', () => {
    const broken = { ...valid, rubric: { concepts: [{ ...valid.rubric.concepts[0], requirementIds: ['R9'] }] } };
    expect(() => parseProblemDefinition(broken)).toThrow('Concept "c" references unknown requirement "R9"');
  });
});
