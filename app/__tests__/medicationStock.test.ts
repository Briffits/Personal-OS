import { calculateStock } from '../src/medications/medicationStock';
import {
  isStock,
  parseStockInput,
  validateCollection,
  type MedicationRecord,
} from '../src/medications/medication';
import type {
  MedicationDoseEvent,
  MedicationDoseSnapshot,
} from '../src/medications/medicationHealth';
import {
  initialCollection,
  firstId,
  secondId,
  prescriptionId,
  stockFields,
} from '../test-utils/medicationFixture';

const start = '2026-01-01T00:00:00.000Z';
const after = '2026-01-02T00:00:00.000Z';
const cutoff = '2026-01-03T00:00:00.000Z';
function record(): MedicationRecord {
  return {
    ...initialCollection().records[0],
    ...stockFields(null),
    healthKitLink: { conceptReference: 'synthetic-concept' },
    lowStockThreshold: 8,
    stockBaseline: {
      id: firstId,
      quantity: 10,
      recordedAt: start,
      healthKitConceptReference: 'synthetic-concept',
    },
    stockAdditions: [
      { id: secondId, baselineId: firstId, quantity: 1.5, recordedAt: after },
    ],
  };
}
function event(
  changes: Partial<MedicationDoseEvent> = {},
): MedicationDoseEvent {
  return {
    id: 'synthetic-event',
    conceptReference: 'synthetic-concept',
    occurredAt: after,
    logStatus: 'taken',
    quantity: 0.5,
    unit: 'count',
    ...changes,
  };
}
function snapshot(
  events: MedicationDoseEvent[] = [event()],
): MedicationDoseSnapshot {
  return {
    baselineId: firstId,
    conceptReference: 'synthetic-concept',
    from: start,
    through: cutoff,
    coverage: 'complete-query',
    events,
  };
}
function quantity(events: MedicationDoseEvent[]) {
  const result = calculateStock(record(), snapshot(events));
  expect(result.status).toBe('estimated');
  return 'quantity' in result ? result.quantity : NaN;
}

test('baseline plus additions minus fractional taken quantities; inputs are unchanged', () => {
  const medication = record();
  const doses = snapshot();
  const original = JSON.stringify([medication, doses]);
  expect(calculateStock(medication, doses)).toEqual({
    status: 'estimated',
    quantity: 11,
    low: false,
    noReadableEvents: false,
  });
  expect(JSON.stringify([medication, doses])).toBe(original);
});

test('every refresh replaces the entire contribution, including edits, undo and deletion', () => {
  expect(quantity([event()])).toBe(11);
  expect(quantity([event({ quantity: 2.5 })])).toBe(9);
  expect(quantity([event({ logStatus: 'notLogged' })])).toBe(11.5);
  expect(quantity([])).toBe(11.5);
  expect(quantity([event()])).toBe(11);
});

test.each([
  'skipped',
  'notLogged',
  'snoozed',
  'notInteracted',
  'notificationNotSent',
] as const)(
  '%s never reduces stock, even with a positive quantity',
  logStatus => {
    expect(quantity([event({ logStatus, quantity: 8 })])).toBe(11.5);
  },
);

test('same UUID is counted once; different UUIDs with identical values are separate doses', () => {
  expect(quantity([event(), event()])).toBe(11);
  expect(quantity([event(), event({ id: 'second-event' })])).toBe(10.5);
  expect(
    calculateStock(record(), snapshot([event(), event({ quantity: 1 })])),
  ).toEqual({ status: 'incomplete' });
});

test('event time controls the boundary, including edits across the baseline and future doses', () => {
  for (const occurredAt of [
    '2025-12-31T00:00:00.000Z',
    start,
    '2026-01-04T00:00:00.000Z',
  ]) {
    expect(quantity([event({ occurredAt })])).toBe(11.5);
  }
  expect(quantity([event({ occurredAt: cutoff })])).toBe(11);
  expect(quantity([event({ occurredAt: '2026-01-01T00:00:00.001Z' })])).toBe(
    11,
  );
});

test.each([
  { quantity: null },
  { quantity: NaN },
  { quantity: Infinity },
  { quantity: -1 },
  { quantity: Number.MAX_SAFE_INTEGER + 1 },
  { unit: 'unsupported' },
  { logStatus: 'unknown' },
  { occurredAt: '2026-02-30T00:00:00.000Z' },
  { conceptReference: 'different-concept' },
] as Partial<MedicationDoseEvent>[])(
  'invalid/incompatible event makes the whole estimate incomplete: %p',
  changes => {
    expect(calculateStock(record(), snapshot([event(changes)]))).toEqual({
      status: 'incomplete',
    });
  },
);

test.each([
  { baselineId: secondId },
  { conceptReference: 'different-concept' },
  { from: after },
  { through: start },
  { through: 'invalid' },
  { coverage: 'limited' },
] as Partial<MedicationDoseSnapshot>[])(
  'obsolete or incomplete snapshot cannot be used: %p',
  changes => {
    expect(calculateStock(record(), { ...snapshot(), ...changes })).toEqual({
      status: 'incomplete',
    });
  },
);

test('missing Health, unlink and relink never resurrect the gross stock quantity', () => {
  expect(calculateStock(record())).toEqual({ status: 'health-unavailable' });
  expect(calculateStock({ ...record(), healthKitLink: null })).toEqual({
    status: 'confirmation-required',
  });
  expect(
    calculateStock(
      { ...record(), healthKitLink: { conceptReference: 'different' } },
      snapshot(),
    ),
  ).toEqual({ status: 'confirmation-required' });
  expect(
    calculateStock({
      ...record(),
      stockBaseline: null,
      stockAdditions: [],
      legacyRecordedStock: 10,
    }),
  ).toEqual({ status: 'confirmation-required' });
});

test('a new physical baseline excludes all older doses and additions', () => {
  const medication: MedicationRecord = {
    ...record(),
    stockAdditions: [],
    stockBaseline: {
      ...record().stockBaseline!,
      id: prescriptionId,
      recordedAt: after,
      quantity: 3,
    },
  };
  expect(calculateStock(medication, snapshot())).toEqual({
    status: 'incomplete',
  });
  expect(
    calculateStock(medication, {
      ...snapshot(),
      baselineId: prescriptionId,
      from: after,
    }),
  ).toMatchObject({ status: 'estimated', quantity: 3 });
});

test('negative calculation requires physical confirmation; no clamping or baseline rewrite', () => {
  expect(calculateStock(record(), snapshot([event({ quantity: 12 })]))).toEqual(
    { status: 'confirmation-required' },
  );
});

test('threshold is opt-in, inclusive, fractional and zero-capable', () => {
  const base = { ...initialCollection().records[0], ...stockFields(0.5) };
  expect(calculateStock(base)).toMatchObject({ quantity: 0.5, low: false });
  expect(calculateStock({ ...base, lowStockThreshold: 0.5 })).toMatchObject({
    low: true,
  });
  expect(calculateStock({ ...base, lowStockThreshold: 0 })).toMatchObject({
    low: false,
  });
  expect(
    calculateStock({ ...base, legacyRecordedStock: 0, lowStockThreshold: 0 }),
  ).toMatchObject({ low: true });
  expect(calculateStock({ ...base, legacyRecordedStock: null })).toEqual({
    status: 'unrecorded',
  });
});

test('manual baseline arithmetic works without a Health reader', () => {
  const medication = {
    ...record(),
    healthKitLink: null,
    stockBaseline: {
      ...record().stockBaseline!,
      healthKitConceptReference: null,
    },
  };
  expect(calculateStock(medication)).toMatchObject({
    status: 'recorded',
    quantity: 11.5,
  });
});

test('empty query is explicitly marked as no readable events, not proof of no doses', () => {
  expect(calculateStock(record(), snapshot([]))).toMatchObject({
    noReadableEvents: true,
  });
});

test('fractional quantities survive validation and native response reconstruction', () => {
  const collection = { ...initialCollection(), records: [record()] };
  expect(validateCollection(collection)).toEqual(collection);
  expect(parseStockInput(' 0,5 ')).toBe(0.5);
  expect(parseStockInput('0.25')).toBe(0.25);
  expect(isStock(true)).toBe(false);
  expect(isStock(0.5)).toBe(true);
});

test.each(['1e3', '1,000.5', '0x10', '-1', '', 'Infinity', 'NaN'])(
  'quantity input rejects %p',
  input => {
    expect(() => parseStockInput(input)).toThrow();
  },
);

test.each([
  { legacyRecordedStock: 1 },
  { stockUnit: 'mg' },
  { lowStockThreshold: -1 },
  { stockBaseline: undefined },
  { stockAdditions: undefined },
  { healthKitLink: {} },
  {
    stockBaseline: {
      ...record().stockBaseline!,
      recordedAt: '2026-02-30T00:00:00.000Z',
    },
  },
  { stockAdditions: [record().stockAdditions[0], record().stockAdditions[0]] },
  { stockAdditions: [{ ...record().stockAdditions[0], baselineId: secondId }] },
  { stockAdditions: [{ ...record().stockAdditions[0], quantity: 0 }] },
  {
    stockAdditions: [
      { ...record().stockAdditions[0], recordedAt: '2025-12-01T00:00:00.000Z' },
    ],
  },
])('malformed v2 stock record fails validation: %p', change => {
  expect(() =>
    validateCollection({
      ...initialCollection(),
      records: [{ ...record(), ...change }],
    }),
  ).toThrow();
});

test('revision remains an integer and unexpected derived fields are never propagated', () => {
  expect(() =>
    validateCollection({ ...initialCollection(), revision: 0.5 }),
  ).toThrow();
  const state = validateCollection({
    ...initialCollection(),
    records: [{ ...record(), estimatedStock: 999, stock: 999 }],
  });
  expect(state.records[0]).not.toHaveProperty('estimatedStock');
  expect(state.records[0]).not.toHaveProperty('stock');
});

test('ordinary decimal fractions reconcile exactly without whole-count rounding', () => {
  const medication = {
    ...record(),
    stockBaseline: { ...record().stockBaseline!, quantity: 0.3 },
    stockAdditions: [],
  };
  expect(
    calculateStock(
      medication,
      snapshot([
        event({ quantity: 0.1 }),
        event({ id: 'second', quantity: 0.2 }),
      ]),
    ),
  ).toMatchObject({ status: 'estimated', quantity: 0 });
  expect(
    calculateStock({
      ...medication,
      healthKitLink: null,
      stockBaseline: {
        ...medication.stockBaseline,
        quantity: 0.1,
        healthKitConceptReference: null,
      },
      stockAdditions: [{ ...record().stockAdditions[0], quantity: 0.2 }],
      lowStockThreshold: 0.3,
    }),
  ).toMatchObject({ quantity: 0.3, low: true });
});

test.each([
  '9007199254740991.1',
  '0.123456789012345678901',
  '0.' + '0'.repeat(324) + '1',
])('input that loses its decimal value rejects: %s', input => {
  expect(() => parseStockInput(input)).toThrow();
});
