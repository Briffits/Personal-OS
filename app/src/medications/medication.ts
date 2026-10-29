import { sameDecimal } from './countArithmetic';
export type StockBaseline = {
  readonly id: string;
  readonly quantity: number;
  readonly recordedAt: string;
  // Binds the count to its consumption source. A later unlink/relink must not
  // turn the original undeducted quantity into a current manual balance.
  readonly healthKitConceptReference: string | null;
};
export type StockAddition = {
  readonly id: string;
  readonly baselineId: string;
  readonly quantity: number;
  readonly recordedAt: string;
};
export type MedicationRecord = {
  readonly id: string;
  readonly displayName: string;
  readonly prescriptionId: string | null;
  readonly stockUnit: 'count';
  readonly stockBaseline: StockBaseline | null;
  readonly stockAdditions: readonly StockAddition[];
  readonly legacyRecordedStock: number | null;
  readonly lowStockThreshold: number | null;
  // Preserved opaque identity. This compatibility slice never interprets it.
  readonly healthKitLink: { readonly conceptReference: string } | null;
};
export type MedicationDetails = Pick<
  MedicationRecord,
  'displayName' | 'prescriptionId'
>;
export type MedicationCollection = {
  readonly schemaVersion: 2;
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
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}
export function isRevision(value: unknown): value is number {
  return isStock(value) && Number.isSafeInteger(value);
}
export function isInstant(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}
// Match the existing native whitespace contract, not ECMAScript trim (which
// removes FEFF but retains 0085/200B). Stored values are never normalized.
function trimMedicationName(value: string): string {
  return value.replace(
    /^[\t\n\v\f\r\u0020\u0085\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000]+|[\t\n\v\f\r\u0020\u0085\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000]+$/g,
    '',
  );
}
export function isConceptReference(value: unknown): value is string {
  return typeof value === 'string' && trimMedicationName(value).length > 0;
}
export function parseStockInput(input: string): number {
  // Decimal comma is accepted for the iOS decimal keyboard. Grouping and
  // exponential notation are deliberately not accepted as quantity input.
  const text = input.trim().replace(',', '.');
  const quantity = Number(text);
  if (
    !/^\d+(?:\.\d+)?$/.test(text) ||
    !isStock(quantity) ||
    !sameDecimal(text, quantity)
  ) {
    throw new MedicationError('invalid-input');
  }
  return quantity;
}
export function validateDetails(value: MedicationDetails): MedicationDetails {
  if (
    !value ||
    typeof value.displayName !== 'string' ||
    !isConceptReference(value.displayName) ||
    (value.prescriptionId !== null && !isIdentifier(value.prescriptionId))
  ) {
    throw new MedicationError('invalid-input');
  }
  return {
    displayName: trimMedicationName(value.displayName),
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
  if (!isRevision(state.schemaVersion)) {
    return invalid();
  }
  if (state.schemaVersion !== 2) {
    throw new MedicationError('unsupported-version');
  }
  if (!isRevision(state.revision) || !Array.isArray(state.records)) {
    return invalid();
  }
  const records = state.records.map((record: MedicationRecord) => {
    if (
      !record ||
      !isIdentifier(record.id) ||
      typeof record.displayName !== 'string' ||
      !isConceptReference(record.displayName) ||
      (record.prescriptionId !== null &&
        !isIdentifier(record.prescriptionId)) ||
      record.stockUnit !== 'count' ||
      (record.legacyRecordedStock !== null &&
        !isStock(record.legacyRecordedStock)) ||
      (record.lowStockThreshold !== null &&
        !isStock(record.lowStockThreshold)) ||
      (record.healthKitLink !== null &&
        (!record.healthKitLink ||
          !isConceptReference(record.healthKitLink.conceptReference))) ||
      !Array.isArray(record.stockAdditions)
    ) {
      return invalid();
    }
    const baseline = record.stockBaseline;
    if (
      baseline !== null &&
      (!baseline ||
        !isIdentifier(baseline.id) ||
        !isStock(baseline.quantity) ||
        !isInstant(baseline.recordedAt) ||
        (baseline.healthKitConceptReference !== null &&
          !isConceptReference(baseline.healthKitConceptReference)) ||
        record.legacyRecordedStock !== null)
    ) {
      return invalid();
    }
    let total = baseline?.quantity ?? 0;
    const additions = record.stockAdditions.map((addition: StockAddition) => {
      if (
        !baseline ||
        !addition ||
        !isIdentifier(addition.id) ||
        addition.id === baseline.id ||
        addition.baselineId !== baseline.id ||
        !isStock(addition.quantity) ||
        addition.quantity === 0 ||
        !isInstant(addition.recordedAt) ||
        addition.recordedAt < baseline.recordedAt
      ) {
        return invalid();
      }
      const next = total + addition.quantity;
      if (!isStock(next) || next <= total) {
        return invalid();
      }
      total = next;
      return {
        id: addition.id,
        baselineId: addition.baselineId,
        quantity: addition.quantity,
        recordedAt: addition.recordedAt,
      };
    });
    if (new Set(additions.map(item => item.id)).size !== additions.length) {
      return invalid();
    }
    return {
      id: record.id,
      displayName: record.displayName,
      prescriptionId: record.prescriptionId,
      stockUnit: 'count' as const,
      legacyRecordedStock: record.legacyRecordedStock,
      lowStockThreshold: record.lowStockThreshold,
      healthKitLink:
        record.healthKitLink === null
          ? null
          : { conceptReference: record.healthKitLink.conceptReference },
      stockBaseline:
        baseline === null
          ? null
          : {
              id: baseline.id,
              quantity: baseline.quantity,
              recordedAt: baseline.recordedAt,
              healthKitConceptReference: baseline.healthKitConceptReference,
            },
      stockAdditions: additions,
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
      !isRevision(pending.stock) ||
      pending.prescriptionId !== null ||
      records.length > 0)
  ) {
    return invalid();
  }
  return {
    schemaVersion: 2,
    revision: state.revision,
    records,
    pendingLegacy:
      pending === null
        ? null
        : { id: pending.id, stock: pending.stock, prescriptionId: null },
  };
}
