import { Rubric, tokenize } from '../../src/domain/index.js';

describe('tokenize', () => {
  it.each([
    ['NearestSpotAllocationStrategy', ['nearest', 'spot', 'allocation', 'strategy']],
    ['spot_allocator', ['spot', 'allocator']],
    ['HTTPPaymentGateway', ['http', 'payment', 'gateway']],
    ['ParkingSpots', ['parking', 'spot']],
  ])('%s', (name, tokens) => {
    expect(tokenize(name)).toEqual(tokens);
  });
});

describe('Rubric.matchEntities', () => {
  const rubric = new Rubric({
    concepts: [
      { id: 'spot', name: 'Spot', aliases: ['Spot', 'ParkingSpot'], why: 'w' },
      { id: 'allocation', name: 'Allocation', aliases: ['SpotAllocator', 'AllocationStrategy'], expectAbstraction: true, why: 'w' },
      { id: 'vehicle', name: 'Vehicle', aliases: ['Vehicle', 'Car'], why: 'w' },
    ],
  });
  const match = (...names) => rubric.matchEntities(names.map((name) => ({ name })));

  it('matches aliases inside longer names', () => {
    expect(match('NearestAllocationStrategy').get('allocation')).toHaveLength(1);
  });

  it('assigns an entity to the most specific concept only', () => {
    const matches = match('SpotAllocator', 'ParkingSpot');
    expect(matches.get('allocation').map((e) => e.name)).toEqual(['SpotAllocator']);
    expect(matches.get('spot').map((e) => e.name)).toEqual(['ParkingSpot']);
  });

  it('matches whole tokens, not substrings', () => {
    expect(match('CardPayment').get('vehicle')).toEqual([]);
  });

  it('applies default weights that sum to 100', () => {
    expect(Object.values(rubric.weights).reduce((a, b) => a + b, 0)).toBe(100);
  });
});
