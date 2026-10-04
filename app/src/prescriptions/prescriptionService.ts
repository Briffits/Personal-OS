import {
  validatePrescriptionMetadata,
  type PrescriptionCandidateId,
  type PrescriptionDocumentId,
  type PrescriptionMetadata,
  type PrescriptionRecord,
  type PrescriptionRecordId,
} from './prescription';

export interface PrescriptionWalletState {
  readonly records: readonly PrescriptionRecord[];
  readonly pendingCleanup: readonly PrescriptionDocumentId[];
}

/** Intended durable boundary; the existing single-current native API cannot implement it.
 * Mutations must be atomic, reject while cleanup is pending and preserve other records.
 * create allocates a fresh stable record ID and document ID. replace retains metadata
 * and record ID, allocates a fresh document ID and journals the superseded document.
 * replace/updateMetadata/remove compare the entire expected record within the
 * transaction and reject stale snapshots (value equality, not object identity).
 * updateMetadata changes only validated metadata, preserving both IDs; it performs
 * no document/candidate operations and does not create or process cleanup entries.
 * remove journals its document alongside removal. Failed mutations leave state intact
 * and no partial copy. Candidates are never consumed by mutations.
 * cleanup is idempotent, removes only journalled unreferenced app-owned documents,
 * durably clears completed entries and preserves pending entries on failure.
 * Adapters own interrupted-commit recovery, orphan candidate/copy cleanup, file
 * protection and backup exclusion. No method exposes filesystem paths.
 */
export interface PrescriptionWalletStore {
  read(): Promise<PrescriptionWalletState>;
  create(
    candidate: PrescriptionCandidateId,
    metadata: PrescriptionMetadata,
  ): Promise<PrescriptionRecord>;
  replace(
    candidate: PrescriptionCandidateId,
    expected: PrescriptionRecord,
  ): Promise<PrescriptionRecord>;
  remove(expected: PrescriptionRecord): Promise<void>;
  updateMetadata(
    expected: PrescriptionRecord,
    metadata: PrescriptionMetadata,
  ): Promise<PrescriptionRecord>;
  cleanup(): Promise<void>;
}

export interface PrescriptionDocuments {
  select(): Promise<PrescriptionCandidateId | null>;
  // Release only candidate resources; rejected/cancelled selection cleans its own partial resources.
  release(candidate: PrescriptionCandidateId): Promise<void>;
  // Reject unknown, superseded or deleted document IDs, including during pending cleanup.
  open(document: PrescriptionDocumentId): Promise<void>;
}

type Dependencies = {
  store: PrescriptionWalletStore;
  documents: PrescriptionDocuments;
  confirmReplacement(record: PrescriptionRecord): Promise<boolean>;
  confirmDeletion(record: PrescriptionRecord): Promise<boolean>;
};

export class PrescriptionWalletOperationError extends Error {
  constructor(public readonly code: 'busy' | 'cleanup-pending' | 'not-found') {
    super(code);
    this.name = 'PrescriptionWalletOperationError';
  }
}

type ImportOutcome =
  | { status: 'saved' | 'cleanup-pending'; record: PrescriptionRecord }
  | { status: 'cancelled'; reason: 'selection' | 'confirmation' }
  | {
      status: 'failed';
      stage: 'selection' | 'confirmation' | 'commit';
      error: unknown;
    };

export type PrescriptionImportResult =
  | ImportOutcome
  | {
      status: 'candidate-release-failed';
      candidate: PrescriptionCandidateId;
      outcome: ImportOutcome;
      error: unknown;
    };

// One instance per store. The adapter must enforce durable transaction integrity too.
export function createPrescriptionService({
  store,
  documents,
  confirmReplacement,
  confirmDeletion,
}: Dependencies) {
  let busy = false;
  async function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (busy) {
      throw new PrescriptionWalletOperationError('busy');
    }
    busy = true;
    try {
      return await operation();
    } finally {
      busy = false;
    }
  }
  function find(state: PrescriptionWalletState, id: PrescriptionRecordId) {
    const record = state.records.find(item => item.id === id);
    if (!record) {
      throw new PrescriptionWalletOperationError('not-found');
    }
    return record;
  }
  async function writableState() {
    const state = await store.read();
    if (state.pendingCleanup.length > 0) {
      throw new PrescriptionWalletOperationError('cleanup-pending');
    }
    return state;
  }
  async function cleanup(): Promise<boolean> {
    try {
      await store.cleanup();
      return true;
    } catch {
      // A durable mutation succeeded; cleanup failure must not imply rollback.
      return false;
    }
  }
  async function importDocument(
    metadata?: PrescriptionMetadata,
    id?: PrescriptionRecordId,
  ): Promise<PrescriptionImportResult> {
    const validated =
      metadata === undefined
        ? undefined
        : validatePrescriptionMetadata(metadata);
    const state = await writableState();
    const existing = id === undefined ? undefined : find(state, id);
    let candidate;
    try {
      candidate = await documents.select();
    } catch (error) {
      return { status: 'failed', stage: 'selection', error };
    }
    if (candidate === null) {
      return { status: 'cancelled', reason: 'selection' };
    }
    async function commit(): Promise<ImportOutcome> {
      if (existing) {
        try {
          if (!(await confirmReplacement(existing))) {
            return { status: 'cancelled', reason: 'confirmation' };
          }
        } catch (error) {
          return { status: 'failed', stage: 'confirmation', error };
        }
      }
      let record;
      try {
        record = existing
          ? await store.replace(candidate!, existing)
          : await store.create(candidate!, validated!);
      } catch (error) {
        return { status: 'failed', stage: 'commit', error };
      }
      return {
        status: existing && !(await cleanup()) ? 'cleanup-pending' : 'saved',
        record,
      };
    }
    const outcome = await commit();
    try {
      await documents.release(candidate);
    } catch (error) {
      return { status: 'candidate-release-failed', candidate, outcome, error };
    }
    return outcome;
  }
  return {
    getState: () => exclusive(() => store.read()),
    addPrescription: (metadata: PrescriptionMetadata) =>
      exclusive(() => importDocument(metadata)),
    replaceDocument: (id: PrescriptionRecordId) =>
      exclusive(() => importDocument(undefined, id)),
    updatePrescription: (
      id: PrescriptionRecordId,
      metadata: PrescriptionMetadata,
    ) =>
      exclusive(async () => {
        const validated = validatePrescriptionMetadata(metadata);
        const expected = find(await writableState(), id);
        return store.updateMetadata(expected, validated);
      }),
    viewPrescription: (id: PrescriptionRecordId) =>
      exclusive(async () => {
        await documents.open(find(await store.read(), id).documentId);
      }),
    deletePrescription: (id: PrescriptionRecordId) =>
      exclusive(async () => {
        const record = find(await writableState(), id);
        if (!(await confirmDeletion(record))) {
          return { status: 'cancelled' } as const;
        }
        await store.remove(record);
        return {
          status: (await cleanup()) ? 'deleted' : 'cleanup-pending',
        } as const;
      }),
    retryCleanup: () => exclusive(cleanup),
    retryCandidateRelease: (candidate: PrescriptionCandidateId) =>
      exclusive(() => documents.release(candidate)),
  };
}
