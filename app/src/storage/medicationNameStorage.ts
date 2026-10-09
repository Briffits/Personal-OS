import * as Keychain from 'react-native-keychain';

const MEDICATION_NAME_SERVICE = 'com.personalos.medication-name';
export const DEFAULT_MEDICATION_NAME = 'Medication A';

// Keep the single medication's name independent of its existing stock entry.
export async function loadMedicationName(): Promise<string> {
  const credentials = await Keychain.getGenericPassword({
    service: MEDICATION_NAME_SERVICE,
  });
  if (credentials === false) {
    return DEFAULT_MEDICATION_NAME;
  }
  if (
    typeof credentials.password !== 'string' ||
    !credentials.password.trim()
  ) {
    throw new Error('Invalid medication name record.');
  }
  return credentials.password.trim();
}

export async function saveMedicationName(name: string): Promise<void> {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Invalid medication name.');
  }
  const result = await Keychain.setGenericPassword(
    'medication-name',
    name.trim(),
    {
      service: MEDICATION_NAME_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
  );
  if (result === false) {
    throw new Error('Unable to save medication name.');
  }
}
