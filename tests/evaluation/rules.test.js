import { Dimension, FeedbackSource, Severity } from '../../src/domain/index.js';
import { RuleBasedEvaluator } from '../../src/evaluation/rule-based-evaluator.js';
import { createDefaultRules } from '../../src/evaluation/rules/index.js';
import { AbstractionUsageRule } from '../../src/evaluation/rules/abstraction-usage-rule.js';
import { CardinalityRule } from '../../src/evaluation/rules/cardinality-rule.js';
import { ConceptCoverageRule } from '../../src/evaluation/rules/concept-coverage-rule.js';
import { DanglingReferenceRule } from '../../src/evaluation/rules/dangling-reference-rule.js';
import { DesignNarrativeRule } from '../../src/evaluation/rules/design-narrative-rule.js';
import { EmptyEntityRule } from '../../src/evaluation/rules/empty-entity-rule.js';
import { ExpectedAbstractionRule } from '../../src/evaluation/rules/expected-abstraction-rule.js';
import { GodClassRule } from '../../src/evaluation/rules/god-class-rule.js';
import { KeyFlowsRule } from '../../src/evaluation/rules/key-flows-rule.js';
import { OrphanEntityRule } from '../../src/evaluation/rules/orphan-entity-rule.js';
import { PatternJustificationRule } from '../../src/evaluation/rules/pattern-justification-rule.js';
import { RequirementCoverageRule } from '../../src/evaluation/rules/requirement-coverage-rule.js';
import { SingleResponsibilityRule } from '../../src/evaluation/rules/single-responsibility-rule.js';
import { StructuredJsonParser } from '../../src/parsers/structured-json-parser.js';
import { ProblemCatalog } from '../../src/repositories/problem-catalog.js';
import { alternateParkingLotDesign } from '../fixtures/parking-lot-alternate.js';
import { loadSample } from '../helpers.js';

const parser = new StructuredJsonParser();
const cls = (name, extra = {}) => ({ name, kind: 'class', responsibilities: ['Do one thing'], methods: [], ...extra });
const iface = (name, extra = {}) => cls(name, { kind: 'interface', ...extra });
const design = (raw) => parser.parse({ keyFlows: 'x', tradeOffs: 'x', assumptions: 'x', ...raw });
const keys = (items) => items.map((i) => i.key);
const LONG_FLOW = 'Park: Gate calls Lot.park(vehicle), which asks the allocator for a free spot, marks it taken and returns a ticket. If no spot fits, Lot.park throws LotFull and the gate shows a message.';

let catalog;
let parkingLot;
beforeAll(async () => {
  catalog = await ProblemCatalog.fromDirectory();
  parkingLot = catalog.get('parking-lot');
});

/**
 * One passing and one failing design per rule, all against the Parking Lot problem.
 * `fails` lists the exact finding keys expected, so a rule that over- or under-reports fails.
 */
const RULE_CASES = [
  {
    rule: new ConceptCoverageRule(),
    passes: () => alternateParkingLotDesign,
    fails: () => ({ entities: [cls('ParkingLot'), cls('ParkingSpot'), cls('Vehicle'), cls('Ticket'), cls('PricingStrategy')] }),
    expected: ['CONCEPT_MISSING:spot-allocation', 'CONCEPT_MISSING:payment'],
  },
  {
    rule: new RequirementCoverageRule(),
    passes: () => ({ entities: [cls('Lot', { methods: ['lockSpot(spot)', 'updateDisplay()'] })] }),
    fails: () => ({ entities: [cls('Lot')] }),
    expected: ['REQUIREMENT_UNCOVERED:R6', 'REQUIREMENT_UNCOVERED:R7'],
  },
  {
    rule: new KeyFlowsRule(),
    passes: () => ({ entities: [cls('Lot')], keyFlows: LONG_FLOW }),
    fails: () => ({ entities: [cls('Lot')], keyFlows: '' }),
    expected: ['KEYFLOWS_MISSING'],
  },
  {
    rule: new SingleResponsibilityRule(),
    passes: () => ({ entities: [cls('Product', { responsibilities: ['Hold the name and price', 'Know its category'] })] }),
    fails: () => ({ entities: [cls('Lot', { responsibilities: ['a', 'b', 'c', 'd', 'e', 'Issue tickets and track payments'] })] }),
    expected: ['SRP_TOO_MANY:Lot', 'SRP_COMPOUND:Lot'],
  },
  {
    rule: new GodClassRule(),
    passes: () => ({
      entities: ['Hub', 'A', 'B', 'C', 'D'].map((n) => cls(n)),
      relationships: [{ from: 'Hub', to: 'A', type: 'uses' }, { from: 'Hub', to: 'B', type: 'uses' }],
    }),
    fails: () => ({
      entities: [...['Hub', 'A', 'B', 'C', 'D'].map((n) => cls(n)), { name: 'Color', kind: 'enum' }],
      relationships: ['A', 'B', 'C', 'Color'].map((to) => ({ from: 'Hub', to, type: 'uses' })),
    }),
    expected: ['GOD_CLASS:Hub'],
  },
  {
    rule: new EmptyEntityRule(),
    passes: () => ({ entities: [cls('Lot', { responsibilities: [], methods: ['park()'] }), { name: 'Size', kind: 'enum' }] }),
    fails: () => ({ entities: [cls('Lot', { responsibilities: [] })] }),
    expected: ['EMPTY:Lot'],
  },
  {
    rule: new ExpectedAbstractionRule(),
    // Alias matching: "SpotAssigner" is a valid name for the spot allocation strategy.
    passes: () => ({ entities: [iface('SpotAssigner'), iface('Tariff'), iface('PaymentGateway')] }),
    fails: () => ({ entities: [cls('SpotAssigner')] }),
    expected: ['ABSTRACTION_EXPECTED:spot-allocation'],
  },
  {
    rule: new AbstractionUsageRule(),
    passes: () => ({ entities: [iface('Pricing'), cls('Hourly')], relationships: [{ from: 'Hourly', to: 'Pricing', type: 'implements' }] }),
    fails: () => ({ entities: [iface('Pricing'), cls('Base'), cls('Child')], relationships: [{ from: 'Child', to: 'Base', type: 'implements' }] }),
    expected: ['UNIMPLEMENTED:Pricing', 'IMPLEMENTS_NON_INTERFACE:Child->Base'],
  },
  {
    rule: new DanglingReferenceRule(),
    passes: () => ({ entities: [cls('A'), cls('B')], relationships: [{ from: 'A', to: 'b', type: 'uses' }] }),
    fails: () => ({ entities: [cls('A')], relationships: [{ from: 'A', to: 'Ghost', type: 'uses' }, { from: 'ghost', to: 'A', type: 'uses' }] }),
    expected: ['DANGLING:Ghost'],
  },
  {
    rule: new OrphanEntityRule(),
    passes: () => ({ entities: [cls('A'), cls('B')], relationships: [{ from: 'A', to: 'B', type: 'uses' }] }),
    fails: () => ({ entities: [cls('A'), cls('B'), cls('C')], relationships: [{ from: 'A', to: 'B', type: 'uses' }] }),
    expected: ['ORPHAN:C'],
  },
  {
    rule: new CardinalityRule(),
    passes: () => ({ entities: [cls('A'), cls('B')], relationships: [{ from: 'A', to: 'B', type: 'has-a', cardinality: '0..*' }, { from: 'B', to: 'A', type: 'uses' }] }),
    fails: () => ({ entities: [cls('A'), cls('B')], relationships: [{ from: 'A', to: 'B', type: 'has-a' }] }),
    expected: ['CARDINALITY_MISSING'],
  },
  {
    rule: new PatternJustificationRule(),
    passes: () => ({
      entities: [iface('SpotAssigner')],
      patterns: [{ name: 'Strategy', where: 'SpotAssigner', why: 'Slot selection policy varies by lot.' }],
    }),
    fails: () => ({ entities: [cls('Lot')], patterns: [{ name: 'Observer', where: 'Display', why: '' }] }),
    expected: ['PATTERN_WHERE:Observer@Display', 'PATTERN_NO_WHY:Observer@Display'],
  },
  {
    rule: new DesignNarrativeRule(),
    passes: () => ({
      entities: [cls('Lot')],
      tradeOffs: 'Strategy for pricing adds an interface, but new tariffs never touch the lot or the ticket classes.',
      assumptions: 'Single building.',
    }),
    fails: () => ({ entities: [cls('Lot')], tradeOffs: '', assumptions: '' }),
    expected: ['TRADEOFFS_MISSING', 'ASSUMPTIONS_MISSING'],
  },
];

describe.each(RULE_CASES.map((c) => [c.rule.constructor.name, c]))('%s', (_, { rule, passes, fails, expected }) => {
  it('finds nothing in a design that handles it', () => {
    expect(rule.check(parkingLot, design(passes()))).toEqual([]);
  });

  it('reports exactly the expected findings in a design that does not', () => {
    const findings = rule.check(parkingLot, design(fails()));
    expect(keys(findings)).toEqual(expected);
    for (const f of findings) {
      expect(f.dimension).toBe(rule.dimension);
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.suggestion.length).toBeGreaterThan(10);
    }
  });
});

it('covers every rule in the default set', () => {
  expect(RULE_CASES.map((c) => c.rule.constructor.name).sort()).toEqual(createDefaultRules().map((r) => r.constructor.name).sort());
});

describe('alternate valid designs', () => {
  it('"SpotAssigner" satisfies the spot allocation strategy concept', () => {
    const findings = new ConceptCoverageRule().check(parkingLot, design({ entities: [cls('SpotAssigner')] }));
    expect(keys(findings)).not.toContain('CONCEPT_MISSING:spot-allocation');
    expect(keys(findings)).toContain('CONCEPT_MISSING:payment'); // the check still works for real gaps
  });

  it('a complete design using different names from the rubric examples scores 100', async () => {
    const result = await new RuleBasedEvaluator().evaluate(parkingLot, parser.parse(alternateParkingLotDesign));
    expect(result.items.filter((i) => i.severity !== Severity.INFO)).toEqual([]);
    expect(result.totalScore).toBe(100);
  });

  it('does not count a class that only borrows a concept\'s name', () => {
    const findings = new ConceptCoverageRule().check(parkingLot, design({ entities: [cls('SpotAssigner', { responsibilities: [] })] }));
    expect(keys(findings)).toContain('CONCEPT_EMPTY:spot-allocation');
  });

  it('matches whole words, not substrings ("CardPayment" is not a "Car")', () => {
    const matches = parkingLot.rubric.matchEntities([{ name: 'CardPayment' }]);
    expect(matches.get('vehicle')).toEqual([]);
    expect(matches.get('payment').map((e) => e.name)).toEqual(['CardPayment']);
  });
});

describe('finding keys', () => {
  it('give two unjustified uses of the same pattern separate keys', () => {
    const findings = new PatternJustificationRule().check(parkingLot, design({
      entities: [iface('Tariff'), iface('SpotAssigner')],
      patterns: [{ name: 'Strategy', where: 'Tariff', why: '' }, { name: 'Strategy', where: 'SpotAssigner', why: '' }],
    }));
    expect(keys(findings)).toEqual(['PATTERN_NO_WHY:Strategy@Tariff', 'PATTERN_NO_WHY:Strategy@SpotAssigner']);
  });

  it('are unique in an evaluation, so a repeated row is one finding and costs points once', async () => {
    const dup = { from: 'A', to: 'B', type: 'has-a' };
    const result = await new RuleBasedEvaluator().evaluate(parkingLot, design({ entities: [cls('A'), cls('B')], relationships: [dup, dup] }));
    const allKeys = keys(result.items);
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });
});

describe('rule messages on edge cases', () => {
  it('suggests replacing an enum with a State interface', () => {
    const vending = catalog.get('vending-machine');
    const items = new ExpectedAbstractionRule().check(vending, design({ entities: [{ name: 'MachineState', kind: 'enum', responsibilities: ['IDLE, HAS_MONEY'] }] }));
    expect(items[0].message).toContain('the enum "MachineState"');
    expect(items[0].suggestion).toMatch(/Replace the enum with an interface such as "VendingMachineState"/);
  });

  it.each([
    ['Something happens and then another thing happens.', 'KEYFLOWS_DISCONNECTED'],
    ['ParkingLot parks the car.', 'KEYFLOWS_THIN'],
  ])('key flows "%s" → %s', (keyFlows, expected) => {
    expect(keys(new KeyFlowsRule().check(parkingLot, design({ entities: [cls('ParkingLot')], keyFlows })))).toEqual([expected]);
  });

  it('reports a design with no relationships once instead of every entity', () => {
    expect(keys(new OrphanEntityRule().check(parkingLot, design({ entities: [cls('A'), cls('B'), cls('C')] })))).toEqual(['NO_RELATIONSHIPS']);
  });

  it('ignores enums for SRP', () => {
    const entity = { name: 'Size', kind: 'enum', responsibilities: ['a', 'b', 'c', 'd', 'e', 'f'] };
    expect(new SingleResponsibilityRule().check(parkingLot, design({ entities: [entity] }))).toEqual([]);
  });
});

describe('samples', () => {
  it.each(['parking-lot', 'elevator', 'vending-machine'])('every finding for the %s sample has evidence, a suggestion and a stable key', async (id) => {
    const result = await new RuleBasedEvaluator().evaluate(catalog.get(id), parser.parse(await loadSample(id)));
    for (const item of result.items) {
      expect(item.evidence.every((e) => typeof e === 'string' && e.length > 0)).toBe(true);
      expect(item.suggestion.length).toBeGreaterThan(10);
      expect(item.key).toMatch(/^[A-Z_]+(:.+)?$/);
      expect(item.source).toBe(FeedbackSource.RULE);
    }
  });
});

describe('RuleBasedEvaluator scoring', () => {
  it('scores each dimension 10 minus 2 per issue and 1 per suggestion', async () => {
    const result = await new RuleBasedEvaluator().evaluate(parkingLot, parser.parse(await loadSample('parking-lot')));
    const earned = Object.fromEntries(result.dimensionScores.map((s) => [s.dimension, s.earned]));
    expect(earned).toEqual({
      requirementsCoverage: 6, // missing payment concept, R7 (concurrency) not addressed
      responsibilities: 8, // ParkingLot: too many responsibilities, compound responsibility
      abstraction: 8, // SpotAllocator should be an interface
      relationships: 6, // dangling PaymentService, orphan DisplayBoard, missing cardinality
      patternsAndTradeoffs: 8, // Singleton without a reason, thin trade-offs
    });
    expect(result.totalScore).toBe(71);
  });

  it('never goes below zero', async () => {
    const result = await new RuleBasedEvaluator().evaluate(parkingLot, parser.parse({ entities: [cls('Thing', { responsibilities: [] })] }));
    expect(result.dimensionScores.every((s) => s.earned >= 0)).toBe(true);
    expect(result.scoreFor(Dimension.REQUIREMENTS_COVERAGE).earned).toBe(0);
  });

  it('runs injected rules without code changes', async () => {
    const result = await new RuleBasedEvaluator([new DanglingReferenceRule()]).evaluate(parkingLot, design({ entities: [cls('A')] }));
    expect(result.items).toEqual([]);
    expect(result.totalScore).toBe(100);
  });
});
