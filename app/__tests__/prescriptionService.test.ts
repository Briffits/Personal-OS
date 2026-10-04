import {
  isPrescriptionDate,
  isPrescriptionExpired,
  validatePrescriptionMetadata,
  type PrescriptionCandidateId,
  type PrescriptionDocumentId,
  type PrescriptionMetadata,
  type PrescriptionRecord,
  type PrescriptionRecordId,
} from '../src/prescriptions/prescription';
import {
  createPrescriptionService,
  type PrescriptionWalletStore,
  type PrescriptionWalletState,
} from '../src/prescriptions/prescriptionService';

const metadata: PrescriptionMetadata = {
  kind: 'standard',
  medicationIds: [],
  expiresOn: '2028-02-29',
};
const candidate = 'candidate' as PrescriptionCandidateId;
const id = 'record-1' as PrescriptionRecordId;
const old: PrescriptionRecord = {
  ...metadata,
  id,
  documentId: 'document-1' as PrescriptionDocumentId,
};

function expectNoDocumentMutation(fixture: ReturnType<typeof setup>) {
  for (const operation of [
    ...Object.values(fixture.documents),
    fixture.store.create,
    fixture.store.replace,
    fixture.store.remove,
    fixture.store.cleanup,
    fixture.confirmReplacement,
    fixture.confirmDeletion,
  ]) {
    expect(operation).not.toHaveBeenCalled();
  }
}

test('metadata update preserves both IDs, other records and documents, and removes omitted optional fields', async () => {
  const existing = {
    ...old,
    kind: 'temporary' as const,
    issuedOn: '2027-01-01',
    startsOn: '2027-02-01',
  };
  const other = {
    ...old,
    id: 'other' as PrescriptionRecordId,
    documentId: 'other-document' as PrescriptionDocumentId,
  };
  const fixture = setup([existing, other]);
  const input = {
    ...metadata,
    medicationIds: ['a', 'b'],
    expiresOn: '2029-01-01',
    id: 'injected',
    documentId: 'injected',
  };
  const updated = await fixture.service.updatePrescription(id, input);
  expect(updated).toEqual({
    ...metadata,
    medicationIds: ['a', 'b'],
    expiresOn: '2029-01-01',
    id,
    documentId: old.documentId,
  });
  input.medicationIds.push('c');
  expect((await fixture.recreate().getState()).records).toEqual([
    updated,
    other,
  ]);
  expect(updated.medicationIds).toEqual(['a', 'b']);
  expect(fixture.copies).toEqual(
    new Set([old.documentId, other.documentId]),
  );
  expectNoDocumentMutation(fixture);
});

test.each([
  { expiresOn: undefined },
  { expiresOn: '2027-02-29' },
  { kind: 'invalid' },
  { medicationIds: [''] },
  { medicationIds: ['a', 'a'] },
  { medicationIds: null },
  { issuedOn: '2029-01-01' },
  { startsOn: '2028-01-01' },
  { kind: 'temporary', startsOn: '2028-03-01' },
])(
  'invalid update metadata %p fails before reading or mutating',
  async fields => {
    const fixture = setup();
    await expect(
      fixture.service.updatePrescription(id, {
        ...metadata,
        ...fields,
      } as PrescriptionMetadata),
    ).rejects.toThrow('Invalid prescription metadata');
    expect(fixture.store.read).not.toHaveBeenCalled();
    expect(fixture.store.updateMetadata).not.toHaveBeenCalled();
    expectNoDocumentMutation(fixture);
    expect((await fixture.service.getState()).records).toEqual([old]);
  },
);

test('unknown metadata update ID fails before mutation', async () => {
  const fixture = setup([]);
  await expect(
    fixture.service.updatePrescription(id, metadata),
  ).rejects.toMatchObject({ code: 'not-found' });
  expect(fixture.store.updateMetadata).not.toHaveBeenCalled();
  expectNoDocumentMutation(fixture);
});

test('metadata update rejects pending cleanup without attempting cleanup', async () => {
  const fixture = setup();
  await fixture.store.replace(candidate, old);
  jest.clearAllMocks();
  const before = await fixture.service.getState();
  await expect(
    fixture.service.updatePrescription(id, metadata),
  ).rejects.toMatchObject({ code: 'cleanup-pending' });
  expect(fixture.store.updateMetadata).not.toHaveBeenCalled();
  expect(await fixture.service.getState()).toEqual(before);
  expectNoDocumentMutation(fixture);
});

test.each([
  'kind',
  'medicationIds',
  'expiresOn',
  'issuedOn',
  'startsOn',
  'documentId',
  'deleted',
  'cleanup',
] as const)(
  'metadata transaction rejects concurrent %s changes after reading a snapshot',
  async field => {
    const existing: PrescriptionRecord = {
      ...old,
      kind: 'temporary',
      startsOn: '2027-01-01',
      issuedOn: '2027-01-01',
    };
    const fixture = setup([existing]);
    const read = fixture.store.read.getMockImplementation()!;
    let concurrentState!: PrescriptionWalletState;
    let concurrentCopies!: Set<PrescriptionDocumentId>;
    fixture.store.read.mockImplementationOnce(async () => {
      const snapshot = await read();
      if (
        field === 'deleted' ||
        field === 'cleanup' ||
        field === 'documentId'
      ) {
        if (field === 'deleted') {
          await fixture.store.remove(existing);
        } else {
          await fixture.store.replace(candidate, existing);
        }
        if (field !== 'cleanup') {
          await fixture.store.cleanup();
        }
      } else {
        const changes = {
          kind: { kind: 'standard' as const, startsOn: undefined },
          medicationIds: { medicationIds: ['changed'] },
          expiresOn: { expiresOn: '2029-01-01' },
          issuedOn: { issuedOn: '2027-02-01' },
          startsOn: { startsOn: '2027-02-01' },
        };
        await fixture.store.updateMetadata(existing, {
          ...existing,
          ...changes[field],
        });
      }
      concurrentState = await read();
      concurrentCopies = new Set(fixture.copies);
      jest.clearAllMocks();
      return snapshot;
    });
    await expect(
      fixture.service.updatePrescription(id, metadata),
    ).rejects.toThrow('Stale or pending');
    expect(fixture.store.updateMetadata).toHaveBeenCalledTimes(1);
    const current = await fixture.service.getState();
    expect(current).toEqual(concurrentState);
    expect(fixture.copies).toEqual(concurrentCopies);
    expect(current).not.toEqual({ records: [existing], pendingCleanup: [] });
    expectNoDocumentMutation(fixture);
  },
);

test('metadata transaction accepts a complete value-equal snapshot', async () => {
  const fixture = setup();
  await expect(
    fixture.store.updateMetadata(
      { ...old, medicationIds: [...old.medicationIds] },
      { ...metadata, kind: 'temporary' },
    ),
  ).resolves.toEqual({ ...old, kind: 'temporary' });
});

function setup(records: readonly PrescriptionRecord[] = [old]) {
  let state: PrescriptionWalletState = { records, pendingCleanup: [] };
  let sequence = 1;
  const copies = new Set(records.map(record => record.documentId));
  function check(expected?: PrescriptionRecord) {
    if (
      state.pendingCleanup.length ||
      (expected &&
        !sameRecord(
          state.records.find(record => record.id === expected.id),
          expected,
        ))
    ) {
      throw new Error('Stale or pending');
    }
  }
  function sameRecord(
    actual: PrescriptionRecord | undefined,
    expected: PrescriptionRecord,
  ) {
    return (
      actual !== undefined &&
      actual.id === expected.id &&
      actual.documentId === expected.documentId &&
      actual.kind === expected.kind &&
      actual.expiresOn === expected.expiresOn &&
      actual.issuedOn === expected.issuedOn &&
      actual.startsOn === expected.startsOn &&
      actual.medicationIds.length === expected.medicationIds.length &&
      actual.medicationIds.every(
        (value, index) => value === expected.medicationIds[index],
      )
    );
  }
  const store = {
    read: jest.fn(async () => state),
    create: jest.fn(
      async (
        _candidate: PrescriptionCandidateId,
        input: PrescriptionMetadata,
      ) => {
        check();
        const next = ++sequence;
        const record: PrescriptionRecord = {
          ...input,
          id: `record-${next}` as PrescriptionRecordId,
          documentId: `document-${next}` as PrescriptionDocumentId,
        };
        copies.add(record.documentId);
        state = { ...state, records: [...state.records, record] };
        return record;
      },
    ),
    replace: jest.fn(
      async (
        _candidate: PrescriptionCandidateId,
        expected: PrescriptionRecord,
      ) => {
        check(expected);
        const record = {
          ...expected,
          documentId: `document-${++sequence}` as PrescriptionDocumentId,
        };
        copies.add(record.documentId);
        state = {
          records: state.records.map(item =>
            item.id === expected.id ? record : item,
          ),
          pendingCleanup: [expected.documentId],
        };
        return record;
      },
    ),
    updateMetadata: jest.fn(
      async (expected: PrescriptionRecord, input: PrescriptionMetadata) => {
        check(expected);
        const record = {
          ...validatePrescriptionMetadata(input),
          id: expected.id,
          documentId: expected.documentId,
        };
        state = {
          ...state,
          records: state.records.map(item =>
            item.id === expected.id ? record : item,
          ),
        };
        return record;
      },
    ),
    remove: jest.fn(async (expected: PrescriptionRecord) => {
      check(expected);
      state = {
        records: state.records.filter(record => record.id !== expected.id),
        pendingCleanup: [expected.documentId],
      };
    }),
    cleanup: jest.fn(async () => {
      state.pendingCleanup.forEach(document => copies.delete(document));
      state = { ...state, pendingCleanup: [] };
    }),
  } satisfies PrescriptionWalletStore;
  const documents = {
    select: jest.fn(
      async (): Promise<PrescriptionCandidateId | null> => candidate,
    ),
    release: jest.fn(async (_candidate: PrescriptionCandidateId) => {}),
    open: jest.fn(async (document: PrescriptionDocumentId) => {
      if (!state.records.some(record => record.documentId === document)) {
        throw new Error('Stale document');
      }
    }),
  };
  const confirmReplacement = jest.fn(
    async (_record: PrescriptionRecord) => true,
  );
  const confirmDeletion = jest.fn(async (_record: PrescriptionRecord) => true);
  const recreate = () =>
    createPrescriptionService({
      store,
      documents,
      confirmReplacement,
      confirmDeletion,
    });
  return {
    service: recreate(),
    recreate,
    store,
    documents,
    confirmReplacement,
    confirmDeletion,
    copies,
  };
}

test.each(['2024-02-29', '2000-02-29', '0001-01-01', '2026-12-31'])(
  'accepts real date %s',
  value => {
    expect(isPrescriptionDate(value)).toBe(true);
  },
);
test.each([
  '1900-02-29',
  '2026-02-29',
  '2026-04-31',
  '0000-01-01',
  '2026-00-01',
  '2026-13-01',
  '2026-01-00',
  '2026-1-01',
  '2026-01-01T00:00:00Z',
  '',
  undefined,
  null,
  42,
])('rejects invalid date %p', value => {
  expect(isPrescriptionDate(value)).toBe(false);
});
test.each([
  { expiresOn: undefined },
  { expiresOn: '2027-02-29' },
  { kind: 'inactive' },
  { medicationIds: [''] },
  { medicationIds: [42] },
  { medicationIds: ['a', 'a'] },
  { medicationIds: null },
  { issuedOn: '2028-03-01' },
  { issuedOn: 'invalid' },
  { startsOn: '2028-02-28' },
  { kind: 'temporary', startsOn: '2028-03-01' },
  { kind: 'temporary', startsOn: '2028-02-30' },
])('invalid metadata %p fails before native selection', async fields => {
  const fixture = setup();
  await expect(
    fixture.service.addPrescription({
      ...metadata,
      ...fields,
    } as PrescriptionMetadata),
  ).rejects.toThrow('Invalid prescription metadata');
  expect(fixture.documents.select).not.toHaveBeenCalled();
});

test('temporary dates may equal expiry, start is optional, and fields are copied explicitly', () => {
  const input = {
    ...metadata,
    kind: 'temporary' as const,
    startsOn: metadata.expiresOn,
    issuedOn: metadata.expiresOn,
    medicationIds: ['a'],
    status: 'inactive',
    path: '/private/example',
  };
  const validated = validatePrescriptionMetadata(input);
  expect(validated).toEqual({
    kind: 'temporary',
    startsOn: metadata.expiresOn,
    issuedOn: metadata.expiresOn,
    expiresOn: metadata.expiresOn,
    medicationIds: ['a'],
  });
  input.medicationIds.push('b');
  expect(validated.medicationIds).toEqual(['a']);
  expect(
    validatePrescriptionMetadata({ ...metadata, kind: 'temporary' }).startsOn,
  ).toBeUndefined();
});

test('expiry is derived after expiry day without mutating or deleting records', async () => {
  expect(isPrescriptionExpired(metadata, '2028-02-28')).toBe(false);
  expect(isPrescriptionExpired(metadata, '2028-02-29')).toBe(false);
  expect(isPrescriptionExpired(metadata, '2028-03-01')).toBe(true);
  expect(() => isPrescriptionExpired(metadata, 'invalid')).toThrow();
  const fixture = setup();
  expect((await fixture.service.getState()).records).toEqual([old]);
  expect(fixture.store.remove).not.toHaveBeenCalled();
});

test('retains multiple prescriptions with zero, one or many shared medication links', async () => {
  const fixture = setup();
  await fixture.service.addPrescription({ ...metadata, medicationIds: ['a'] });
  await fixture.service.addPrescription({
    ...metadata,
    kind: 'temporary',
    medicationIds: ['a', 'b'],
  });
  const { records } = await fixture.service.getState();
  expect(records.map(record => record.medicationIds)).toEqual([
    [],
    ['a'],
    ['a', 'b'],
  ]);
  expect(new Set(records.map(record => record.id)).size).toBe(3);
  expect(fixture.confirmReplacement).not.toHaveBeenCalled();
  expect(fixture.documents.release).toHaveBeenCalledTimes(2);
});

test('replacement retains record ID and metadata, changes only document, and preserves other records', async () => {
  const other = {
    ...old,
    id: 'other' as PrescriptionRecordId,
    documentId: 'other-document' as PrescriptionDocumentId,
  };
  const fixture = setup([old, other]);
  expect(await fixture.service.replaceDocument(id)).toEqual({
    status: 'saved',
    record: { ...old, documentId: 'document-2' },
  });
  expect(fixture.confirmReplacement).toHaveBeenCalledWith(old);
  expect((await fixture.service.getState()).records).toEqual([
    { ...old, documentId: 'document-2' },
    other,
  ]);
  expect(fixture.copies.has(old.documentId)).toBe(false);
  await fixture.service.viewPrescription(id);
  expect(fixture.documents.open).toHaveBeenCalledWith('document-2');
  await expect(fixture.documents.open(old.documentId)).rejects.toThrow(
    'Stale document',
  );
});

test.each(['add', 'replace'] as const)(
  'selection cancellation/error during %s has no mutation',
  async action => {
    const fixture = setup();
    const run = () =>
      action === 'add'
        ? fixture.service.addPrescription(metadata)
        : fixture.service.replaceDocument(id);
    fixture.documents.select.mockResolvedValueOnce(null);
    expect(await run()).toEqual({ status: 'cancelled', reason: 'selection' });
    fixture.documents.select.mockRejectedValueOnce(new Error('Unavailable'));
    expect(await run()).toMatchObject({ status: 'failed', stage: 'selection' });
    expect(fixture.store.create).not.toHaveBeenCalled();
    expect(fixture.store.replace).not.toHaveBeenCalled();
    expect(fixture.documents.release).not.toHaveBeenCalled();
  },
);

test('declined or failed replacement confirmation releases candidate and preserves record', async () => {
  const fixture = setup();
  fixture.confirmReplacement.mockResolvedValueOnce(false);
  expect(await fixture.service.replaceDocument(id)).toEqual({
    status: 'cancelled',
    reason: 'confirmation',
  });
  fixture.confirmReplacement.mockRejectedValueOnce(new Error('Confirmation'));
  expect(await fixture.service.replaceDocument(id)).toMatchObject({
    status: 'failed',
    stage: 'confirmation',
  });
  expect(fixture.documents.release).toHaveBeenCalledTimes(2);
  expect(fixture.store.replace).not.toHaveBeenCalled();
  expect((await fixture.service.getState()).records).toEqual([old]);
});

test.each(['create', 'replace'] as const)(
  'failed %s preserves state and releases candidate',
  async method => {
    const fixture = setup();
    fixture.store[method].mockRejectedValueOnce(new Error('Commit'));
    const result =
      method === 'create'
        ? await fixture.service.addPrescription(metadata)
        : await fixture.service.replaceDocument(id);
    expect(result).toMatchObject({ status: 'failed', stage: 'commit' });
    expect(fixture.documents.release).toHaveBeenCalledWith(candidate);
    expect((await fixture.service.getState()).records).toEqual([old]);
  },
);

test('candidate release failure preserves outcome and permits retry', async () => {
  const fixture = setup();
  fixture.documents.release.mockRejectedValueOnce(new Error('Release'));
  expect(await fixture.service.replaceDocument(id)).toMatchObject({
    status: 'candidate-release-failed',
    candidate,
    outcome: { status: 'saved', record: { id } },
  });
  await fixture.service.retryCandidateRelease(candidate);
  expect(fixture.documents.release).toHaveBeenCalledTimes(2);
});

test('cleanup survives service recreation, blocks mutations, allows viewing and retry', async () => {
  const fixture = setup();
  fixture.store.cleanup.mockRejectedValueOnce(new Error('Cleanup'));
  expect(await fixture.service.replaceDocument(id)).toMatchObject({
    status: 'cleanup-pending',
  });
  const service = fixture.recreate();
  expect((await service.getState()).pendingCleanup).toEqual([old.documentId]);
  await expect(service.addPrescription(metadata)).rejects.toMatchObject({
    code: 'cleanup-pending',
  });
  await expect(service.replaceDocument(id)).rejects.toMatchObject({
    code: 'cleanup-pending',
  });
  await expect(service.deletePrescription(id)).rejects.toMatchObject({
    code: 'cleanup-pending',
  });
  await service.viewPrescription(id);
  await expect(service.retryCleanup()).resolves.toBe(true);
  await expect(service.retryCleanup()).resolves.toBe(true);
  expect((await service.getState()).pendingCleanup).toEqual([]);
});

test('deletion requires confirmation and removes only selected record', async () => {
  const other = {
    ...old,
    id: 'other' as PrescriptionRecordId,
    documentId: 'other-document' as PrescriptionDocumentId,
  };
  const fixture = setup([old, other]);
  fixture.confirmDeletion.mockResolvedValueOnce(false);
  expect(await fixture.service.deletePrescription(id)).toEqual({
    status: 'cancelled',
  });
  expect(fixture.store.remove).not.toHaveBeenCalled();
  fixture.confirmDeletion.mockRejectedValueOnce(new Error('Confirmation'));
  await expect(fixture.service.deletePrescription(id)).rejects.toThrow(
    'Confirmation',
  );
  fixture.store.remove.mockRejectedValueOnce(new Error('Removal'));
  await expect(fixture.service.deletePrescription(id)).rejects.toThrow(
    'Removal',
  );
  fixture.store.cleanup.mockRejectedValueOnce(new Error('Cleanup'));
  expect(await fixture.service.deletePrescription(id)).toEqual({
    status: 'cleanup-pending',
  });
  expect((await fixture.recreate().getState()).records).toEqual([other]);
  await fixture.service.retryCleanup();
});

test('unknown record IDs are rejected before selection, confirmation or viewing', async () => {
  const fixture = setup([]);
  for (const operation of [
    fixture.service.replaceDocument,
    fixture.service.deletePrescription,
    fixture.service.viewPrescription,
  ]) {
    await expect(operation(id)).rejects.toMatchObject({ code: 'not-found' });
  }
  expect(fixture.documents.select).not.toHaveBeenCalled();
  expect(fixture.documents.open).not.toHaveBeenCalled();
  expect(fixture.confirmDeletion).not.toHaveBeenCalled();
});

test('adapter rejects a record changed while confirmation is open', async () => {
  const fixture = setup();
  fixture.confirmReplacement.mockImplementationOnce(async expected => {
    await fixture.store.replace(candidate, expected);
    await fixture.store.cleanup();
    return true;
  });
  expect(await fixture.service.replaceDocument(id)).toMatchObject({
    status: 'failed',
    stage: 'commit',
  });
  expect(fixture.documents.release).toHaveBeenCalledWith(candidate);
});

test('overlapping operations are rejected and lock is released after viewing fails', async () => {
  const fixture = setup();
  let finish!: (value: PrescriptionCandidateId | null) => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => {
    entered = resolve;
  });
  fixture.documents.select.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
        entered();
      }),
  );
  const importing = fixture.service.addPrescription(metadata);
  await waiting;
  await expect(fixture.service.getState()).rejects.toMatchObject({
    code: 'busy',
  });
  await expect(fixture.service.deletePrescription(id)).rejects.toMatchObject({
    code: 'busy',
  });
  finish(null);
  await importing;
  fixture.documents.open.mockRejectedValueOnce(new Error('Unavailable'));
  await expect(fixture.service.viewPrescription(id)).rejects.toThrow(
    'Unavailable',
  );
  await expect(fixture.service.viewPrescription(id)).resolves.toBeUndefined();
});

test('deleting the last retained prescription leaves an empty wallet and rejects stale IDs', async () => {
  const fixture = setup();
  expect(await fixture.service.deletePrescription(id)).toEqual({
    status: 'deleted',
  });
  expect(await fixture.service.getState()).toEqual({
    records: [],
    pendingCleanup: [],
  });
  expect(fixture.copies.size).toBe(0);
  await expect(fixture.service.viewPrescription(id)).rejects.toMatchObject({
    code: 'not-found',
  });
  await expect(fixture.documents.open(old.documentId)).rejects.toThrow(
    'Stale document',
  );
  expect(await fixture.service.addPrescription(metadata)).toMatchObject({
    status: 'saved',
  });
});

test.each(['cancelled', 'failed', 'cleanup-pending'] as const)(
  'release failure retains the %s outcome',
  async status => {
    const fixture = setup();
    if (status === 'cancelled') {
      fixture.confirmReplacement.mockResolvedValueOnce(false);
    } else if (status === 'failed') {
      fixture.store.replace.mockRejectedValueOnce(new Error('Commit'));
    } else {
      fixture.store.cleanup.mockRejectedValueOnce(new Error('Cleanup'));
    }
    fixture.documents.release.mockRejectedValueOnce(new Error('Release'));
    expect(await fixture.service.replaceDocument(id)).toMatchObject({
      status: 'candidate-release-failed',
      outcome: { status },
    });
    fixture.documents.release.mockRejectedValueOnce(new Error('Retry'));
    await expect(
      fixture.service.retryCandidateRelease(candidate),
    ).rejects.toThrow('Retry');
    await fixture.service.retryCandidateRelease(candidate);
  },
);

test('read failures propagate without selection and release the operation lock', async () => {
  const fixture = setup();
  fixture.store.read.mockRejectedValueOnce(new Error('Read'));
  await expect(fixture.service.addPrescription(metadata)).rejects.toThrow(
    'Read',
  );
  expect(fixture.documents.select).not.toHaveBeenCalled();
  await expect(fixture.service.getState()).resolves.toEqual({
    records: [old],
    pendingCleanup: [],
  });
});
