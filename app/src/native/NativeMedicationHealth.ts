import { NativeModules } from 'react-native';
import {
  isConceptReference,
  isIdentifier,
  isInstant,
} from '../medications/medication';
import type {
  HealthMedication,
  MedicationDoseSnapshot,
  MedicationHealthReader,
} from '../medications/medicationHealth';

export class MedicationHealthError extends Error {
  constructor(readonly code: string) {
    super(`Health medication operation: ${code}.`);
    this.name = 'MedicationHealthError';
  }
}
const codes = new Set([
  'health-unavailable',
  'authorization-cancelled',
  'authorization-failed',
  'query-failed',
  'malformed-identity',
  'invalid-interval',
  'invalid-input',
  'incomplete-dose-data',
]);
type Bridge = MedicationHealthReader & {
  validateConceptReference(reference: string): Promise<boolean>;
  compareConceptReferences(left: string, right: string): Promise<boolean>;
};
function native(): Bridge {
  const value = NativeModules.MedicationHealth as Bridge | undefined;
  if (!value) {
    throw new MedicationHealthError('health-unavailable');
  }
  return value;
}
async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    throw new MedicationHealthError(
      typeof code === 'string' && codes.has(code) ? code : 'query-failed',
    );
  }
}
function invalid(): never {
  throw new MedicationHealthError('incomplete-dose-data');
}
function nullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

export const NativeMedicationHealth: Bridge = {
  availability: async () => {
    if (!NativeModules.MedicationHealth) {
      return 'unsupported';
    }
    return call(async () => {
      const value = await native().availability();
      if (value !== 'available' && value !== 'unsupported') {
        return invalid();
      }
      return value;
    });
  },
  // Explicit user action only. Completion is not evidence of read permission;
  // listMedications() queries what the user actually made readable.
  requestMedicationAccess: () => call(() => native().requestMedicationAccess()),
  listMedications: () =>
    call(async () => {
      const items = await native().listMedications();
      if (!Array.isArray(items)) {
        return invalid();
      }
      return items.map((item: HealthMedication) => {
        if (
          !item ||
          !isConceptReference(item.conceptReference) ||
          typeof item.displayName !== 'string' ||
          !nullableString(item.nickname) ||
          !nullableString(item.form) ||
          typeof item.isArchived !== 'boolean' ||
          typeof item.hasSchedule !== 'boolean'
        ) {
          return invalid();
        }
        return {
          conceptReference: item.conceptReference,
          displayName: item.displayName,
          nickname: item.nickname,
          form: item.form,
          isArchived: item.isArchived,
          hasSchedule: item.hasSchedule,
        };
      });
    }),
  readDoseSnapshot: request =>
    call(async () => {
      if (
        !isIdentifier(request.baselineId) ||
        !isConceptReference(request.conceptReference)
      ) {
        throw new MedicationHealthError('invalid-input');
      }
      if (
        !isInstant(request.from) ||
        !isInstant(request.through) ||
        request.from > request.through
      ) {
        throw new MedicationHealthError('invalid-interval');
      }
      const snapshot: MedicationDoseSnapshot = await native().readDoseSnapshot(
        request,
      );
      if (
        !snapshot ||
        snapshot.baselineId !== request.baselineId ||
        snapshot.conceptReference !== request.conceptReference ||
        snapshot.from !== request.from ||
        snapshot.through !== request.through ||
        !['complete-query', 'limited'].includes(snapshot.coverage) ||
        !Array.isArray(snapshot.events)
      ) {
        return invalid();
      }
      let limited = snapshot.coverage === 'limited';
      const events = snapshot.events.map(event => {
        if (
          !event ||
          !isIdentifier(event.id) ||
          event.conceptReference !== request.conceptReference ||
          !isInstant(event.occurredAt) ||
          event.occurredAt <= request.from ||
          event.occurredAt > request.through ||
          (event.quantity !== null &&
            (typeof event.quantity !== 'number' ||
              !Number.isFinite(event.quantity))) ||
          !['count', 'unsupported'].includes(event.unit)
        ) {
          return invalid();
        }
        const logStatus = [
          'taken',
          'skipped',
          'notLogged',
          'snoozed',
          'notInteracted',
          'notificationNotSent',
        ].includes(event.logStatus)
          ? event.logStatus
          : 'unknown';
        limited ||=
          logStatus === 'unknown' ||
          (logStatus === 'taken' &&
            (event.unit !== 'count' ||
              event.quantity === null ||
              event.quantity < 0 ||
              event.quantity > Number.MAX_SAFE_INTEGER));
        return {
          id: event.id,
          conceptReference: request.conceptReference,
          occurredAt: event.occurredAt,
          quantity: event.quantity,
          unit: event.unit,
          logStatus,
        };
      });
      return {
        ...request,
        coverage: limited ? 'limited' : 'complete-query',
        events,
      };
    }),
  validateConceptReference: reference =>
    call(async () => {
      if ((await native().validateConceptReference(reference)) !== true) {
        throw new MedicationHealthError('malformed-identity');
      }
      return true;
    }),
  compareConceptReferences: (left, right) =>
    call(async () => {
      const equal = await native().compareConceptReferences(left, right);
      if (typeof equal !== 'boolean') {
        throw new MedicationHealthError('malformed-identity');
      }
      return equal;
    }),
};
