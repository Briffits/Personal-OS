import { NativeModules } from 'react-native';
import { MedicationError, validateCollection } from '../medications/medication';
import type { MedicationStore } from '../medications/medicationService';

function native(): MedicationStore {
  const module = NativeModules.MedicationStorage as MedicationStore | undefined;
  if (
    !module ||
    typeof module.read !== 'function' ||
    typeof module.mutate !== 'function'
  ) {
    throw new MedicationError('unavailable');
  }
  return module;
}

export const NativeMedicationStorage: MedicationStore = {
  read: async () => validateCollection(await native().read()),
  mutate: async (revision, command) =>
    validateCollection(await native().mutate(revision, command)),
};
