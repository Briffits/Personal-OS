import {
  MedicationError,
  type MedicationCollection,
} from '../src/medications/medication';
import type { MedicationCommand } from '../src/medications/medicationService';

export const firstId = '11111111-1111-4111-8111-111111111111';
export const secondId = '22222222-2222-4222-8222-222222222222';
export const prescriptionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const otherPrescriptionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export function initialCollection(): MedicationCollection {
  return {
    schemaVersion: 1,
    revision: 0,
    pendingLegacy: null,
    records: [
      {
        id: firstId,
        displayName: 'Example one',
        stock: 12,
        prescriptionId: null,
      },
      {
        id: secondId,
        displayName: 'Example two',
        stock: null,
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
          stock: null,
          prescriptionId: command.prescriptionId,
        });
      } else if (command.type === 'completeLegacy') {
        if (!pendingLegacy) {
          throw new MedicationError('not-found');
        }
        records.push({ ...pendingLegacy, displayName: command.displayName });
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
        records = records.map(record =>
          record.id !== command.id
            ? record
            : command.type === 'edit'
            ? {
                ...record,
                displayName: command.displayName,
                prescriptionId: command.prescriptionId,
              }
            : { ...record, stock: command.stock },
        );
      }
      state = { ...state, revision: revision + 1, records, pendingLegacy };
      return state;
    },
  );
  return { read, mutate, state: () => state };
}
