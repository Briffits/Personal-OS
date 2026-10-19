import { NativeModules } from 'react-native';
import { NativeMedicationHealth } from '../src/native/NativeMedicationHealth';
import { calculateStock } from '../src/medications/medicationStock';
import { createMedicationService } from '../src/medications/medicationService';
import {
  firstId,
  secondId,
  initialCollection,
} from '../test-utils/medicationFixture';

const request = {
  baselineId: secondId,
  conceptReference: 'synthetic-reference',
  from: '2026-01-01T00:00:00.000Z',
  through: '2026-01-02T00:00:00.000Z',
};
const event = {
  id: firstId,
  conceptReference: request.conceptReference,
  occurredAt: request.through,
  logStatus: 'taken',
  unit: 'count',
  quantity: 0.125,
};
function bridge(events: unknown[] = [event]) {
  NativeModules.MedicationHealth = {
    availability: jest.fn(async () => 'available'),
    requestMedicationAccess: jest.fn(async () => undefined),
    listMedications: jest.fn(async () => []),
    readDoseSnapshot: jest.fn(async () => ({
      ...request,
      coverage: 'complete-query',
      events,
    })),
    validateConceptReference: jest.fn(async () => true),
    compareConceptReferences: jest.fn(async () => true),
  };
  return NativeModules.MedicationHealth;
}
afterEach(() => {
  delete NativeModules.MedicationHealth;
});
test('unavailable module does not invent data', async () => {
  expect(await NativeMedicationHealth.availability()).toBe('unsupported');
  await expect(NativeMedicationHealth.listMedications()).rejects.toMatchObject({
    code: 'health-unavailable',
  });
});
test('complete snapshots preserve fractional actual quantities and exact provenance', async () => {
  const native = bridge();
  expect(await NativeMedicationHealth.readDoseSnapshot(request)).toEqual({
    ...request,
    coverage: 'complete-query',
    events: [event],
  });
  expect(native.readDoseSnapshot).toHaveBeenCalledWith(request);
  expect(native.requestMedicationAccess).not.toHaveBeenCalled();
});
test.each([
  { quantity: null },
  { quantity: -1 },
  { unit: 'unsupported' },
  { logStatus: 'future-status' },
])(
  'problematic relevant data stays present and incomplete: %p',
  async changes => {
    bridge([{ ...event, ...changes }]);
    const snapshot = await NativeMedicationHealth.readDoseSnapshot(request);
    expect(snapshot.coverage).toBe('limited');
    expect(snapshot.events).toHaveLength(1);
  },
);
test.each([
  { conceptReference: 'another' },
  { occurredAt: request.from },
  { occurredAt: 'bad' },
  { id: '' },
])(
  'malformed response cannot become an empty complete query: %p',
  async changes => {
    bridge([{ ...event, ...changes }]);
    await expect(
      NativeMedicationHealth.readDoseSnapshot(request),
    ).rejects.toMatchObject({ code: 'incomplete-dose-data' });
  },
);
test('empty query and query failure remain distinct', async () => {
  const native = bridge([]);
  expect(
    (await NativeMedicationHealth.readDoseSnapshot(request)).events,
  ).toEqual([]);
  native.readDoseSnapshot.mockRejectedValue({
    code: 'query-failed',
    message: 'private native details',
  });
  await expect(
    NativeMedicationHealth.readDoseSnapshot(request),
  ).rejects.toMatchObject({
    code: 'query-failed',
    message: 'Health medication operation: query-failed.',
  });
});
test.each([
  'authorization-cancelled',
  'authorization-failed',
  'health-unavailable',
])('authorization %s is explicit and sanitized', async code => {
  bridge().requestMedicationAccess.mockRejectedValue({
    code,
    message: 'private',
  });
  await expect(
    NativeMedicationHealth.requestMedicationAccess(),
  ).rejects.toMatchObject({
    code,
    message: `Health medication operation: ${code}.`,
  });
});
test('identity comparison is native semantic equality', async () => {
  const native = bridge();
  expect(
    await NativeMedicationHealth.compareConceptReferences(
      'archive-a',
      'archive-b',
    ),
  ).toBe(true);
  expect(native.compareConceptReferences).toHaveBeenCalledWith(
    'archive-a',
    'archive-b',
  );
  native.validateConceptReference.mockRejectedValue({
    code: 'malformed-identity',
  });
  await expect(
    NativeMedicationHealth.validateConceptReference('bad'),
  ).rejects.toMatchObject({ code: 'malformed-identity' });
});
test('readable list includes archive flag but no unrelated fields', async () => {
  bridge().listMedications.mockResolvedValue([
    {
      conceptReference: 'synthetic',
      displayName: 'Synthetic',
      nickname: null,
      form: 'tablet',
      isArchived: true,
      hasSchedule: false,
      unrelated: 'discard',
    },
  ]);
  expect(await NativeMedicationHealth.listMedications()).toEqual([
    {
      conceptReference: 'synthetic',
      displayName: 'Synthetic',
      nickname: null,
      form: 'tablet',
      isArchived: true,
      hasSchedule: false,
    },
  ]);
});
test('invalid interval never starts a query', async () => {
  const native = bridge();
  await expect(
    NativeMedicationHealth.readDoseSnapshot({ ...request, from: 'bad' }),
  ).rejects.toMatchObject({ code: 'invalid-interval' });
  expect(native.readDoseSnapshot).not.toHaveBeenCalled();
});
test('link uses one atomic baseline command and uncertain writes are never retried', async () => {
  const state = initialCollection();
  const store = {
    read: jest.fn(async () => state),
    mutate: jest.fn(async () => state),
  };
  const service = createMedicationService(store, jest.fn());
  await service.linkHealth(state, firstId, 'opaque', '2,5');
  expect(store.mutate).toHaveBeenCalledWith(0, {
    type: 'linkHealth',
    id: firstId,
    conceptReference: 'opaque',
    quantity: 2.5,
  });
  store.mutate.mockRejectedValue({ code: 'commit-uncertain' });
  await expect(service.unlinkHealth(state, firstId)).rejects.toMatchObject({
    code: 'commit-uncertain',
  });
  expect(store.mutate).toHaveBeenCalledTimes(2);
  expect(() => service.linkHealth(state, firstId, 'opaque', '')).toThrow();
});
test('unlinked Health baseline cannot become current manual stock', () => {
  const record = {
    ...initialCollection().records[0],
    legacyRecordedStock: null,
    stockBaseline: {
      id: secondId,
      quantity: 5,
      recordedAt: request.from,
      healthKitConceptReference: request.conceptReference,
    },
  };
  expect(calculateStock(record)).toEqual({ status: 'confirmation-required' });
});
