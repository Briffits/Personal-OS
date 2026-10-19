// Read-only contracts. Phase 1 has no native implementation or authorization UI.
export type HealthMedication = {
  readonly conceptReference: string;
  readonly displayName: string;
  readonly archived: boolean;
};
export type MedicationDoseEvent = {
  readonly id: string;
  readonly conceptReference: string;
  readonly occurredAt: string;
  readonly logStatus:
    | 'taken'
    | 'skipped'
    | 'notLogged'
    | 'snoozed'
    | 'notInteracted'
    | 'notificationNotSent'
    | 'unknown';
  readonly quantity: number | null;
  // Native must positively identify count units. No clinical conversion.
  readonly unit: 'count' | 'unsupported';
};
export type MedicationDoseSnapshot = {
  readonly baselineId: string;
  readonly conceptReference: string;
  readonly from: string;
  readonly through: string;
  readonly coverage: 'complete-query' | 'limited';
  readonly events: readonly MedicationDoseEvent[];
};
export interface MedicationHealthReader {
  availability(): Promise<'available' | 'unsupported'>;
  requestMedicationAccess(): Promise<void>;
  listMedications(): Promise<readonly HealthMedication[]>;
  readDoseSnapshot(request: {
    baselineId: string;
    conceptReference: string;
    from: string;
    through: string;
  }): Promise<MedicationDoseSnapshot>;
}
