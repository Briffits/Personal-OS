import * as Keychain from 'react-native-keychain';

const MEDICATION_STOCK_SERVICE = 'com.personalos.medication-stock';
const MEDICATION_STOCK_USERNAME = 'estimated-stock';

type MedicationStockRecord = {
  estimatedStock: number;
};

export async function saveMedicationStock(
  estimatedStock: number,
): Promise<void> {
  const record: MedicationStockRecord = {
    estimatedStock,
  };

  await Keychain.setGenericPassword(
    MEDICATION_STOCK_USERNAME,
    JSON.stringify(record),
    {
      service: MEDICATION_STOCK_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
  );
}

export async function loadMedicationStock(): Promise<number | null> {
  const credentials = await Keychain.getGenericPassword({
    service: MEDICATION_STOCK_SERVICE,
  });

  if (!credentials) {
    return null;
  }

  try {
    const record = JSON.parse(
      credentials.password,
    ) as Partial<MedicationStockRecord>;

    if (
      typeof record.estimatedStock !== 'number' ||
      !Number.isInteger(record.estimatedStock) ||
      record.estimatedStock < 0
    ) {
      return null;
    }

    return record.estimatedStock;
  } catch {
    return null;
  }
}

export async function clearMedicationStock(): Promise<void> {
  await Keychain.resetGenericPassword({
    service: MEDICATION_STOCK_SERVICE,
  });
}
