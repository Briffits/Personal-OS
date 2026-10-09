import * as Keychain from 'react-native-keychain';

const MEDICATION_STOCK_SERVICE = 'com.personalos.medication-stock';
const MEDICATION_STOCK_USERNAME = 'estimated-stock';

type StockErrorCode =
  | 'invalid-input'
  | 'invalid-record'
  | 'read-failed'
  | 'write-failed';

export class MedicationStockError extends Error {
  constructor(readonly code: StockErrorCode) {
    super(`Medication stock ${code}.`);
    this.name = 'MedicationStockError';
  }
}

function isStockCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export async function saveMedicationStock(
  estimatedStock: number,
): Promise<void> {
  if (!isStockCount(estimatedStock)) {
    throw new MedicationStockError('invalid-input');
  }
  try {
    const result = await Keychain.setGenericPassword(
      MEDICATION_STOCK_USERNAME,
      JSON.stringify({ estimatedStock }),
      {
        service: MEDICATION_STOCK_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );
    if (result === false) {
      throw new Error('Write failed');
    }
  } catch {
    throw new MedicationStockError('write-failed');
  }
}

export async function loadMedicationStock(): Promise<number | null> {
  let credentials;
  try {
    credentials = await Keychain.getGenericPassword({
      service: MEDICATION_STOCK_SERVICE,
    });
  } catch {
    throw new MedicationStockError('read-failed');
  }
  // Only an explicitly absent Keychain entry means stock has not been recorded.
  if (credentials === false) {
    return null;
  }
  try {
    const record: unknown = JSON.parse(credentials.password);
    if (
      typeof record !== 'object' ||
      record === null ||
      Array.isArray(record) ||
      !('estimatedStock' in record) ||
      !isStockCount(record.estimatedStock)
    ) {
      throw new Error('Invalid record');
    }
    return record.estimatedStock;
  } catch {
    throw new MedicationStockError('invalid-record');
  }
}

export async function clearMedicationStock(): Promise<void> {
  await Keychain.resetGenericPassword({ service: MEDICATION_STOCK_SERVICE });
}
