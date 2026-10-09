import * as Keychain from 'react-native-keychain';
import {
  clearMedicationStock,
  loadMedicationStock,
  saveMedicationStock,
  MedicationStockError,
} from '../src/storage/medicationStockStorage';

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(),
  setGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
  STORAGE_TYPE: { AES_GCM: 'KeystoreAESGCM' },
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly' },
}));
const read = jest.mocked(Keychain.getGenericPassword);
const write = jest.mocked(Keychain.setGenericPassword);
const clear = jest.mocked(Keychain.resetGenericPassword);
const service = 'com.personalos.medication-stock';

beforeEach(() => {
  read.mockReset().mockResolvedValue(false);
  write
    .mockReset()
    .mockResolvedValue({ service, storage: Keychain.STORAGE_TYPE.AES_GCM });
  clear.mockReset().mockResolvedValue(true);
});
function stored(password: string) {
  read.mockResolvedValue({
    username: 'estimated-stock',
    password,
    service,
    storage: Keychain.STORAGE_TYPE.AES_GCM,
  });
}
test('only absent credentials mean unrecorded stock', async () => {
  await expect(loadMedicationStock()).resolves.toBeNull();
  expect(read).toHaveBeenCalledWith({ service });
  expect(write).not.toHaveBeenCalled();
});
test.each([0, 12, Number.MAX_SAFE_INTEGER])(
  'reads existing format count %s without rewriting',
  async count => {
    stored(JSON.stringify({ estimatedStock: count }));
    await expect(loadMedicationStock()).resolves.toBe(count);
    expect(write).not.toHaveBeenCalled();
  },
);
test.each([
  'broken',
  'null',
  '[]',
  '12',
  '"12"',
  '{}',
  '{"estimatedStock":"12"}',
  '{"estimatedStock":null}',
  '{"estimatedStock":-1}',
  '{"estimatedStock":1.5}',
  '{"estimatedStock":9007199254740992}',
  '{"estimatedStock":1e400}',
])(
  'invalid persisted record %p rejects without altering storage',
  async password => {
    stored(password);
    await expect(loadMedicationStock()).rejects.toMatchObject({
      name: 'MedicationStockError',
      code: 'invalid-record',
    });
    expect(write).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  },
);
test('read failure is distinct from invalid data and hides native details', async () => {
  read.mockRejectedValue(new Error('Sensitive native details'));
  await expect(loadMedicationStock()).rejects.toEqual(
    new MedicationStockError('read-failed'),
  );
});
test.each([0, 12, Number.MAX_SAFE_INTEGER])(
  'saves valid count %s with existing format and protection',
  async count => {
    await saveMedicationStock(count);
    expect(write).toHaveBeenCalledWith(
      'estimated-stock',
      JSON.stringify({ estimatedStock: count }),
      {
        service,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );
  },
);
test.each([-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid write %s before native mutation',
  async count => {
    await expect(saveMedicationStock(count)).rejects.toMatchObject({
      code: 'invalid-input',
    });
    expect(write).not.toHaveBeenCalled();
  },
);
test('native false write result is not success', async () => {
  write.mockResolvedValue(false);
  await expect(saveMedicationStock(12)).rejects.toMatchObject({
    code: 'write-failed',
  });
});
test('native write rejection is sanitised', async () => {
  write.mockRejectedValue(new Error('Sensitive native details'));
  await expect(saveMedicationStock(12)).rejects.toEqual(
    new MedicationStockError('write-failed'),
  );
});
test('clear keeps using the existing isolated Keychain service', async () => {
  await clearMedicationStock();
  expect(clear).toHaveBeenCalledWith({ service });
});
