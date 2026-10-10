import { NativeMedicationStorage } from '../native/NativeMedicationStorage';
import { NativePrescriptionDocuments } from '../native/NativePrescriptionDocuments';
import { createMedicationService } from './medicationService';

export const medicationService = createMedicationService(
  NativeMedicationStorage,
  async id =>
    (await NativePrescriptionDocuments.read()).records.some(
      record => record.id === id,
    ),
);
