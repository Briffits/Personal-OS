import { NativeModules } from 'react-native';
import {
  validatePrescriptionMetadata,
  type PrescriptionCandidateId,
  type PrescriptionDocumentId,
  type PrescriptionMetadata,
  type PrescriptionRecord,
  type PrescriptionRecordId,
} from '../prescriptions/prescription';
import type {
  PrescriptionDocuments,
  PrescriptionWalletState,
  PrescriptionWalletStore,
} from '../prescriptions/prescriptionService';

export interface PrescriptionWalletNativeModule
  extends PrescriptionWalletStore,
    PrescriptionDocuments {
  migrateLegacy(
    document: PrescriptionDocumentId,
    metadata: PrescriptionMetadata,
  ): Promise<PrescriptionRecord>;
}

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

const methods = [
  'read',
  'create',
  'replace',
  'remove',
  'updateMetadata',
  'migrateLegacy',
  'select',
  'release',
  'open',
  'cleanup',
] as const;

function requireNativeModule(): PrescriptionWalletNativeModule {
  const native = NativeModules.PrescriptionDocuments as
    | PrescriptionWalletNativeModule
    | undefined;
  if (!native || methods.some(method => typeof native[method] !== 'function')) {
    throw new PrescriptionDocumentsBoundaryError('unavailable');
  }
  return native;
}

function invalid(): never {
  throw new PrescriptionDocumentsBoundaryError('invalid-response');
}

// Native generates UUID handles. Reject paths/URLs and malformed handles at the boundary.
function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      value,
    )
  ) {
    return invalid();
  }
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid();
  }
  return value as Record<string, unknown>;
}

function record(value: unknown): PrescriptionRecord {
  const input = object(value);
  let metadata: PrescriptionMetadata;
  try {
    metadata = validatePrescriptionMetadata(
      input as unknown as PrescriptionMetadata,
    );
  } catch {
    return invalid();
  }
  const id = identifier(input.id) as PrescriptionRecordId;
  const documentId = identifier(input.documentId) as PrescriptionDocumentId;
  if (id === (documentId as string)) {
    return invalid();
  }
  return { ...metadata, id, documentId };
}

function state(value: unknown): PrescriptionWalletState {
  const input = object(value);
  if (!Array.isArray(input.records) || !Array.isArray(input.pendingCleanup)) {
    return invalid();
  }
  const records = input.records.map(record);
  const pendingCleanup = input.pendingCleanup.map(
    item => identifier(item) as PrescriptionDocumentId,
  );
  const legacyDocumentId =
    input.legacyDocumentId === null
      ? undefined
      : (identifier(input.legacyDocumentId) as PrescriptionDocumentId);
  const retained = records.map(item => item.documentId);
  if (legacyDocumentId) {
    retained.push(legacyDocumentId);
  }
  if (
    new Set(records.map(item => item.id)).size !== records.length ||
    new Set(retained).size !== retained.length ||
    new Set(pendingCleanup).size !== pendingCleanup.length ||
    pendingCleanup.some(id => retained.includes(id)) ||
    (legacyDocumentId !== undefined && records.length > 0)
  ) {
    return invalid();
  }
  return {
    records,
    pendingCleanup,
    ...(legacyDocumentId ? { legacyDocumentId } : {}),
  };
}

function voidResult(value: unknown): void {
  if (value !== undefined && value !== null) {
    invalid();
  }
}

// Lazy native lookup; only reconstructed public metadata crosses this boundary.
// There is no JS persistence fallback and no legacy commit(candidate) adapter.
export const NativePrescriptionDocuments: PrescriptionWalletNativeModule = {
  read: async () => state(await requireNativeModule().read()),
  select: async () => {
    const value: unknown = await requireNativeModule().select();
    return value === null
      ? null
      : (identifier(value) as PrescriptionCandidateId);
  },
  create: async (candidate, metadata) => {
    const input = validatePrescriptionMetadata(metadata);
    return record(
      await requireNativeModule().create(
        identifier(candidate) as PrescriptionCandidateId,
        input,
      ),
    );
  },
  replace: async (candidate, expected) =>
    record(
      await requireNativeModule().replace(
        identifier(candidate) as PrescriptionCandidateId,
        record(expected),
      ),
    ),
  updateMetadata: async (expected, metadata) => {
    const input = validatePrescriptionMetadata(metadata);
    return record(
      await requireNativeModule().updateMetadata(record(expected), input),
    );
  },
  remove: async expected =>
    voidResult(await requireNativeModule().remove(record(expected))),
  migrateLegacy: async (document, metadata) => {
    const input = validatePrescriptionMetadata(metadata);
    return record(
      await requireNativeModule().migrateLegacy(
        identifier(document) as PrescriptionDocumentId,
        input,
      ),
    );
  },
  cleanup: async () => voidResult(await requireNativeModule().cleanup()),
  release: async candidate =>
    voidResult(
      await requireNativeModule().release(
        identifier(candidate) as PrescriptionCandidateId,
      ),
    ),
  open: async document =>
    voidResult(
      await requireNativeModule().open(
        identifier(document) as PrescriptionDocumentId,
      ),
    ),
};
