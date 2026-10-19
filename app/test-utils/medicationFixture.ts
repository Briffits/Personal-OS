import { sumCounts } from '../src/medications/countArithmetic';
import {
  MedicationError,
  type MedicationCollection,
} from '../src/medications/medication';
import type { MedicationCommand } from '../src/medications/medicationService';

export const firstId = '11111111-1111-4111-8111-111111111111';
export const secondId = '22222222-2222-4222-8222-222222222222';
export const prescriptionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const otherPrescriptionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export function stockFields(legacyRecordedStock: number | null) {
  return {
    stockUnit: 'count' as const,
    stockBaseline: null,
    stockAdditions: [],
    legacyRecordedStock,
    lowStockThreshold: null,
    healthKitLink: null,
  };
}
export function initialCollection(): MedicationCollection {
  return {
    schemaVersion: 2,
    revision: 0,
    pendingLegacy: null,
    records: [
      {
        id: firstId,
        displayName: 'Example one',
        ...stockFields(12),
        prescriptionId: null,
      },
      {
        id: secondId,
        displayName: 'Example two',
        ...stockFields(null),
        prescriptionId: null,
      },
    ],
  };
}

// UI/service test double only. Native migration and publication are tested in Swift.
export function medicationFixture(initial = initialCollection()) {
  let state = initial;
  let nextId = 3;
  const read = jest.fn(async () => state);
  const mutate = jest.fn(
    async (revision: number, command: MedicationCommand) => {
      if (revision !== state.revision) {
        throw new MedicationError('stale-state');
      }
      let records = [...state.records];
      let pendingLegacy = state.pendingLegacy;
      if (command.type === 'create') {
        records.push({
          id: `${String(nextId++).padStart(
            8,
            '0',
          )}-0000-4000-8000-000000000000`,
          displayName: command.displayName,
          ...stockFields(null),
          prescriptionId: command.prescriptionId,
        });
      } else if (command.type === 'completeLegacy') {
        if (!pendingLegacy) {
          throw new MedicationError('not-found');
        }
        records.push({
          id: pendingLegacy.id,
          prescriptionId: null,
          ...stockFields(pendingLegacy.stock),
          displayName: command.displayName,
        });
        pendingLegacy = null;
      } else if (command.type === 'remove') {
        records = records.filter(record => record.id !== command.id);
      } else if (command.type === 'unlinkPrescription') {
        records = records.map(record =>
          record.prescriptionId === command.prescriptionId
            ? { ...record, prescriptionId: null }
            : record,
        );
      } else {
        records = records.map(record => {
          if (record.id !== command.id) {
            return record;
          }
          if (command.type === 'edit') {
            return {
              ...record,
              displayName: command.displayName,
              prescriptionId: command.prescriptionId,
            };
          }
          if (command.type === 'setLowStockThreshold') {
            return { ...record, lowStockThreshold: command.quantity };
          }
          const id = `${String(nextId++).padStart(
            8,
            '0',
          )}-0000-4000-8000-000000000000`;
          const recordedAt = '2026-01-01T00:00:00.000Z';
          if (command.type === 'establishBaseline') {
            return {
              ...record,
              legacyRecordedStock: null,
              stockAdditions: [],
              stockBaseline: {
                id,
                quantity: command.quantity,
                recordedAt,
                healthKitConceptReference:
                  record.healthKitLink?.conceptReference ?? null,
              },
            };
          }
          if (!record.stockBaseline) {
            return {
              ...record,
              legacyRecordedStock: sumCounts([
                record.legacyRecordedStock!,
                command.quantity,
              ]),
            };
          }
          return {
            ...record,
            stockAdditions: [
              ...record.stockAdditions,
              {
                id,
                baselineId: record.stockBaseline.id,
                quantity: command.quantity,
                recordedAt,
              },
            ],
          };
        });
      }
      state = { ...state, revision: revision + 1, records, pendingLegacy };
      return state;
    },
  );
  return { read, mutate, state: () => state };
}
