import React from 'react';
import {Alert} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import PrescriptionWalletScreen from '../src/screens/PrescriptionWalletScreen';
import {NativePrescriptionDocuments} from '../src/native/NativePrescriptionDocuments';
import {loadMedicationStock, saveMedicationStock} from '../src/storage/medicationStockStorage';
import type {PrescriptionCandidateId, PrescriptionId} from '../src/prescriptions/currentPrescriptionService';

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/native/NativePrescriptionDocuments', () => ({
  NativePrescriptionDocuments: {
    read: jest.fn(),
    select: jest.fn(),
    commit: jest.fn(),
    cleanup: jest.fn(),
    release: jest.fn(),
    open: jest.fn(),
  },
}));
jest.mock('../src/storage/medicationStockStorage', () => ({
  loadMedicationStock: jest.fn(),
  saveMedicationStock: jest.fn(),
}));

const native = jest.mocked(NativePrescriptionDocuments);
const current = 'test-current' as PrescriptionId;
const next = 'test-next' as PrescriptionId;
const candidate = 'test-candidate' as PrescriptionCandidateId;
let screen: ReactTestRenderer.ReactTestRenderer;
let alert: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  for (const method of Object.values(native)) {
    method.mockReset();
  }
  native.read.mockResolvedValue({current, pendingCleanup: null});
  native.select.mockResolvedValue(candidate);
  native.commit.mockResolvedValue(next);
  native.open.mockResolvedValue(undefined);
  native.cleanup.mockResolvedValue(undefined);
  native.release.mockResolvedValue(undefined);
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(async () => {
    screen = ReactTestRenderer.create(<PrescriptionWalletScreen onBack={() => {}} />);
  });
});

afterEach(async () => {
  await act(async () => screen.unmount());
  jest.restoreAllMocks();
});

async function press(label: string) {
  await act(async () => screen.root.findByProps({accessibilityLabel: label}).props.onPress());
}

test('shows only prescription controls and does no stock or document work on entry', () => {
  for (const label of ['View Prescription', 'Replace Prescription']) {
    expect(screen.root.findByProps({accessibilityLabel: label})).toBeDefined();
  }
  for (const label of ['Add Stock', 'Correct Stock']) {
    expect(screen.root.findAllByProps({accessibilityLabel: label})).toHaveLength(0);
  }
  expect(JSON.stringify(screen.toJSON())).not.toContain('Medication A');
  expect(loadMedicationStock).not.toHaveBeenCalled();
  expect(saveMedicationStock).not.toHaveBeenCalled();
  for (const method of Object.values(native)) {
    expect(method).not.toHaveBeenCalled();
  }
});

test('view delegates each request to the existing native protected viewer', async () => {
  await press('View Prescription');
  await press('View Prescription');
  expect(native.open.mock.calls).toEqual([[current], [current]]);
  expect(native.select).not.toHaveBeenCalled();
});

test('empty wallet imports through the existing native workflow', async () => {
  native.read.mockResolvedValue({current: null, pendingCleanup: null});
  await press('View Prescription');
  expect(native.open).not.toHaveBeenCalled();
  expect(native.select).toHaveBeenCalledTimes(1);
  expect(native.commit).toHaveBeenCalledWith(candidate);
  expect(native.release).toHaveBeenCalledWith(candidate);
  expect(alert).toHaveBeenCalledWith('Prescription saved', 'Your prescription is now stored in Personal OS.');
});

test('cancelled document selection leaves the wallet unchanged', async () => {
  native.read.mockResolvedValue({current: null, pendingCleanup: null});
  native.select.mockResolvedValue(null);
  await press('View Prescription');
  expect(native.commit).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
});

test.each([false, true])('replacement requires explicit confirmation: %p', async confirm => {
  alert.mockImplementation((title, _message, buttons) => {
    if (title === 'Replace Prescription') {
      expect(native.commit).not.toHaveBeenCalled();
      buttons[confirm ? 1 : 0].onPress();
    }
  });
  await press('Replace Prescription');
  expect(alert.mock.calls[0][0]).toBe('Replace Prescription');
  if (confirm) {
    expect(native.commit).toHaveBeenCalledWith(candidate);
    expect(native.cleanup).toHaveBeenCalledTimes(1);
  } else {
    expect(native.commit).not.toHaveBeenCalled();
    expect(native.cleanup).not.toHaveBeenCalled();
  }
  expect(native.release).toHaveBeenCalledWith(candidate);
});

test('authentication cancellation does not import, replace or show an error', async () => {
  native.open.mockRejectedValue({code: 'prescription_documents_authentication_cancelled'});
  await press('View Prescription');
  expect(native.select).not.toHaveBeenCalled();
  expect(native.commit).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
});

test('authentication failure shows the existing generic error without importing', async () => {
  native.open.mockRejectedValue({code: 'prescription_documents_authentication_failed'});
  await press('View Prescription');
  expect(native.select).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('Unable to open prescription', 'Personal OS could not access the prescription wallet.');
});
