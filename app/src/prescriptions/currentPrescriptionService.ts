// Historical single-document workflow retained for regression tests only.
// Application code uses prescription.ts and prescriptionService.ts instead.
declare const prescriptionId: unique symbol;
declare const candidateId: unique symbol;

export type PrescriptionId = string & { readonly [prescriptionId]: true };
export type PrescriptionCandidateId = string & { readonly [candidateId]: true };

export type PrescriptionState =
  | { current: null; pendingCleanup: null }
  | { current: PrescriptionId; pendingCleanup: PrescriptionId | null };

export interface CurrentPrescriptionStore {
  read(): Promise<PrescriptionState>;
  // Durably commit a fresh current ID AND the superseded ID as pending cleanup
  // together. Reject without changing current or leaving partial imports.
  // Reject while cleanup is pending. Do not consume the candidate: the workflow
  // always releases it separately. Native crash recovery belongs to the adapter.
  commit(candidate: PrescriptionCandidateId): Promise<PrescriptionId>;
  // Remove only the pending superseded app-owned copy, then durably clear pending
  // state. Preserve current. Retain pending state on failure; tolerate an already
  // removed copy so retries work after interruption. No pending cleanup is a no-op.
  cleanup(): Promise<void>;
}

export interface PrescriptionSelector {
  select(): Promise<PrescriptionCandidateId | null>;
  // Release candidate resources, never the committed copy or original source.
  // A rejected/cancelled select must clean up its own partially acquired resources.
  // Native adapters must clean up orphaned candidate resources left by process/app
  // termination after a release failure. retryCandidateRelease is only the
  // in-process explicit retry path.
  release(candidate: PrescriptionCandidateId): Promise<void>;
}

export interface PrescriptionViewer {
  open(current: PrescriptionId): Promise<void>;
}

type Dependencies = {
  store: CurrentPrescriptionStore;
  selector: PrescriptionSelector;
  viewer: PrescriptionViewer;
  confirmReplacement(current: PrescriptionId): Promise<boolean>;
};

export type ImportOutcome =
  | { status: 'cancelled'; reason: 'selection' | 'confirmation' }
  | { status: 'saved'; current: PrescriptionId }
  | { status: 'cleanup-pending'; current: PrescriptionId }
  | {
      status: 'failed';
      stage: 'selection' | 'confirmation' | 'commit';
      error: unknown;
    };

export type ImportResult =
  | ImportOutcome
  | {
      status: 'candidate-release-failed';
      candidate: PrescriptionCandidateId;
      outcome: ImportOutcome;
      error: unknown;
    };

export class PrescriptionOperationError extends Error {
  constructor(public readonly code: 'busy' | 'cleanup-pending') {
    super(code);
    this.name = 'PrescriptionOperationError';
  }
}

// One instance per store in the running app. The in-process lock is not durable;
// pending cleanup is. Store adapters must enforce their own transaction integrity.
export function createCurrentPrescriptionService({
  store,
  selector,
  viewer,
  confirmReplacement,
}: Dependencies) {
  let busy = false;

  async function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (busy) {
      throw new PrescriptionOperationError('busy');
    }
    busy = true;
    try {
      return await operation();
    } finally {
      busy = false;
    }
  }

  async function finishCleanup(
    current: PrescriptionId,
  ): Promise<ImportOutcome> {
    try {
      await store.cleanup();
      return { status: 'saved', current };
    } catch {
      // Current has already changed; this must not look like a failed commit.
      return { status: 'cleanup-pending', current };
    }
  }

  async function useCandidate(
    candidate: PrescriptionCandidateId,
    current: PrescriptionId | null,
  ): Promise<ImportOutcome> {
    if (current !== null) {
      try {
        if (!(await confirmReplacement(current))) {
          return { status: 'cancelled', reason: 'confirmation' };
        }
      } catch (error) {
        return { status: 'failed', stage: 'confirmation', error };
      }
    }
    let next: PrescriptionId;
    try {
      next = await store.commit(candidate);
    } catch (error) {
      return { status: 'failed', stage: 'commit', error };
    }
    return current === null
      ? { status: 'saved', current: next }
      : finishCleanup(next);
  }

  return {
    getState: () => exclusive(() => store.read()),

    importPrescription: (): Promise<ImportResult> =>
      exclusive(async () => {
        const state = await store.read();
        if (state.pendingCleanup !== null) {
          throw new PrescriptionOperationError('cleanup-pending');
        }
        let candidate: PrescriptionCandidateId | null;
        try {
          candidate = await selector.select();
        } catch (error) {
          return { status: 'failed', stage: 'selection', error };
        }
        if (candidate === null) {
          return { status: 'cancelled', reason: 'selection' };
        }
        const outcome = await useCandidate(candidate, state.current);
        try {
          await selector.release(candidate);
        } catch (error) {
          // Keep the committed/cancelled/failed outcome visible and expose only
          // an opaque handle so the caller can explicitly retry resource release.
          return {
            status: 'candidate-release-failed',
            candidate,
            outcome,
            error,
          };
        }
        return outcome;
      }),

    retryCandidateRelease: (candidate: PrescriptionCandidateId) =>
      exclusive(() => selector.release(candidate)),

    retryCleanup: () =>
      exclusive(async () => {
        const state = await store.read();
        return state.pendingCleanup === null
          ? ({ status: 'nothing-to-clean' } as const)
          : finishCleanup(state.current);
      }),

    viewPrescription: (): Promise<'opened' | 'empty'> =>
      exclusive(async () => {
        const { current } = await store.read();
        if (current === null) {
          return 'empty';
        }
        await viewer.open(current);
        return 'opened';
      }),
  };
}
