import { NativeModules } from 'react-native';
import {
  NativePrescriptionDocuments as boundary,
  PrescriptionDocumentsBoundaryError,
} from '../src/native/NativePrescriptionDocuments';
import type {
  PrescriptionCandidateId,
  PrescriptionDocumentId,
  PrescriptionRecord,
  PrescriptionMetadata,
} from '../src/prescriptions/prescription';

const candidate =
  '00000000-0000-4000-8000-000000000001' as PrescriptionCandidateId;
const document =
  '00000000-0000-4000-8000-000000000002' as PrescriptionDocumentId;
const metadata: PrescriptionMetadata = {
  kind: 'standard',
  medicationIds: [],
  expiresOn: '2028-02-29',
};
const record = {
  ...metadata,
  id: '00000000-0000-4000-8000-000000000003',
  documentId: document,
} as PrescriptionRecord;
const originalModule = NativeModules.PrescriptionDocuments;
const methods = [
  'select',
  'read',
  'create',
  'replace',
  'remove',
  'updateMetadata',
  'migrateLegacy',
  'cleanup',
  'release',
  'open',
] as const;

function installNativeMock() {
  const native = {
    select: jest.fn().mockResolvedValue(candidate),
    read: jest.fn().mockResolvedValue({
      records: [record],
      pendingCleanup: [],
      legacyDocumentId: null,
    }),
    create: jest.fn().mockResolvedValue(record),
    replace: jest.fn().mockResolvedValue(record),
    remove: jest.fn().mockResolvedValue(undefined),
    updateMetadata: jest.fn().mockResolvedValue(record),
    migrateLegacy: jest.fn().mockResolvedValue(record),
    cleanup: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    open: jest.fn().mockResolvedValue(undefined),
  };
  NativeModules.PrescriptionDocuments = native;
  return native;
}

const operations = [
  () => boundary.select(),
  () => boundary.read(),
  () => boundary.create(candidate, metadata),
  () => boundary.replace(candidate, record),
  () => boundary.remove(record),
  () => boundary.updateMetadata(record, metadata),
  () => boundary.migrateLegacy(document, metadata),
  () => boundary.cleanup(),
  () => boundary.release(candidate),
  () => boundary.open(document),
];

afterEach(() => {
  NativeModules.PrescriptionDocuments = originalModule;
});

test('existing unnamed v2 records remain readable and viewable without a fabricated name', async () => {
  const native = installNativeMock();
  const result = await boundary.read();
  expect(result.records).toEqual([record]);
  expect(result.records[0]).not.toHaveProperty('displayName');
  await boundary.open(result.records[0].documentId);
  expect(native.open).toHaveBeenCalledWith(document);
  expect(native.updateMetadata).not.toHaveBeenCalled();
  expect(native.migrateLegacy).not.toHaveBeenCalled();
});

test('names survive creation, responses and expected-record snapshots on rename', async () => {
  const native = installNativeMock();
  const named = { ...record, displayName: 'Example label' };
  native.create.mockResolvedValue(named);
  await expect(
    boundary.create(candidate, { ...metadata, displayName: 'Example label' }),
  ).resolves.toEqual(named);
  expect(native.create).toHaveBeenCalledWith(candidate, {
    ...metadata,
    displayName: 'Example label',
  });
  const renamed = { ...named, displayName: 'Changed label' };
  native.updateMetadata.mockResolvedValue(renamed);
  await expect(
    boundary.updateMetadata(named, {
      ...metadata,
      displayName: 'Changed label',
    }),
  ).resolves.toEqual(renamed);
  expect(native.updateMetadata).toHaveBeenCalledWith(named, {
    ...metadata,
    displayName: 'Changed label',
  });
});

test.each(['', ' \n ', 42, {}, []])(
  'rejects malformed names at both boundaries: %p',
  async displayName => {
    const native = installNativeMock();
    const invalid = { ...metadata, displayName } as PrescriptionMetadata;
    await expect(boundary.create(candidate, invalid)).rejects.toThrow();
    await expect(boundary.updateMetadata(record, invalid)).rejects.toThrow();
    expect(native.create).not.toHaveBeenCalled();
    expect(native.updateMetadata).not.toHaveBeenCalled();
    native.read.mockResolvedValue({
      records: [{ ...record, displayName }],
      pendingCleanup: [],
      legacyDocumentId: null,
    });
    await expect(boundary.read()).rejects.toMatchObject({
      code: 'invalid-response',
    });
  },
);

test.each([undefined, null, {}])('unavailable module: %p', async native => {
  NativeModules.PrescriptionDocuments = native;
  for (const operation of operations) {
    await expect(operation()).rejects.toBeInstanceOf(
      PrescriptionDocumentsBoundaryError,
    );
    await expect(operation()).rejects.toMatchObject({ code: 'unavailable' });
  }
});

test.each(methods)(
  'incomplete module missing %s rejects before delegation',
  async method => {
    const native = installNativeMock();
    NativeModules.PrescriptionDocuments = { ...native, [method]: undefined };
    for (const operation of operations) {
      await expect(operation()).rejects.toMatchObject({ code: 'unavailable' });
    }
    Object.values(native).forEach(mock => expect(mock).not.toHaveBeenCalled());
  },
);

test('delegates explicit collection operations with opaque handles and full expected records', async () => {
  const native = installNativeMock();
  for (const operation of operations) {
    await operation();
  }
  expect(native.create).toHaveBeenCalledWith(candidate, metadata);
  expect(native.replace).toHaveBeenCalledWith(candidate, record);
  expect(native.remove).toHaveBeenCalledWith(record);
  expect(native.updateMetadata).toHaveBeenCalledWith(record, metadata);
  expect(native.migrateLegacy).toHaveBeenCalledWith(document, metadata);
  expect(native.open).toHaveBeenCalledWith(document);
  expect(native.release).toHaveBeenCalledWith(candidate);
});

test('selection cancellation has no document mutations', async () => {
  const native = installNativeMock();
  native.select.mockResolvedValue(null);
  await expect(boundary.select()).resolves.toBeNull();
  expect(native.create).not.toHaveBeenCalled();
  expect(native.release).not.toHaveBeenCalled();
});

const malformedIdentifiers = [
  undefined,
  '',
  ' ',
  '\t\n',
  42,
  false,
  {},
  [],
  ['id'],
  '/private/document.pdf',
  'file:///private/document.pdf',
];
test.each(malformedIdentifiers)(
  'rejects malformed selection %p',
  async value => {
    installNativeMock().select.mockResolvedValue(value);
    await expect(boundary.select()).rejects.toMatchObject({
      code: 'invalid-response',
    });
  },
);

test.each(['create', 'replace', 'updateMetadata', 'migrateLegacy'] as const)(
  'rejects malformed %s responses',
  async method => {
    const native = installNativeMock();
    const operation = () =>
      method === 'create'
        ? boundary.create(candidate, metadata)
        : method === 'replace'
        ? boundary.replace(candidate, record)
        : method === 'updateMetadata'
        ? boundary.updateMetadata(record, metadata)
        : boundary.migrateLegacy(document, metadata);
    for (const value of [
      null,
      {},
      { ...record, id: document },
      { ...record, documentId: '/private/file' },
      { ...record, expiresOn: '2027-02-29' },
      { ...record, medicationIds: ['a', 'a'] },
      { ...record, startsOn: '2027-01-01' },
    ]) {
      native[method].mockResolvedValue(value);
      await expect(operation()).rejects.toMatchObject({
        code: 'invalid-response',
      });
    }
  },
);

test.each([
  undefined,
  null,
  'state',
  [],
  {},
  { records: [], pendingCleanup: [] },
  { records: [record, record], pendingCleanup: [], legacyDocumentId: null },
  { records: [record], pendingCleanup: [document], legacyDocumentId: null },
  { records: [record], pendingCleanup: [], legacyDocumentId: document },
  { records: [], pendingCleanup: [document, document], legacyDocumentId: null },
  { records: [], pendingCleanup: [], legacyDocumentId: '/private/file' },
])('rejects malformed/inconsistent state %p', async value => {
  installNativeMock().read.mockResolvedValue(value);
  await expect(boundary.read()).rejects.toMatchObject({
    code: 'invalid-response',
  });
});

test('accepts multiple records, pending deletion of the last record, and explicit legacy state', async () => {
  const native = installNativeMock();
  const other = {
    ...record,
    id: '00000000-0000-4000-8000-000000000004',
    documentId: '00000000-0000-4000-8000-000000000005',
  };
  native.read.mockResolvedValue({
    records: [record, other],
    pendingCleanup: [],
    legacyDocumentId: null,
  });
  await expect(boundary.read()).resolves.toEqual({
    records: [record, other],
    pendingCleanup: [],
  });
  native.read.mockResolvedValue({
    records: [],
    pendingCleanup: [document],
    legacyDocumentId: null,
  });
  await expect(boundary.read()).resolves.toEqual({
    records: [],
    pendingCleanup: [document],
  });
  native.read.mockResolvedValue({
    records: [],
    pendingCleanup: [],
    legacyDocumentId: document,
  });
  await expect(boundary.read()).resolves.toEqual({
    records: [],
    pendingCleanup: [],
    legacyDocumentId: document,
  });
  await boundary.open(document);
  expect(native.open).toHaveBeenCalledWith(document);
});

test('reconstructs only public fields in responses and mutation arguments', async () => {
  const native = installNativeMock();
  native.read.mockResolvedValue({
    records: [{ ...record, extra: 'ignored' }],
    pendingCleanup: [],
    legacyDocumentId: null,
    extra: 'ignored',
  });
  await expect(boundary.read()).resolves.toEqual({
    records: [record],
    pendingCleanup: [],
  });
  await boundary.create(candidate, {
    ...metadata,
    extra: 'ignored',
  } as PrescriptionMetadata);
  await boundary.replace(candidate, {
    ...record,
    extra: 'ignored',
  } as PrescriptionRecord);
  expect(native.create).toHaveBeenCalledWith(candidate, metadata);
  expect(native.replace).toHaveBeenCalledWith(candidate, record);
});

test('rejects invalid input metadata before native mutation, including migration', async () => {
  const native = installNativeMock();
  for (const input of [
    { ...metadata, expiresOn: '' },
    { ...metadata, issuedOn: '2029-01-01' },
  ]) {
    await expect(boundary.create(candidate, input)).rejects.toThrow();
    await expect(boundary.updateMetadata(record, input)).rejects.toThrow();
    await expect(boundary.migrateLegacy(document, input)).rejects.toThrow();
  }
  expect(native.create).not.toHaveBeenCalled();
  expect(native.updateMetadata).not.toHaveBeenCalled();
  expect(native.migrateLegacy).not.toHaveBeenCalled();
});

test('looks up the module lazily and never caches state', async () => {
  const first = installNativeMock();
  await boundary.read();
  const second = installNativeMock();
  second.read.mockResolvedValue({
    records: [],
    pendingCleanup: [],
    legacyDocumentId: null,
  });
  await expect(boundary.read()).resolves.toEqual({
    records: [],
    pendingCleanup: [],
  });
  expect(first.read).toHaveBeenCalledTimes(1);
});

test.each(['cleanup', 'release', 'open', 'remove'] as const)(
  'validates void %s results',
  async method => {
    const native = installNativeMock();
    const operation = () =>
      method === 'cleanup'
        ? boundary.cleanup()
        : method === 'release'
        ? boundary.release(candidate)
        : method === 'remove'
        ? boundary.remove(record)
        : boundary.open(document);
    for (const value of [null, undefined]) {
      native[method].mockResolvedValue(value);
      await expect(operation()).resolves.toBeUndefined();
    }
    for (const value of [false, 0, '', {}, []]) {
      native[method].mockResolvedValue(value);
      await expect(operation()).rejects.toMatchObject({
        code: 'invalid-response',
      });
    }
  },
);

test.each([
  'prescription_documents_authentication_cancelled',
  'prescription_documents_authentication_failed',
])('native authentication result propagates unchanged: %s', async code => {
  const native = installNativeMock();
  const failure = { code };
  native.open.mockRejectedValue(failure);
  await expect(boundary.open(document)).rejects.toBe(failure);
  expect(native.select).not.toHaveBeenCalled();
});

test('propagates genuine operation failures unchanged', async () => {
  const native = installNativeMock();
  const failure = new Error('Native operation failed');
  Object.values(native).forEach(method => method.mockRejectedValue(failure));
  for (const operation of operations) {
    await expect(operation()).rejects.toBe(failure);
  }
});
