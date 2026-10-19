import { stockFields } from '../test-utils/medicationFixture';
import { createPrescriptionDeletionCoordinator } from '../src/coordination/prescriptionDeletion';
import { createMedicationService } from '../src/medications/medicationService';
import {
  validateCollection,
  type MedicationRecord,
} from '../src/medications/medication';
import {
  createPrescriptionService,
  type PrescriptionWalletState,
} from '../src/prescriptions/prescriptionService';
import type { PrescriptionRecord } from '../src/prescriptions/prescription';
import {
  firstId,
  secondId,
  prescriptionId,
  otherPrescriptionId,
  initialCollection,
  medicationFixture,
} from '../test-utils/medicationFixture';

const prescription: PrescriptionRecord = {
  id: prescriptionId as PrescriptionRecord['id'],
  documentId: firstId as PrescriptionRecord['documentId'],
  kind: 'standard',
  expiresOn: '2028-01-01',
  medicationIds: [],
};
function setup(records: MedicationRecord[]) {
  const medicationStore = medicationFixture({
    ...initialCollection(),
    records,
  });
  const medications = createMedicationService(medicationStore, jest.fn());
  let wallet: PrescriptionWalletState = {
    records: [prescription],
    pendingCleanup: [],
  };
  const store = {
    read: jest.fn(async () => wallet),
    remove: jest.fn(async () => {
      // Publication can never precede the acknowledged unlink.
      expect(
        medicationStore
          .state()
          .records.every(record => record.prescriptionId !== prescriptionId),
      ).toBe(true);
      wallet = { records: [], pendingCleanup: [] };
    }),
    cleanup: jest.fn(async () => {}),
    create: jest.fn(),
    replace: jest.fn(),
    updateMetadata: jest.fn(),
  };
  const confirmDeletion = jest.fn(async () => true);
  const prescriptions = createPrescriptionService({
    store,
    documents: { select: jest.fn(), release: jest.fn(), open: jest.fn() },
    confirmDeletion,
    confirmReplacement: jest.fn(),
  });
  return {
    medicationStore,
    medications,
    store,
    confirmDeletion,
    prescriptions,
    remove: createPrescriptionDeletionCoordinator(prescriptions, medications),
  };
}
const linked = { ...initialCollection().records[0], prescriptionId };

test.each([1, 3])(
  'deletion unlinks %i medications in one write, preserving every other field and unrelated record',
  async count => {
    const matching = Array.from({ length: count }, (_, index) => ({
      ...linked,
      id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
      displayName: `Synthetic ${index}`,
      ...stockFields(index === 0 ? null : index - 1),
    }));
    const other = {
      ...linked,
      id: secondId,
      prescriptionId: otherPrescriptionId,
    };
    const unlinked = {
      ...linked,
      id: otherPrescriptionId,
      prescriptionId: null,
    };
    const fixture = setup([...matching, other, unlinked]);
    await expect(fixture.remove(prescription.id)).resolves.toEqual({
      status: 'deleted',
    });
    expect(fixture.medicationStore.state().records).toEqual([
      ...matching.map(record => ({ ...record, prescriptionId: null })),
      other,
      unlinked,
    ]);
    expect(fixture.medicationStore.mutate).toHaveBeenCalledTimes(1);
    expect(fixture.medicationStore.mutate).toHaveBeenCalledWith(0, {
      type: 'unlinkPrescription',
      prescriptionId,
    });
    expect(fixture.store.remove).toHaveBeenCalledWith(prescription);
  },
);

test('cancelling prescription deletion never reads or changes medications', async () => {
  const fixture = setup([linked]);
  fixture.confirmDeletion.mockResolvedValue(false);
  await expect(fixture.remove(prescription.id)).resolves.toEqual({
    status: 'cancelled',
  });
  expect(fixture.medicationStore.read).not.toHaveBeenCalled();
  expect(fixture.store.remove).not.toHaveBeenCalled();
});

test('already-unlinked or other-prescription records need no write', async () => {
  const records = [
    { ...linked, prescriptionId: null },
    { ...linked, id: secondId, prescriptionId: otherPrescriptionId },
  ];
  const fixture = setup(records);
  await fixture.remove(prescription.id);
  expect(fixture.medicationStore.mutate).not.toHaveBeenCalled();
  expect(fixture.medicationStore.state().records).toEqual(records);
});

test.each([null, { id: firstId, stock: 0, prescriptionId: null }])(
  'deletion preserves an empty or pending legacy collection: %p',
  async pendingLegacy => {
    const fixture = setup([]);
    const state = { ...initialCollection(), records: [], pendingLegacy };
    const store = medicationFixture(state);
    const medications = createMedicationService(store, jest.fn());
    const remove = createPrescriptionDeletionCoordinator(
      fixture.prescriptions,
      medications,
    );
    await expect(remove(prescription.id)).resolves.toEqual({
      status: 'deleted',
    });
    expect(store.state()).toEqual(state);
    expect(store.mutate).not.toHaveBeenCalled();
  },
);

test.each(['read', 'write', 'stale'])(
  'unlink %s failure prevents prescription removal',
  async failure => {
    const fixture = setup([linked]);
    if (failure === 'read') {
      fixture.medicationStore.read.mockRejectedValueOnce(
        new Error('Unavailable'),
      );
    } else {
      fixture.medicationStore.mutate.mockRejectedValueOnce({
        code: failure === 'stale' ? 'stale-state' : 'write-failed',
      });
    }
    await expect(fixture.remove(prescription.id)).rejects.toMatchObject({
      code: 'unlink-unconfirmed',
    });
    expect(fixture.store.remove).not.toHaveBeenCalled();
    expect(fixture.store.cleanup).not.toHaveBeenCalled();
    expect(fixture.medicationStore.state().records).toEqual([linked]);
    await expect(fixture.remove(prescription.id)).resolves.toEqual({
      status: 'deleted',
    });
  },
);

test('lost unlink acknowledgement stops deletion; retry reads committed state without rewriting', async () => {
  const fixture = setup([linked]);
  const mutate = fixture.medicationStore.mutate.getMockImplementation()!;
  fixture.medicationStore.mutate.mockImplementationOnce(async (...args) => {
    await mutate(...args);
    throw { code: 'commit-uncertain' };
  });
  await expect(fixture.remove(prescription.id)).rejects.toMatchObject({
    code: 'unlink-unconfirmed',
  });
  expect(fixture.store.remove).not.toHaveBeenCalled();
  await expect(fixture.remove(prescription.id)).resolves.toEqual({
    status: 'deleted',
  });
  expect(fixture.medicationStore.mutate).toHaveBeenCalledTimes(1);
});

test.each(['write-failed', 'prescription_documents_commit_uncertain'])(
  'prescription %s after unlink reports safe partial completion',
  async code => {
    const fixture = setup([linked]);
    fixture.store.remove.mockRejectedValueOnce({ code });
    await expect(fixture.remove(prescription.id)).rejects.toMatchObject({
      code: 'deletion-unconfirmed',
    });
    expect(fixture.medicationStore.state().records).toEqual([
      { ...linked, prescriptionId: null },
    ]);
    expect(fixture.store.cleanup).not.toHaveBeenCalled();
  },
);

test('a restarted service reads serialized unlinked state and safely completes interrupted deletion', async () => {
  const fixture = setup([linked]);
  fixture.store.remove.mockRejectedValueOnce(new Error('Interrupted'));
  await expect(fixture.remove(prescription.id)).rejects.toMatchObject({
    code: 'deletion-unconfirmed',
  });
  // Simulated persistence boundary only; actual Keychain restart coverage is in Swift.
  const restored = validateCollection(
    JSON.parse(JSON.stringify(fixture.medicationStore.state())),
  );
  const restartedStore = medicationFixture(restored);
  const restarted = createMedicationService(restartedStore, jest.fn());
  await expect(restarted.read()).resolves.toEqual(restored);
  const retry = createPrescriptionDeletionCoordinator(
    fixture.prescriptions,
    restarted,
  );
  await expect(retry(prescription.id)).resolves.toEqual({ status: 'deleted' });
  expect(restartedStore.mutate).not.toHaveBeenCalled();
  expect(restored.records).toEqual([{ ...linked, prescriptionId: null }]);
});

test('document cleanup failure still reports deletion and acknowledged unlink correctly', async () => {
  const fixture = setup([linked]);
  fixture.store.cleanup.mockRejectedValueOnce(new Error('Cleanup'));
  await expect(fixture.remove(prescription.id)).resolves.toEqual({
    status: 'cleanup-pending',
  });
  expect(fixture.medicationStore.state().records).toEqual([
    { ...linked, prescriptionId: null },
  ]);
});
