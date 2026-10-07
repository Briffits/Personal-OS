import {
  createPrescriptionService,
  type PrescriptionWalletState,
} from '../src/prescriptions/prescriptionService';
import type {
  PrescriptionDocumentId,
  PrescriptionMetadata,
  PrescriptionRecord,
} from '../src/prescriptions/prescription';

const document = 'legacy-document' as PrescriptionDocumentId;
const metadata: PrescriptionMetadata = {
  kind: 'standard',
  medicationIds: [],
  expiresOn: '2028-02-29',
};
const migrated = {
  ...metadata,
  id: 'record',
  documentId: document,
} as PrescriptionRecord;

function setup() {
  let state: PrescriptionWalletState = {
    records: [],
    pendingCleanup: [],
    legacyDocumentId: document,
  };
  const store = {
    read: jest.fn(async () => state),
    create: jest.fn(),
    replace: jest.fn(),
    remove: jest.fn(),
    updateMetadata: jest.fn(),
    cleanup: jest.fn(),
    migrateLegacy: jest.fn(async () => {
      state = { records: [migrated], pendingCleanup: [] };
      return migrated;
    }),
  };
  const documents = { select: jest.fn(), release: jest.fn(), open: jest.fn() };
  const confirmReplacement = jest.fn();
  const confirmDeletion = jest.fn();
  const service = createPrescriptionService({
    store,
    documents,
    confirmReplacement,
    confirmDeletion,
  });
  return { service, store, documents, confirmReplacement, confirmDeletion };
}

test('legacy reads expose only the explicit document reference; view uses the same native viewer', async () => {
  const f = setup();
  await expect(f.service.getState()).resolves.toEqual({
    records: [],
    pendingCleanup: [],
    legacyDocumentId: document,
  });
  await f.service.viewLegacyPrescription();
  expect(f.documents.open).toHaveBeenCalledWith(document);
  expect(f.store.migrateLegacy).not.toHaveBeenCalled();
  expect(f.documents.select).not.toHaveBeenCalled();
});

test('normal mutations are blocked until legacy metadata is complete', async () => {
  const f = setup();
  for (const operation of [
    () => f.service.addPrescription(metadata),
    () => f.service.replaceDocument(migrated.id),
    () => f.service.updatePrescription(migrated.id, metadata),
    () => f.service.deletePrescription(migrated.id),
  ]) {
    await expect(operation()).rejects.toMatchObject({
      code: 'migration-required',
    });
  }
  expect(f.documents.select).not.toHaveBeenCalled();
  expect(f.store.remove).not.toHaveBeenCalled();
});

test('missing/invalid migration metadata is rejected before invoking the native transaction', async () => {
  const f = setup();
  for (const input of [
    { ...metadata, expiresOn: '' },
    { ...metadata, kind: 'unknown' },
  ]) {
    await expect(
      f.service.completeLegacyMigration(
        document,
        input as PrescriptionMetadata,
      ),
    ).rejects.toThrow();
  }
  expect(f.store.migrateLegacy).not.toHaveBeenCalled();
  await f.service.viewLegacyPrescription();
  expect(f.documents.open).toHaveBeenCalledWith(document);
});

test('migration uses explicit metadata without selecting, copying or cleaning a document', async () => {
  const f = setup();
  await expect(
    f.service.completeLegacyMigration(document, metadata),
  ).resolves.toEqual(migrated);
  expect(f.store.migrateLegacy).toHaveBeenCalledWith(document, metadata);
  for (const method of [
    f.documents.select,
    f.documents.release,
    f.store.create,
    f.store.replace,
    f.store.cleanup,
  ]) {
    expect(method).not.toHaveBeenCalled();
  }
  await expect(f.service.getState()).resolves.toEqual({
    records: [migrated],
    pendingCleanup: [],
  });
  await expect(f.service.viewLegacyPrescription()).rejects.toMatchObject({
    code: 'not-found',
  });
  await f.service.viewPrescription(migrated.id);
  expect(f.documents.open).toHaveBeenCalledWith(document);
});

test('failed migration propagates and leaves the legacy viewing workflow available', async () => {
  const f = setup();
  f.store.migrateLegacy.mockRejectedValueOnce(new Error('Commit failed'));
  await expect(
    f.service.completeLegacyMigration(document, metadata),
  ).rejects.toThrow('Commit failed');
  await f.service.viewLegacyPrescription();
  expect(f.documents.open).toHaveBeenCalledWith(document);
  await expect(f.service.getState()).resolves.toHaveProperty(
    'legacyDocumentId',
    document,
  );
});

test('repeated completion delegates to native durable idempotency and propagates a metadata conflict', async () => {
  const f = setup();
  await f.service.completeLegacyMigration(document, metadata);
  await f.service.completeLegacyMigration(document, metadata);
  expect(f.store.migrateLegacy).toHaveBeenCalledTimes(2);
  const conflict = { code: 'prescription_documents_stale_record' };
  f.store.migrateLegacy.mockRejectedValueOnce(conflict);
  await expect(
    f.service.completeLegacyMigration(document, {
      ...metadata,
      expiresOn: '2029-01-01',
    }),
  ).rejects.toBe(conflict);
  await expect(f.service.getState()).resolves.toEqual({
    records: [migrated],
    pendingCleanup: [],
  });
});
