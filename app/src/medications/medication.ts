export type MedicationRecord = {
  readonly id: string;
  readonly displayName: string;
  readonly stock: number | null;
  // The only canonical relationship. Prescription.medicationIds is legacy data.
  readonly prescriptionId: string | null;
};

export type MedicationDetails = Pick<
  MedicationRecord,
  'displayName' | 'prescriptionId'
>;

export type MedicationCollection = {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly records: readonly MedicationRecord[];
  readonly pendingLegacy: {
    readonly id: string;
    readonly stock: number;
    readonly prescriptionId: null;
  } | null;
};

export class MedicationError extends Error {
  constructor(readonly code: string) {
    super(`Medication operation: ${code}.`);
    this.name = 'MedicationError';
  }
}

export function isIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  );
}

export function isStock(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function validateDetails(value: MedicationDetails): MedicationDetails {
  if (
    !value ||
    typeof value.displayName !== 'string' ||
    !value.displayName.trim() ||
    (value.prescriptionId !== null && !isIdentifier(value.prescriptionId))
  ) {
    throw new MedicationError('invalid-input');
  }
  return {
    displayName: value.displayName.trim(),
    prescriptionId: value.prescriptionId,
  };
}

export function validateCollection(value: unknown): MedicationCollection {
  const invalid = (): never => {
    throw new MedicationError('invalid-record');
  };
  if (!value || typeof value !== 'object') {
    return invalid();
  }
  const state = value as MedicationCollection;
  if (
    state.schemaVersion !== 1 ||
    !isStock(state.revision) ||
    !Array.isArray(state.records)
  ) {
    return invalid();
  }
  const records = state.records.map(record => {
    if (
      !record ||
      !isIdentifier(record.id) ||
      typeof record.displayName !== 'string' ||
      !record.displayName.trim() ||
      (record.stock !== null && !isStock(record.stock)) ||
      (record.prescriptionId !== null && !isIdentifier(record.prescriptionId))
    ) {
      return invalid();
    }
    return {
      id: record.id,
      displayName: record.displayName,
      stock: record.stock,
      prescriptionId: record.prescriptionId,
    };
  });
  if (new Set(records.map(record => record.id)).size !== records.length) {
    return invalid();
  }
  const pending = state.pendingLegacy;
  if (
    pending !== null &&
    (!pending ||
      !isIdentifier(pending.id) ||
      !isStock(pending.stock) ||
      pending.prescriptionId !== null ||
      records.length > 0)
  ) {
    return invalid();
  }
  return {
    schemaVersion: 1,
    revision: state.revision,
    records,
    pendingLegacy:
      pending === null
        ? null
        : { id: pending.id, stock: pending.stock, prescriptionId: null },
  };
}
