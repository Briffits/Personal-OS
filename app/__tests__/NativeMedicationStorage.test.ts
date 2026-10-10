import { NativeModules } from 'react-native';
import { NativeMedicationStorage } from '../src/native/NativeMedicationStorage';
import { firstId, initialCollection } from '../test-utils/medicationFixture';

afterEach(() => {
  delete NativeModules.MedicationStorage;
});
test('missing native module fails without fabricating persistence', async () => {
  await expect(NativeMedicationStorage.read()).rejects.toMatchObject({
    code: 'unavailable',
  });
});
test('read and mutation preserve all public fields and forward revision', async () => {
  const state = initialCollection();
  NativeModules.MedicationStorage = {
    read: jest.fn(async () => state),
    mutate: jest.fn(async () => state),
  };
  expect(await NativeMedicationStorage.read()).toEqual(state);
  const command = { type: 'setStock' as const, id: firstId, stock: 0 };
  expect(await NativeMedicationStorage.mutate(4, command)).toEqual(state);
  expect(NativeModules.MedicationStorage.mutate).toHaveBeenCalledWith(
    4,
    command,
  );
});
test('corrupt or incomplete response rejects and errors propagate', async () => {
  NativeModules.MedicationStorage = {
    read: jest.fn(async () => ({})),
    mutate: jest.fn(async () => ({})),
  };
  await expect(NativeMedicationStorage.read()).rejects.toMatchObject({
    code: 'invalid-record',
  });
  await expect(
    NativeMedicationStorage.mutate(0, { type: 'remove', id: firstId }),
  ).rejects.toMatchObject({ code: 'invalid-record' });
  NativeModules.MedicationStorage.read.mockRejectedValue({
    code: 'read-failed',
  });
  await expect(NativeMedicationStorage.read()).rejects.toEqual({
    code: 'read-failed',
  });
});
