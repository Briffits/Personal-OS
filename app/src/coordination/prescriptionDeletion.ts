import type { createMedicationService } from '../medications/medicationService';
import type { PrescriptionRecordId } from '../prescriptions/prescription';
import type { createPrescriptionService } from '../prescriptions/prescriptionService';

export class PrescriptionDeletionError extends Error {
  constructor(readonly code: 'unlink-unconfirmed' | 'deletion-unconfirmed') {
    super(code);
    this.name = 'PrescriptionDeletionError';
  }
}

// Unlink first so a crash/failure cannot remove a prescription while leaving its
// links behind. If removal fails after unlinking, retain that safe partial result
// and report it explicitly. Retrying is idempotent; no compensating relink guesses.
export function createPrescriptionDeletionCoordinator(
  prescriptions: Pick<
    ReturnType<typeof createPrescriptionService>,
    'deletePrescription'
  >,
  medications: Pick<
    ReturnType<typeof createMedicationService>,
    'unlinkPrescription'
  >,
) {
  return async (id: PrescriptionRecordId) => {
    let unlinked = false;
    try {
      return await prescriptions.deletePrescription(id, async record => {
        try {
          await medications.unlinkPrescription(record.id);
          unlinked = true;
        } catch {
          throw new PrescriptionDeletionError('unlink-unconfirmed');
        }
      });
    } catch (error) {
      if (unlinked) {
        throw new PrescriptionDeletionError('deletion-unconfirmed');
      }
      throw error;
    }
  };
}
