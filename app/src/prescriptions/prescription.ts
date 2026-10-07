declare const recordId: unique symbol;
declare const documentId: unique symbol;
declare const candidateId: unique symbol;

export type PrescriptionRecordId = string & { readonly [recordId]: true };
export type PrescriptionDocumentId = string & { readonly [documentId]: true };
export type PrescriptionCandidateId = string & { readonly [candidateId]: true };

export interface PrescriptionMetadata {
  // User label only. Absent on existing v2 records until explicitly supplied.
  readonly displayName?: string;
  readonly kind: 'standard' | 'temporary';
  readonly medicationIds: readonly string[];
  readonly expiresOn: string;
  readonly issuedOn?: string;
  readonly startsOn?: string;
}

export interface PrescriptionRecord extends PrescriptionMetadata {
  readonly id: PrescriptionRecordId;
  readonly documentId: PrescriptionDocumentId;
}

export class PrescriptionValidationError extends Error {
  constructor() {
    super('Invalid prescription metadata.');
    this.name = 'PrescriptionValidationError';
  }
}

export function isPrescriptionDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
  );
}

// Reconstruct public fields so callers cannot persist lifecycle flags or paths.
export function validatePrescriptionMetadata(
  value: PrescriptionMetadata,
): PrescriptionMetadata {
  if (
    !value ||
    (value.displayName !== undefined &&
      (typeof value.displayName !== 'string' ||
        value.displayName.trim() === '')) ||
    (value.kind !== 'standard' && value.kind !== 'temporary') ||
    !Array.isArray(value.medicationIds) ||
    value.medicationIds.some(
      id => typeof id !== 'string' || id.trim() === '',
    ) ||
    new Set(value.medicationIds).size !== value.medicationIds.length ||
    !isPrescriptionDate(value.expiresOn) ||
    (value.issuedOn !== undefined &&
      (!isPrescriptionDate(value.issuedOn) ||
        value.issuedOn > value.expiresOn)) ||
    (value.startsOn !== undefined &&
      (value.kind !== 'temporary' ||
        !isPrescriptionDate(value.startsOn) ||
        value.startsOn > value.expiresOn))
  ) {
    throw new PrescriptionValidationError();
  }
  return {
    ...(value.displayName === undefined
      ? {}
      : { displayName: value.displayName }),
    kind: value.kind,
    medicationIds: [...value.medicationIds],
    expiresOn: value.expiresOn,
    ...(value.issuedOn === undefined ? {} : { issuedOn: value.issuedOn }),
    ...(value.startsOn === undefined ? {} : { startsOn: value.startsOn }),
  };
}

// The caller supplies the user's calendar date; expiry day itself is retained/current.
export function isPrescriptionExpired(
  prescription: PrescriptionMetadata,
  on: string,
): boolean {
  const metadata = validatePrescriptionMetadata(prescription);
  if (!isPrescriptionDate(on)) {
    throw new PrescriptionValidationError();
  }
  return metadata.expiresOn < on;
}
