import { sumCounts } from './countArithmetic';
import {
  isStock,
  validateCollection,
  type MedicationRecord,
} from './medication';

export type StockResult =
  | {
      status:
        | 'unrecorded'
        | 'confirmation-required'
        | 'health-unavailable'
        | 'incomplete';
    }
  | { status: 'recorded' | 'legacy-recorded'; quantity: number };

// References are preserved, never compared as semantic Health identities.
export function canChangeStock(record: MedicationRecord): boolean {
  return (
    record.healthKitLink === null &&
    (record.stockBaseline === null ||
      record.stockBaseline.healthKitConceptReference === null)
  );
}

// A local view only: never persist this derived total as a new physical count.
export function calculateStock(record: MedicationRecord): StockResult {
  try {
    validateCollection({
      schemaVersion: 2,
      revision: 0,
      records: [record],
      pendingLegacy: null,
    });
  } catch {
    return { status: 'incomplete' };
  }
  const baseline = record.stockBaseline;
  if (record.healthKitLink !== null) {
    return { status: 'health-unavailable' };
  }
  if (baseline?.healthKitConceptReference != null) {
    return { status: 'confirmation-required' };
  }
  if (!baseline) {
    return record.legacyRecordedStock === null
      ? { status: 'unrecorded' }
      : { status: 'legacy-recorded', quantity: record.legacyRecordedStock };
  }
  const quantity = sumCounts([
    baseline.quantity,
    ...record.stockAdditions.map(item => item.quantity),
  ]);
  return isStock(quantity)
    ? { status: 'recorded', quantity }
    : { status: 'incomplete' };
}

export function recordedQuantity(record: MedicationRecord): number | null {
  const result = calculateStock(record);
  return 'quantity' in result ? result.quantity : null;
}
