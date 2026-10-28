import { NativeModules, Platform } from 'react-native';

export type HealthMedication = {
  name: string;
  nickname?: string;
  isArchived: boolean;
};
export type HealthMedicationsService = {
  appDisplayName: string;
  requestAccess(): Promise<void>;
  read(): Promise<HealthMedication[]>;
};
export class HealthMedicationsError extends Error {
  constructor(readonly kind: 'unavailable' | 'busy' | 'error') {
    super(kind);
  }
}
function bridge() {
  const value = Platform.OS === 'ios' && NativeModules.HealthMedications;
  if (
    !value ||
    typeof value.readMedications !== 'function' ||
    typeof value.requestAccess !== 'function'
  ) {
    throw new HealthMedicationsError('unavailable');
  }
  return value;
}
function sanitized(error: unknown): HealthMedicationsError {
  if (error instanceof HealthMedicationsError) {
    return error;
  }
  const code = (error as { code?: unknown } | null)?.code;
  return new HealthMedicationsError(
    code === 'health-unavailable'
      ? 'unavailable'
      : code === 'health-busy'
      ? 'busy'
      : 'error',
  );
}
export const NativeHealthMedications: HealthMedicationsService = {
  get appDisplayName() {
    const name: unknown = NativeModules.HealthMedications?.appDisplayName;
    return typeof name === 'string' && name.trim()
      ? name
      : 'this app (use its name from the Home Screen)';
  },
  async requestAccess() {
    try {
      await bridge().requestAccess();
    } catch (error) {
      throw sanitized(error);
    }
  },
  async read() {
    try {
      const rows: unknown = await bridge().readMedications();
      if (
        !Array.isArray(rows) ||
        !rows.every(
          row =>
            row &&
            typeof row.name === 'string' &&
            typeof row.isArchived === 'boolean' &&
            (row.nickname === undefined || typeof row.nickname === 'string'),
        )
      ) {
        throw new HealthMedicationsError('error');
      }
      return rows.map(({ name, nickname, isArchived }) => ({
        name,
        nickname,
        isArchived,
      }));
    } catch (error) {
      throw sanitized(error);
    }
  },
};
