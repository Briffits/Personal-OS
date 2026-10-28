import frozen from '../test-utils/fixtures/medication-v2.json';
import { NativeModules } from 'react-native';
import { NativeMedicationStorage } from '../src/native/NativeMedicationStorage';
import {
  validateCollection,
  parseStockInput,
  validateDetails,
} from '../src/medications/medication';
import { calculateStock } from '../src/medications/medicationStock';
import { createMedicationService } from '../src/medications/medicationService';
import {
  medicationFixture,
  prescriptionId,
} from '../test-utils/medicationFixture';

afterEach(() => {
  delete NativeModules.MedicationStorage;
});

test('frozen recorded-v2 contract survives validation and bridge without dropping fields', async () => {
  const original = JSON.stringify(frozen);
  expect(validateCollection(frozen)).toEqual(frozen);
  NativeModules.MedicationStorage = {
    read: jest.fn(async () => frozen),
    mutate: jest.fn(async () => frozen),
  };
  expect(await NativeMedicationStorage.read()).toEqual(frozen);
  expect(NativeModules.MedicationStorage.mutate).not.toHaveBeenCalled();
  expect(
    await NativeMedicationStorage.mutate(42, {
      type: 'edit',
      id: frozen.records[0].id,
      displayName: 'Synthetic edit',
      prescriptionId,
    }),
  ).toEqual(frozen);
  expect(JSON.stringify(frozen)).toBe(original);
});

test('frozen records preserve all unrelated fields through permitted service commands', async () => {
  const initial = validateCollection(frozen);
  const store = medicationFixture(initial);
  const service = createMedicationService(store, async () => true);
  const edited = await service.saveDetails(
    initial,
    { displayName: 'Synthetic edit', prescriptionId },
    initial.records[1].id,
  );
  expect(edited.records).toEqual(
    initial.records.map((record, index) =>
      index === 1 ? { ...record, displayName: 'Synthetic edit' } : record,
    ),
  );
  const unlinked = await service.unlinkPrescription(prescriptionId);
  expect(unlinked.records).toEqual(
    edited.records.map(record => ({ ...record, prescriptionId: null })),
  );
  const added = await service.changeStock(
    unlinked,
    initial.records[0].id,
    'add',
    '0,25',
  );
  expect(added.records.slice(1)).toEqual(unlinked.records.slice(1));
  expect(added.records[0]).toMatchObject({
    ...unlinked.records[0],
    stockAdditions: expect.any(Array),
  });
  expect(calculateStock(added.records[0])).toEqual({
    status: 'recorded',
    quantity: 5.25,
  });
});

test('linked and retained-source stock never becomes gross manual stock or permits stock commands', () => {
  const initial = validateCollection(frozen);
  const store = medicationFixture(initial);
  const service = createMedicationService(store, async () => true);
  expect(calculateStock(initial.records[1])).toEqual({
    status: 'health-unavailable',
  });
  expect(calculateStock(initial.records[2])).toEqual({
    status: 'confirmation-required',
  });
  for (const record of initial.records.slice(1, 3)) {
    for (const action of ['record', 'correct', 'add'] as const) {
      expect(() =>
        service.changeStock(initial, record.id, action, '1'),
      ).toThrow(expect.objectContaining({ code: 'unsupported-stock-source' }));
    }
  }
  expect(store.mutate).not.toHaveBeenCalled();
});

test.each([0, 1, 3, Number.MAX_SAFE_INTEGER])(
  'unsupported bridge version %p is distinct and never mutated',
  async schemaVersion => {
    NativeModules.MedicationStorage = {
      read: jest.fn(async () => ({ schemaVersion })),
      mutate: jest.fn(),
    };
    await expect(NativeMedicationStorage.read()).rejects.toMatchObject({
      code: 'unsupported-version',
    });
    expect(NativeModules.MedicationStorage.mutate).not.toHaveBeenCalled();
  },
);

test.each([undefined, null, true, -1, 1.5, '2'])(
  'malformed schema version %p is not an upgrade request',
  schemaVersion => {
    expect(() => validateCollection({ ...frozen, schemaVersion })).toThrow(
      expect.objectContaining({ code: 'invalid-record' }),
    );
  },
);

test.each([
  'stockUnit',
  'stockBaseline',
  'stockAdditions',
  'legacyRecordedStock',
  'lowStockThreshold',
  'healthKitLink',
  'prescriptionId',
])('missing required field %s is never defaulted', key => {
  const record: Record<string, unknown> = { ...frozen.records[0] };
  delete record[key];
  expect(() => validateCollection({ ...frozen, records: [record] })).toThrow(
    expect.objectContaining({ code: 'invalid-record' }),
  );
});

test('manual decimal arithmetic and input preserve ordinary fractions without rounding input', async () => {
  const store = medicationFixture(validateCollection(frozen));
  const service = createMedicationService(store, async () => true);
  let state = await service.changeStock(
    await service.read(),
    frozen.records[0].id,
    'correct',
    '0.1',
  );
  state = await service.changeStock(state, frozen.records[0].id, 'add', '0,2');
  expect(calculateStock(state.records[0])).toEqual({
    status: 'recorded',
    quantity: 0.3,
  });
  expect(state.records[0].lowStockThreshold).toBe(0);
  for (const value of [
    '1e2',
    '1,000.1',
    '0.10000000000000001',
    '9007199254740992',
  ]) {
    expect(() => parseStockInput(value)).toThrow();
  }
});

const nativeWhitespace =
  '\u0009\u000a\u000b\u000c\u000d \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u200b\u2028\u2029\u202f\u205f\u3000';
test.each([
  [nativeWhitespace, false],
  ['\u0085', false],
  ['\u200b', false],
  ['\ufeff', true],
  ['\ufeffSynthetic', true],
  [nativeWhitespace + 'Synthetic' + nativeWhitespace, true],
] as const)(
  'stored string %p agrees with native validation without normalization',
  (value, valid) => {
    for (const changes of [
      { displayName: value },
      { healthKitLink: { conceptReference: value } },
    ]) {
      const collection = {
        ...frozen,
        records: [{ ...frozen.records[4], ...changes }],
      };
      if (valid) {
        expect(validateCollection(collection)).toEqual(collection);
      } else {
        expect(() => validateCollection(collection)).toThrow(
          expect.objectContaining({ code: 'invalid-record' }),
        );
      }
    }
  },
);
test('command name trimming matches native rather than ECMAScript whitespace', () => {
  expect(
    validateDetails({
      displayName: nativeWhitespace + 'Synthetic' + nativeWhitespace,
      prescriptionId: null,
    }).displayName,
  ).toBe('Synthetic');
  expect(
    validateDetails({ displayName: '\ufeff', prescriptionId: null })
      .displayName,
  ).toBe('\ufeff');
});
test.each([
  ['0000-01-01T00:00:00.000Z', true],
  ['0000-02-29T00:00:00.000Z', true],
  ['1500-02-29T00:00:00.000Z', false],
  ['1582-10-10T00:00:00.000Z', true],
  ['2000-02-29T23:59:59.999Z', true],
  ['1900-02-29T00:00:00.000Z', false],
  ['9999-12-31T23:59:59.999Z', true],
  ['10000-01-01T00:00:00.000Z', false],
  ['2026-01-01T24:00:00.000Z', false],
  ['2026-01-01T00:00:60.000Z', false],
  ['2026-01-01T00:00:00.000Z\n', false],
] as const)(
  'canonical timestamp %s agrees with native validation',
  (recordedAt, valid) => {
    const collection = {
      ...frozen,
      records: [
        {
          ...frozen.records[0],
          stockAdditions: [],
          stockBaseline: { ...frozen.records[0].stockBaseline!, recordedAt },
        },
      ],
    };
    if (valid) {
      expect(validateCollection(collection)).toEqual(collection);
    } else {
      expect(() => validateCollection(collection)).toThrow(
        expect.objectContaining({ code: 'invalid-record' }),
      );
    }
  },
);
test.each([0, -0, 0.5, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER])(
  'quantity boundary %p agrees with native and preserves zero/null',
  quantity => {
    const collection = {
      ...frozen,
      records: [
        {
          ...frozen.records[4],
          legacyRecordedStock: quantity,
          lowStockThreshold: quantity,
        },
      ],
    };
    expect(validateCollection(collection)).toEqual(collection);
  },
);
test.each([
  true,
  -1,
  Number.MAX_SAFE_INTEGER + 1,
  '1',
  NaN,
  Infinity,
  -Infinity,
])('invalid quantity %p never becomes a default', quantity => {
  const collection = {
    ...frozen,
    records: [{ ...frozen.records[4], legacyRecordedStock: quantity }],
  };
  expect(() => validateCollection(collection)).toThrow(
    expect.objectContaining({ code: 'invalid-record' }),
  );
});
