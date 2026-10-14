/**
 * A complete, good Parking Lot design that deliberately avoids the most obvious names
 * (Garage/Level/Slot/SpotAssigner/Tariff/PaymentGateway instead of ParkingLot/Floor/Spot/
 * ParkingStrategy/PricingStrategy/Payment). It should score full marks: valid alternative
 * designs must not be penalised for not matching a reference answer.
 */
export const alternateParkingLotDesign = {
  entities: [
    { name: 'Garage', kind: 'class', responsibilities: ['Own the levels', 'Hand parking requests to the assigner'], methods: ['admit(vehicle): ParkingTicket', 'release(ticket): Receipt'] },
    { name: 'Level', kind: 'class', responsibilities: ['Hold its slots', 'Report free slot counts'], methods: ['freeSlots(size): int'] },
    { name: 'Slot', kind: 'class', responsibilities: ['Know its size and occupant'], methods: ['occupy(vehicle)', 'vacate()'] },
    { name: 'SlotSize', kind: 'enum', responsibilities: ['SMALL, MEDIUM, LARGE'], methods: [] },
    { name: 'Vehicle', kind: 'abstract', responsibilities: ['Know its plate and the slot size it needs'], methods: ['requiredSize(): SlotSize'] },
    { name: 'Car', kind: 'class', responsibilities: ['Need a MEDIUM slot'], methods: ['requiredSize(): SlotSize'] },
    { name: 'SpotAssigner', kind: 'interface', responsibilities: ['Pick a free slot for a vehicle'], methods: ['assign(vehicle): Slot'] },
    { name: 'NearestFirstAssigner', kind: 'class', responsibilities: ['Pick the nearest free slot, locking it so two gates never share it'], methods: ['assign(vehicle): Slot'] },
    { name: 'ParkingTicket', kind: 'class', responsibilities: ['Record vehicle, slot and entry time'], methods: ['entryTime(): Instant'] },
    { name: 'Tariff', kind: 'interface', responsibilities: ['Price a stay'], methods: ['price(ticket, exitTime): Money'] },
    { name: 'HourlyTariff', kind: 'class', responsibilities: ['Charge per started hour by slot size'], methods: ['price(ticket, exitTime): Money'] },
    { name: 'PaymentGateway', kind: 'interface', responsibilities: ['Take a payment'], methods: ['pay(amount): Receipt'] },
    { name: 'CardGateway', kind: 'class', responsibilities: ['Charge a card'], methods: ['pay(amount): Receipt'] },
    { name: 'AvailabilityBoard', kind: 'class', responsibilities: ['Show free slots per level'], methods: ['refresh(level)'] },
  ],
  relationships: [
    { from: 'Garage', to: 'Level', type: 'has-a', cardinality: '1..*' },
    { from: 'Level', to: 'Slot', type: 'has-a', cardinality: '1..*' },
    { from: 'Slot', to: 'SlotSize', type: 'has-a', cardinality: '1' },
    { from: 'Car', to: 'Vehicle', type: 'is-a' },
    { from: 'Garage', to: 'SpotAssigner', type: 'uses' },
    { from: 'NearestFirstAssigner', to: 'SpotAssigner', type: 'implements' },
    { from: 'SpotAssigner', to: 'Slot', type: 'uses' },
    { from: 'Garage', to: 'Tariff', type: 'uses' },
    { from: 'HourlyTariff', to: 'Tariff', type: 'implements' },
    { from: 'Garage', to: 'PaymentGateway', type: 'uses' },
    { from: 'CardGateway', to: 'PaymentGateway', type: 'implements' },
    { from: 'ParkingTicket', to: 'Vehicle', type: 'has-a', cardinality: '1' },
    { from: 'ParkingTicket', to: 'Slot', type: 'has-a', cardinality: '1' },
    { from: 'Garage', to: 'ParkingTicket', type: 'uses' },
    { from: 'AvailabilityBoard', to: 'Level', type: 'uses' },
  ],
  patterns: [
    { name: 'Strategy', where: 'SpotAssigner', why: 'Slot selection policy changes (nearest, EV first) without touching Garage.' },
    { name: 'Strategy', where: 'Tariff', why: 'Pricing rules change often and must stay out of the ticket.' },
    { name: 'Strategy', where: 'PaymentGateway', why: 'New payment methods are added without changing the exit flow.' },
    { name: 'Observer', where: 'AvailabilityBoard', why: 'The board refreshes whenever a level\'s free count changes.' },
  ],
  keyFlows: 'Enter: Garage.admit(vehicle) asks SpotAssigner.assign(vehicle), which locks and returns a Slot; Garage issues a ParkingTicket. If no slot fits, admit() rejects the vehicle.\nExit: Garage.release(ticket) prices the stay with Tariff.price(ticket, now), charges PaymentGateway.pay(amount), then frees the Slot; the AvailabilityBoard refreshes.',
  tradeOffs: 'Strategy for slot selection, pricing and payment adds three interfaces, but each policy changes independently of Garage. Locking per slot instead of one global lock keeps gates parallel at the cost of more careful code.',
  assumptions: 'Cars only in this version; a car never takes a smaller slot. Fees per started hour. Gates run concurrently.',
};
