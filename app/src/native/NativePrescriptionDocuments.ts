import { NativeModules } from 'react-native';
import type {
  CurrentPrescriptionStore,
  PrescriptionCandidateId,
  PrescriptionId,
  PrescriptionSelector,
  PrescriptionState,
  PrescriptionViewer,
} from '../prescriptions/currentPrescriptionService';

/**
 * Future PrescriptionDocuments native module. IDs are opaque handles, never
 * paths, URLs or file contents. Native code owns Files selection, app-private
 * copies, durable state and crash recovery under the existing service contracts.
 * Commit must not consume candidates; cleanup removes only the superseded
 * app-owned copy; release never deletes the source or committed prescription.
 * Open must reject stale/unknown current IDs. Native errors must be sanitised
 * at their source: genuine operation failures propagate unchanged here.
 */
export interface PrescriptionDocumentsNativeModule
  extends CurrentPrescriptionStore,
    PrescriptionSelector,
    PrescriptionViewer {}

export class PrescriptionDocumentsBoundaryError extends Error {
  constructor(public readonly code: 'unavailable' | 'invalid-response') {
    super(
      code === 'unavailable'
        ? 'Prescription document handling is unavailable.'
        : 'Prescription document handling returned an invalid response.',
    );
    this.name = 'PrescriptionDocumentsBoundaryError';
  }
}

function requireNativeModule(): PrescriptionDocumentsNativeModule {
  const native = NativeModules.PrescriptionDocuments as
    | PrescriptionDocumentsNativeModule
    | null
    | undefined;
  if (
    !native ||
    typeof native.select !== 'function' ||
    typeof native.commit !== 'function' ||
    typeof native.read !== 'function' ||
    typeof native.cleanup !== 'function' ||
    typeof native.release !== 'function' ||
    typeof native.open !== 'function'
  ) {
    throw new PrescriptionDocumentsBoundaryError('unavailable');
  }
  return native;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /\S/.test(value);
}

function validateState(value: unknown): PrescriptionState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PrescriptionDocumentsBoundaryError('invalid-response');
  }
  const { current, pendingCleanup } = value as Record<string, unknown>;
  if (current === null && pendingCleanup === null) {
    return { current: null, pendingCleanup: null };
  }
  if (
    isIdentifier(current) &&
    (pendingCleanup === null || isIdentifier(pendingCleanup))
  ) {
    // Reconstruct only the public fields; additional native metadata stays out.
    return {
      current: current as PrescriptionId,
      pendingCleanup: pendingCleanup as PrescriptionId | null,
    };
  }
  throw new PrescriptionDocumentsBoundaryError('invalid-response');
}

function validateVoid(value: unknown): void {
  // Native promise bridges may resolve a void operation with null.
  if (value !== undefined && value !== null) {
    throw new PrescriptionDocumentsBoundaryError('invalid-response');
  }
}

// Lazy lookup: importing this module performs no native work. No state is cached
// and missing native support never falls back to fabricated JS persistence.
export const NativePrescriptionDocuments: PrescriptionDocumentsNativeModule = {
  select: async () => {
    const candidate: unknown = await requireNativeModule().select();
    if (candidate === null) {
      return null;
    }
    if (!isIdentifier(candidate)) {
      throw new PrescriptionDocumentsBoundaryError('invalid-response');
    }
    return candidate as PrescriptionCandidateId;
  },
  commit: async candidate => {
    const current: unknown = await requireNativeModule().commit(candidate);
    if (!isIdentifier(current)) {
      throw new PrescriptionDocumentsBoundaryError('invalid-response');
    }
    return current as PrescriptionId;
  },
  read: async () => validateState(await requireNativeModule().read()),
  cleanup: async () => validateVoid(await requireNativeModule().cleanup()),
  release: async candidate =>
    validateVoid(await requireNativeModule().release(candidate)),
  open: async current => validateVoid(await requireNativeModule().open(current)),
};
