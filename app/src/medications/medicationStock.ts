import { sumCounts } from './countArithmetic';
import {
  isInstant,
  isStock,
  validateCollection,
  type MedicationRecord,
} from './medication';
import type { MedicationDoseSnapshot } from './medicationHealth';

export type StockResult =
  | {
      status:
        | 'unrecorded'
        | 'confirmation-required'
        | 'health-unavailable'
        | 'incomplete';
    }
  | {
      status: 'recorded' | 'legacy-recorded' | 'estimated';
      quantity: number;
      low: boolean;
      noReadableEvents: boolean;
    };

// This value is a view only. It must never be written back as stock or a baseline.
export function calculateStock(
  record: MedicationRecord,
  snapshot?: MedicationDoseSnapshot,
): StockResult {
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
  const concept = record.healthKitLink?.conceptReference ?? null;
  const result = (
    status: 'recorded' | 'legacy-recorded' | 'estimated',
    quantity: number,
    noReadableEvents = false,
  ): StockResult =>
    !isStock(quantity)
      ? { status: 'confirmation-required' }
      : {
          status,
          quantity,
          low:
            record.lowStockThreshold !== null &&
            quantity <= record.lowStockThreshold,
          noReadableEvents,
        };
  if (!baseline) {
    if (concept !== null) {
      return { status: 'confirmation-required' };
    }
    return record.legacyRecordedStock === null
      ? { status: 'unrecorded' }
      : result('legacy-recorded', record.legacyRecordedStock);
  }
  if (baseline.healthKitConceptReference !== concept) {
    return { status: 'confirmation-required' };
  }
  const quantities = [baseline.quantity];
  for (const addition of record.stockAdditions) {
    if (
      addition.baselineId !== baseline.id ||
      !isInstant(addition.recordedAt) ||
      addition.recordedAt < baseline.recordedAt ||
      !isStock(addition.quantity) ||
      addition.quantity === 0
    ) {
      return { status: 'incomplete' };
    }
    quantities.push(addition.quantity);
  }
  const total = sumCounts(quantities);
  if (!isStock(total)) {
    return { status: 'incomplete' };
  }
  if (concept === null) {
    return result('recorded', total);
  }
  if (!snapshot) {
    return { status: 'health-unavailable' };
  }
  if (
    snapshot.baselineId !== baseline.id ||
    snapshot.conceptReference !== concept ||
    snapshot.from !== baseline.recordedAt ||
    !isInstant(snapshot.through) ||
    snapshot.through < baseline.recordedAt ||
    snapshot.coverage !== 'complete-query' ||
    record.stockAdditions.some(
      addition => addition.recordedAt > snapshot.through,
    )
  ) {
    return { status: 'incomplete' };
  }
  const seen = new Map<string, string>();
  const deductions: number[] = [];
  for (const event of snapshot.events) {
    if (
      !event.id ||
      event.conceptReference !== concept ||
      !isInstant(event.occurredAt)
    ) {
      return { status: 'incomplete' };
    }
    const fingerprint = JSON.stringify([
      event.conceptReference,
      event.occurredAt,
      event.logStatus,
      event.quantity,
      event.unit,
    ]);
    if (seen.has(event.id)) {
      if (seen.get(event.id) !== fingerprint) {
        return { status: 'incomplete' };
      }
      continue;
    }
    seen.set(event.id, fingerprint);
    if (
      event.occurredAt <= baseline.recordedAt ||
      event.occurredAt > snapshot.through
    ) {
      continue;
    }
    if (event.logStatus !== 'taken') {
      if (
        ![
          'skipped',
          'notLogged',
          'snoozed',
          'notInteracted',
          'notificationNotSent',
        ].includes(event.logStatus)
      ) {
        return { status: 'incomplete' };
      }
      continue;
    }
    if (!isStock(event.quantity) || event.unit !== 'count') {
      return { status: 'incomplete' };
    }
    deductions.push(-event.quantity);
  }
  return result(
    'estimated',
    sumCounts([...quantities, ...deductions]),
    snapshot.events.length === 0,
  );
}

export function recordedQuantity(record: MedicationRecord): number | null {
  const result = calculateStock(record);
  return 'quantity' in result ? result.quantity : null;
}
