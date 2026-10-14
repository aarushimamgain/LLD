import { Submission, ValidationError } from '../../src/domain/index.js';
import { DanglingReferenceRule } from '../../src/evaluation/rules/dangling-reference-rule.js';
import { StructuredJsonParser } from '../../src/parsers/structured-json-parser.js';

const parser = new StructuredJsonParser();

const entity = (name, extra = {}) => ({ name, kind: 'class', responsibilities: ['Do one thing'], ...extra });

function detailsFor(raw) {
  try {
    parser.parse(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return error.details;
  }
  throw new Error('Expected parse to fail');
}

describe('StructuredJsonParser', () => {
  it('parses a minimal design and fills defaults', () => {
    const submission = parser.parse({ entities: [entity('ParkingLot')] });
    expect(submission).toBeInstanceOf(Submission);
    expect(submission.relationships).toEqual([]);
    expect(submission.tradeOffs).toBe('');
    expect(submission.entities[0].methods).toEqual([]);
  });

  it('accepts a JSON string', () => {
    expect(parser.parse(JSON.stringify({ entities: [entity('A')] })).entities).toHaveLength(1);
  });

  it('normalizes common spellings of kinds and relationship types', () => {
    const submission = parser.parse({
      entities: [entity('Vehicle', { kind: 'Abstract Class' }), entity('Car')],
      relationships: [{ from: 'Car', to: 'Vehicle', type: 'extends', cardinality: 1 }],
      keyFlows: ['Step one', 'Step two'],
    });
    expect(submission.entities[0].kind).toBe('abstract');
    expect(submission.relationships[0]).toEqual({ from: 'Car', to: 'Vehicle', type: 'is-a', cardinality: '1' });
    expect(submission.keyFlows).toBe('Step one\nStep two');
  });

  it('explains invalid JSON', () => {
    expect(() => parser.parse('{ "entities": [ }')).toThrow('Your design is not valid JSON.');
  });

  it('rejects non-objects', () => {
    expect(detailsFor([])[0]).toMatch(/Start from the template/);
  });

  it.each([
    ['missing entities', {}, 'Your design is missing "entities".'],
    ['empty entities', { entities: [] }, 'Your design needs at least 1 entity.'],
    ['entity without a name', { entities: [entity('A'), entity('B'), { kind: 'class' }] }, 'Entity #3 has no name.'],
    ['blank name', { entities: [entity('   ')] }, 'Entity #1 has no name.'],
    ['bad kind', { entities: [entity('Car', { kind: 'klass' })] }, 'Entity #1 (Car) has kind "klass"; use one of: class, interface, abstract, enum.'],
    ['missing kind', { entities: [{ name: 'Car' }] }, 'Entity #1 (Car) is missing "kind" (use one of: class, interface, abstract, enum).'],
    ['empty responsibility', { entities: [entity('Lot', { responsibilities: ['ok', ''] })] }, 'Entity #1 (Lot), responsibility #2 is empty.'],
    ['responsibilities not a list', { entities: [entity('Lot', { responsibilities: 'Hold floors' })] }, 'Entity #1 (Lot) "responsibilities" should be a list, not text.'],
    [
      'bad relationship type',
      { entities: [entity('A'), entity('B')], relationships: [{ from: 'A', to: 'B', type: 'likes' }] },
      'Relationship #1 (A → B) has type "likes"; use one of: has-a, is-a, uses, implements.',
    ],
    ['typo in a top-level field', { entities: [entity('A')], tradeoffs: 'x' }, /Your design has unknown field "tradeoffs". Allowed: entities, .*tradeOffs/],
    ['too long text', { entities: [entity('A')], keyFlows: 'x'.repeat(4001) }, 'Your design "keyFlows" is too long (max 4000 characters).'],
  ])('reports %s', (_, input, expected) => {
    const details = detailsFor(input);
    if (expected instanceof RegExp) expect(details.some((d) => expected.test(d))).toBe(true);
    else expect(details).toContain(expected);
  });

  it('reports every problem at once, with a count in the message', () => {
    const input = { entities: [{ kind: 'class' }, { name: 'B', kind: 'nope' }] };
    expect(() => parser.parse(input)).toThrow('Your design has 2 problems to fix before it can be evaluated.');
    expect(detailsFor(input)).toHaveLength(2);
  });

  it.each([
    ['an empty string', ''],
    ['whitespace only', '   \n '],
    ['null', null],
  ])('rejects an empty submission (%s) with a clear message', (_, raw) => {
    expect(() => parser.parse(raw)).toThrow('Your design is empty.');
  });

  it.each([
    ['an empty object', '{}', 'Your design is missing "entities".'],
    ['an empty entity list', '{"entities": []}', 'Your design needs at least 1 entity.'],
  ])('rejects %s', (_, raw, expected) => {
    expect(detailsFor(raw)).toEqual([expected]);
  });

  it('accepts a relationship to an undeclared entity, leaving it to feedback rather than rejection', () => {
    // A typo in one relationship shouldn't block the whole submission: the learner gets a
    // DANGLING finding (with a suggestion) instead of a 400.
    const submission = parser.parse({
      entities: [entity('ParkingLot')],
      relationships: [{ from: 'ParkingLot', to: 'PaymentService', type: 'uses' }],
    });
    expect(submission.relationships).toHaveLength(1);
    const findings = new DanglingReferenceRule().check(null, submission);
    expect(findings.map((f) => f.key)).toEqual(['DANGLING:PaymentService']);
  });

  it('rejects duplicate entity names case-insensitively', () => {
    const details = detailsFor({ entities: [entity('Car'), entity('Spot'), entity('car')] });
    expect(details[0]).toBe('Entities #1, #3 are all named "Car". Each entity needs a unique name so relationships can refer to it.');
  });
});
