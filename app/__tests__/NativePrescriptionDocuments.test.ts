import { NativeModules } from 'react-native';
import {
  NativePrescriptionDocuments as boundary,
  PrescriptionDocumentsBoundaryError,
} from '../src/native/NativePrescriptionDocuments';
import type {
  PrescriptionCandidateId,
  PrescriptionId,
} from '../src/prescriptions/currentPrescriptionService';

const candidate = ' test-candidate\t' as PrescriptionCandidateId;
const current = '\n test-current ' as PrescriptionId;
const originalModule = NativeModules.PrescriptionDocuments;
const methods = ['select', 'commit', 'read', 'cleanup', 'release', 'open'] as const;

function installNativeMock() {
  const native = {
    select: jest.fn().mockResolvedValue(candidate),
    commit: jest.fn().mockResolvedValue(current),
    read: jest.fn().mockResolvedValue({ current, pendingCleanup: null }),
    cleanup: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    open: jest.fn().mockResolvedValue(undefined),
  };
  NativeModules.PrescriptionDocuments = native;
  return native;
}

const operations = [
  () => boundary.select(),
  () => boundary.commit(candidate),
  () => boundary.read(),
  () => boundary.cleanup(),
  () => boundary.release(candidate),
  () => boundary.open(current),
];

afterEach(() => {
  NativeModules.PrescriptionDocuments = originalModule;
});

test.each([undefined, null, {}])('unavailable module: %p', async native => {
  NativeModules.PrescriptionDocuments = native;
  for (const operation of operations) {
    await expect(operation()).rejects.toBeInstanceOf(PrescriptionDocumentsBoundaryError);
    await expect(operation()).rejects.toMatchObject({ code: 'unavailable' });
  }
});

test.each(methods)('incomplete module missing %s rejects before delegation', async method => {
  const native = installNativeMock();
  NativeModules.PrescriptionDocuments = { ...native, [method]: undefined };
  for (const operation of operations) {
    await expect(operation()).rejects.toMatchObject({ code: 'unavailable' });
  }
  for (const mock of Object.values(native)) {
    expect(mock).not.toHaveBeenCalled();
  }
});

test('delegates explicit operations and preserves identifiers unchanged', async () => {
  const native = installNativeMock();
  await expect(boundary.select()).resolves.toBe(candidate);
  await expect(boundary.commit(candidate)).resolves.toBe(current);
  expect(native.cleanup).not.toHaveBeenCalled();
  expect(native.release).not.toHaveBeenCalled();
  await boundary.cleanup();
  await boundary.release(candidate);
  await boundary.open(current);
  expect(native.select.mock.calls).toEqual([[]]);
  expect(native.commit.mock.calls).toEqual([[candidate]]);
  expect(native.cleanup.mock.calls).toEqual([[]]);
  expect(native.release.mock.calls).toEqual([[candidate]]);
  expect(native.open.mock.calls).toEqual([[current]]);
});

test('selection cancellation returns null without other operations', async () => {
  const native = installNativeMock();
  native.select.mockResolvedValue(null);
  await expect(boundary.select()).resolves.toBeNull();
  expect(native.commit).not.toHaveBeenCalled();
  expect(native.release).not.toHaveBeenCalled();
});

test.each([
  { current: null, pendingCleanup: null },
  { current, pendingCleanup: null },
  { current, pendingCleanup: ' test-superseded\n' },
])('accepts valid state without transforming IDs: %p', async state => {
  const native = installNativeMock();
  native.read.mockResolvedValue(state);
  await expect(boundary.read()).resolves.toEqual(state);
  expect(native.read.mock.calls).toEqual([[]]);
});

const malformedIdentifiers = [undefined, '', ' ', '\t\n\r', '\u00a0', 42, false, {}, [], ['id']];

async function expectInvalid(response: Promise<unknown>) {
  await expect(response).rejects.toBeInstanceOf(PrescriptionDocumentsBoundaryError);
  await expect(response).rejects.toMatchObject({
    code: 'invalid-response',
    message: 'Prescription document handling returned an invalid response.',
  });
}

test.each(malformedIdentifiers)('rejects malformed selection: %p', async value => {
  installNativeMock().select.mockResolvedValue(value);
  await expectInvalid(boundary.select());
});

test.each([null, ...malformedIdentifiers])('rejects malformed commit: %p', async value => {
  installNativeMock().commit.mockResolvedValue(value);
  await expectInvalid(boundary.commit(candidate));
});

test.each([
  undefined, null, 'state', 42, false, [], {},
  { current: null },
  { pendingCleanup: null },
  { current: null, pendingCleanup: 'superseded' },
  ...malformedIdentifiers.map(value => ({ current: value, pendingCleanup: null })),
  ...malformedIdentifiers.map(value => ({ current, pendingCleanup: value })),
  ...malformedIdentifiers.map(value => ({ current: null, pendingCleanup: value })),
])('rejects malformed state: %p', async value => {
  installNativeMock().read.mockResolvedValue(value);
  await expectInvalid(boundary.read());
});

test.each([null, current])('additional native fields do not escape: %p', async id => {
  const native = installNativeMock();
  native.read.mockResolvedValue({ current: id, pendingCleanup: null, extra: 'ignored' });
  await expect(boundary.read()).resolves.toEqual({ current: id, pendingCleanup: null });
});

test('looks up native module lazily and does not cache state', async () => {
  const first = installNativeMock();
  await expect(boundary.read()).resolves.toEqual({ current, pendingCleanup: null });
  const second = installNativeMock();
  second.read.mockResolvedValue({ current: null, pendingCleanup: null });
  await expect(boundary.read()).resolves.toEqual({ current: null, pendingCleanup: null });
  expect(first.read).toHaveBeenCalledTimes(1);
  second.read.mockResolvedValue(undefined);
  await expectInvalid(boundary.read());
});

test.each(['cleanup', 'release', 'open'] as const)('validates void %s results', async method => {
  const native = installNativeMock();
  const operation = () => method === 'cleanup'
    ? boundary.cleanup()
    : method === 'release' ? boundary.release(candidate) : boundary.open(current);
  for (const value of [null, undefined]) {
    native[method].mockResolvedValue(value);
    await expect(operation()).resolves.toBeUndefined();
  }
  for (const value of [false, 0, '', {}, []]) {
    native[method].mockResolvedValue(value);
    await expectInvalid(operation());
  }
});

test('propagates genuine native operation failures unchanged', async () => {
  const native = installNativeMock();
  const failure = new Error('Native operation failed');
  for (const method of Object.values(native)) {
    method.mockRejectedValue(failure);
  }
  for (const operation of operations) {
    await expect(operation()).rejects.toBe(failure);
  }
});
