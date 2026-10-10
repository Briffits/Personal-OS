import { createMedicationService } from '../src/medications/medicationService';
import {
  validateCollection,
  validateDetails,
} from '../src/medications/medication';
import {
  firstId,
  secondId,
  prescriptionId,
  otherPrescriptionId,
  initialCollection,
  medicationFixture,
} from '../test-utils/medicationFixture';

test('many medications can link to one prescription and each holds only one link', async () => {
  const store = medicationFixture();
  const exists = jest.fn(async () => true);
  const service = createMedicationService(store, exists);
  let state = await service.saveDetails(
    store.state(),
    { displayName: 'Same name', prescriptionId },
    firstId,
  );
  state = await service.saveDetails(
    state,
    { displayName: 'Same name', prescriptionId },
    secondId,
  );
  expect(state.records.map(record => record.prescriptionId)).toEqual([
    prescriptionId,
    prescriptionId,
  ]);
  state = await service.saveDetails(
    state,
    { displayName: 'Renamed', prescriptionId: otherPrescriptionId },
    firstId,
  );
  expect(state.records[0]).toEqual({
    id: firstId,
    displayName: 'Renamed',
    stock: 12,
    prescriptionId: otherPrescriptionId,
  });
  state = await service.saveDetails(
    state,
    { displayName: 'Renamed', prescriptionId: null },
    firstId,
  );
  expect(state.records[0].prescriptionId).toBeNull();
  expect(state.records[1]).toEqual({
    id: secondId,
    displayName: 'Same name',
    stock: null,
    prescriptionId,
  });
});

test('new links are verified; unchanged links and unlinked edits survive unavailable prescriptions', async () => {
  const store = medicationFixture();
  const exists = jest.fn(async () => false);
  const service = createMedicationService(store, exists);
  await expect(
    service.saveDetails(
      store.state(),
      { displayName: 'Example', prescriptionId },
      firstId,
    ),
  ).rejects.toMatchObject({ code: 'prescription-unavailable' });
  expect(store.mutate).not.toHaveBeenCalled();
  exists.mockResolvedValue(true);
  let state = await service.saveDetails(
    store.state(),
    { displayName: 'Example', prescriptionId },
    firstId,
  );
  exists.mockRejectedValue(new Error('Unavailable'));
  state = await service.saveDetails(
    state,
    { displayName: 'Renamed', prescriptionId },
    firstId,
  );
  state = await service.changeStock(state, firstId, 'add', '3');
  state = await service.saveDetails(
    state,
    { displayName: 'Renamed', prescriptionId: null },
    firstId,
  );
  expect(state.records[0]).toEqual({
    id: firstId,
    displayName: 'Renamed',
    stock: 15,
    prescriptionId: null,
  });
  expect(exists).toHaveBeenCalledTimes(2);
});

test('new medication has no fabricated stock; deletion affects only selected medication', async () => {
  const store = medicationFixture();
  const service = createMedicationService(store, jest.fn());
  let state = await service.saveDetails(store.state(), {
    displayName: ' Example three ',
    prescriptionId: null,
  });
  expect(state.records[2]).toMatchObject({
    displayName: 'Example three',
    stock: null,
    prescriptionId: null,
  });
  state = await service.remove(state, firstId);
  expect(state.records.map(record => record.id)).toEqual([
    secondId,
    state.records[1].id,
  ]);
});

test('stock arithmetic preserves identity, links and all other medication fields', async () => {
  const initial = initialCollection();
  const store = medicationFixture({
    ...initial,
    records: [{ ...initial.records[0], prescriptionId }, initial.records[1]],
  });
  const service = createMedicationService(store, jest.fn());
  let state = await service.changeStock(store.state(), firstId, 'add', ' 3 ');
  expect(state.records[0]).toEqual({
    ...initial.records[0],
    prescriptionId,
    stock: 15,
  });
  state = await service.changeStock(state, secondId, 'record', '0');
  state = await service.changeStock(state, secondId, 'add', '2');
  state = await service.changeStock(state, firstId, 'correct', '0');
  expect(state.records.map(record => record.stock)).toEqual([0, 2]);
});

test.each(['', '-1', '1.5', 'NaN', 'Infinity', '1e3', '9007199254740992', '0'])(
  'invalid stock addition %p never writes',
  async input => {
    const store = medicationFixture();
    const service = createMedicationService(store, jest.fn());
    expect(() =>
      service.changeStock(store.state(), firstId, 'add', input),
    ).toThrow();
    expect(store.mutate).not.toHaveBeenCalled();
  },
);

test('overflow, unrecorded addition, double recording and unknown IDs reject', () => {
  const state = initialCollection();
  const store = medicationFixture({
    ...state,
    records: [
      { ...state.records[0], stock: Number.MAX_SAFE_INTEGER },
      state.records[1],
    ],
  });
  const service = createMedicationService(store, jest.fn());
  expect(() =>
    service.changeStock(store.state(), firstId, 'add', '1'),
  ).toThrow();
  expect(() =>
    service.changeStock(store.state(), secondId, 'add', '1'),
  ).toThrow();
  expect(() =>
    service.changeStock(store.state(), firstId, 'record', '1'),
  ).toThrow();
  expect(() => service.remove(store.state(), 'missing')).toThrow();
  expect(store.mutate).not.toHaveBeenCalled();
});

test('reusing a snapshot cannot apply stock twice', async () => {
  const store = medicationFixture();
  const service = createMedicationService(store, jest.fn());
  const snapshot = store.state();
  await service.changeStock(snapshot, firstId, 'add', '3');
  await expect(
    service.changeStock(snapshot, firstId, 'add', '3'),
  ).rejects.toMatchObject({ code: 'stale-state' });
  expect(store.state().records[0].stock).toBe(15);
});

test('completion retains pending ID/stock and leaves prescription link null', async () => {
  const store = medicationFixture({
    schemaVersion: 1,
    revision: 0,
    records: [],
    pendingLegacy: { id: firstId, stock: 0, prescriptionId: null },
  });
  const service = createMedicationService(store, jest.fn());
  const state = await service.completeLegacy(store.state(), ' Saved example ');
  expect(state.records).toEqual([
    {
      id: firstId,
      stock: 0,
      displayName: 'Saved example',
      prescriptionId: null,
    },
  ]);
  expect(state.pendingLegacy).toBeNull();
});

test.each([undefined, [], '', 'bad', [prescriptionId], { id: prescriptionId }])(
  'invalid relationship %p is rejected',
  value => {
    expect(() =>
      validateDetails({
        displayName: 'Example',
        prescriptionId: value as never,
      }),
    ).toThrow();
    const state = initialCollection();
    expect(() =>
      validateCollection({
        ...state,
        records: [{ ...state.records[0], prescriptionId: value }],
      }),
    ).toThrow();
  },
);

test.each([
  { schemaVersion: 2 },
  { revision: -1 },
  { revision: true },
  { pendingLegacy: undefined },
  { records: [...initialCollection().records, initialCollection().records[0]] },
  { records: [{ ...initialCollection().records[0], stock: true }] },
  { records: [{ ...initialCollection().records[0], stock: undefined }] },
  { records: [{ ...initialCollection().records[0], displayName: ' ' }] },
  { pendingLegacy: { id: firstId, stock: 0, prescriptionId } },
])('malformed collection cannot be accepted: %p', changes => {
  expect(() =>
    validateCollection({ ...initialCollection(), ...changes }),
  ).toThrow();
});

test.each([undefined, null, 12, '', '   '])(
  'invalid name %p cannot reach persistence',
  async displayName => {
    const store = medicationFixture();
    const service = createMedicationService(store, jest.fn());
    await expect(
      service.saveDetails(store.state(), {
        displayName: displayName as never,
        prescriptionId: null,
      }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    expect(store.mutate).not.toHaveBeenCalled();
  },
);

test('invalid prescription ID cannot start an unlink read or write', async () => {
  const store = medicationFixture();
  const service = createMedicationService(store, jest.fn());
  await expect(service.unlinkPrescription('not-an-id')).rejects.toMatchObject({
    code: 'invalid-input',
  });
  expect(store.read).not.toHaveBeenCalled();
  expect(store.mutate).not.toHaveBeenCalled();
});
