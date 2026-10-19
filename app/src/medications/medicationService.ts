import { recordedQuantity } from './medicationStock';
import {
  MedicationError,
  isIdentifier,
  isStock,
  parseStockInput,
  validateDetails,
  type MedicationCollection,
  type MedicationDetails,
} from './medication';

export type MedicationCommand =
  | ({ type: 'create' } & MedicationDetails)
  | ({ type: 'edit'; id: string } & MedicationDetails)
  | { type: 'completeLegacy'; displayName: string }
  | { type: 'establishBaseline'; id: string; quantity: number }
  | { type: 'addStock'; id: string; quantity: number }
  | { type: 'setLowStockThreshold'; id: string; quantity: number | null }
  | { type: 'unlinkPrescription'; prescriptionId: string }
  | { type: 'remove'; id: string };

export interface MedicationStore {
  read(): Promise<MedicationCollection>;
  mutate(
    revision: number,
    command: MedicationCommand,
  ): Promise<MedicationCollection>;
}

// Each operation uses the revision shown to the user. Native compares it inside
// the serialized transaction; no retry may silently apply an old prompt twice.
export function createMedicationService(
  store: MedicationStore,
  prescriptionExists: (id: string) => Promise<boolean>,
) {
  function find(state: MedicationCollection, id: string) {
    const record = state.records.find(item => item.id === id);
    if (!record) {
      throw new MedicationError('not-found');
    }
    return record;
  }

  return {
    read: () => store.read(),
    // One revision-checked collection command clears all matches together.
    // A retry reads durable state first; already-unlinked collections need no write.
    async unlinkPrescription(prescriptionId: string) {
      if (!isIdentifier(prescriptionId)) {
        throw new MedicationError('invalid-input');
      }
      const state = await store.read();
      if (
        !state.records.some(record => record.prescriptionId === prescriptionId)
      ) {
        return state;
      }
      return store.mutate(state.revision, {
        type: 'unlinkPrescription',
        prescriptionId,
      });
    },
    async saveDetails(
      state: MedicationCollection,
      details: MedicationDetails,
      id?: string,
    ) {
      const validated = validateDetails(details);
      const previous = id === undefined ? null : find(state, id).prescriptionId;
      if (
        validated.prescriptionId !== null &&
        validated.prescriptionId !== previous &&
        !(await prescriptionExists(validated.prescriptionId))
      ) {
        throw new MedicationError('prescription-unavailable');
      }
      return store.mutate(
        state.revision,
        id === undefined
          ? { type: 'create', ...validated }
          : { type: 'edit', id, ...validated },
      );
    },
    completeLegacy(state: MedicationCollection, displayName: string) {
      const details = validateDetails({ displayName, prescriptionId: null });
      return store.mutate(state.revision, {
        type: 'completeLegacy',
        displayName: details.displayName,
      });
    },
    changeStock(
      state: MedicationCollection,
      id: string,
      action: 'add' | 'record' | 'correct',
      input: string,
    ) {
      const record = find(state, id);
      const amount = parseStockInput(input);
      const current = recordedQuantity(record);
      if (
        (action === 'add' && (amount === 0 || current === null)) ||
        (action === 'record' && current !== null)
      ) {
        throw new MedicationError('invalid-input');
      }
      if (
        action === 'add' &&
        (!isStock(current! + amount) || current! + amount <= current!)
      ) {
        throw new MedicationError('invalid-input');
      }
      return store.mutate(state.revision, {
        type: action === 'add' ? 'addStock' : 'establishBaseline',
        id,
        quantity: amount,
      });
    },
    setLowStockThreshold(
      state: MedicationCollection,
      id: string,
      input: string,
    ) {
      find(state, id);
      const quantity = input.trim() === '' ? null : parseStockInput(input);
      return store.mutate(state.revision, {
        type: 'setLowStockThreshold',
        id,
        quantity,
      });
    },
    // The caller must obtain explicit deletion confirmation for this snapshot.
    remove(state: MedicationCollection, id: string) {
      find(state, id);
      return store.mutate(state.revision, { type: 'remove', id });
    },
  };
}
