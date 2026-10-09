import * as Keychain from 'react-native-keychain';
import {
  DEFAULT_MEDICATION_NAME,
  loadMedicationName,
  saveMedicationName,
} from '../src/storage/medicationNameStorage';
import {
  loadMedicationStock,
  saveMedicationStock,
} from '../src/storage/medicationStockStorage';

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(),
  setGenericPassword: jest.fn(),
  STORAGE_TYPE: { AES_GCM: 'KeystoreAESGCM' },
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly' },
}));
const read = jest.mocked(Keychain.getGenericPassword);
const write = jest.mocked(Keychain.setGenericPassword);
const service = 'com.personalos.medication-name';

beforeEach(() => {
  read.mockReset().mockResolvedValue(false);
  write
    .mockReset()
    .mockResolvedValue({ service, storage: Keychain.STORAGE_TYPE.AES_GCM });
});

test('absent name uses the legacy display name without writing', async () => {
  await expect(loadMedicationName()).resolves.toBe(DEFAULT_MEDICATION_NAME);
  expect(read).toHaveBeenCalledWith({ service });
  expect(write).not.toHaveBeenCalled();
});

test('name and stock survive independent writes and reloads', async () => {
  const entries = new Map<string, { username: string; password: string }>();
  read.mockImplementation(async options => {
    const entry = entries.get(options!.service!);
    return entry
      ? {
          ...entry,
          service: options!.service!,
          storage: Keychain.STORAGE_TYPE.AES_GCM,
        }
      : false;
  });
  write.mockImplementation(async (username, password, options) => {
    entries.set(options!.service!, { username, password });
    return {
      service: options!.service!,
      storage: Keychain.STORAGE_TYPE.AES_GCM,
    };
  });
  await saveMedicationStock(12);
  await saveMedicationName('  Example medication  ');
  await expect(loadMedicationStock()).resolves.toBe(12);
  await expect(loadMedicationName()).resolves.toBe('Example medication');
  await saveMedicationStock(15);
  await expect(loadMedicationName()).resolves.toBe('Example medication');
  await saveMedicationName('Renamed example');
  await expect(loadMedicationStock()).resolves.toBe(15);
  expect(write).toHaveBeenCalledWith('medication-name', 'Example medication', {
    service,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
});

test('renaming before stock exists does not establish stock', async () => {
  await saveMedicationName('Example medication');
  await expect(loadMedicationStock()).resolves.toBeNull();
  expect(write.mock.calls.every(call => call[2]?.service === service)).toBe(
    true,
  );
});

test.each(['', '   '])('rejects blank name %p without writing', async name => {
  await expect(saveMedicationName(name)).rejects.toThrow(
    'Invalid medication name',
  );
  expect(write).not.toHaveBeenCalled();
});

test.each(['', '  '])('rejects invalid stored name %p', async password => {
  read.mockResolvedValue({
    username: 'medication-name',
    password,
    service,
    storage: Keychain.STORAGE_TYPE.AES_GCM,
  });
  await expect(loadMedicationName()).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
});

test('read errors do not become an absent name', async () => {
  read.mockRejectedValue(new Error('Unavailable'));
  await expect(loadMedicationName()).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
});

test('false or rejected writes fail', async () => {
  write
    .mockResolvedValueOnce(false)
    .mockRejectedValueOnce(new Error('Unavailable'));
  await expect(saveMedicationName('Example')).rejects.toThrow();
  await expect(saveMedicationName('Example')).rejects.toThrow();
});
