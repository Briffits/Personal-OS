import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import {
  loadMedicationName,
  saveMedicationName,
} from '../src/storage/medicationNameStorage';
import {
  loadMedicationStock,
  saveMedicationStock,
} from '../src/storage/medicationStockStorage';
import { NativePrescriptionDocuments } from '../src/native/NativePrescriptionDocuments';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/storage/medicationStockStorage', () => ({
  loadMedicationStock: jest.fn(),
  saveMedicationStock: jest.fn(),
}));
jest.mock('../src/storage/medicationNameStorage', () => ({
  DEFAULT_MEDICATION_NAME: 'Medication A',
  loadMedicationName: jest.fn(),
  saveMedicationName: jest.fn(),
}));
jest.mock('../src/native/NativePrescriptionDocuments', () => ({
  NativePrescriptionDocuments: {
    read: jest.fn(),
    select: jest.fn(),
    create: jest.fn(),
    replace: jest.fn(),
    remove: jest.fn(),
    updateMetadata: jest.fn(),
    migrateLegacy: jest.fn(),
    cleanup: jest.fn(),
    release: jest.fn(),
    open: jest.fn(),
  },
}));

let screen: ReactTestRenderer.ReactTestRenderer;
const loadStock = jest.mocked(loadMedicationStock);
const saveStock = jest.mocked(saveMedicationStock);

beforeEach(async () => {
  jest.clearAllMocks();
  jest
    .mocked(NativePrescriptionDocuments.read)
    .mockResolvedValue({ records: [], pendingCleanup: [] });
  loadStock.mockReset().mockResolvedValue(12);
  jest.mocked(loadMedicationName).mockReset().mockResolvedValue('Medication A');
  jest.mocked(saveMedicationName).mockReset().mockResolvedValue(undefined);
  saveStock.mockReset().mockResolvedValue(undefined);
  await act(async () => {
    screen = ReactTestRenderer.create(<App />);
  });
});

afterEach(async () => {
  await act(async () => screen.unmount());
  jest.restoreAllMocks();
});

async function press(label: string) {
  await act(async () =>
    screen.root.findByProps({ accessibilityLabel: label }).props.onPress(),
  );
}

function expectAbsent(label: string) {
  expect(
    screen.root.findAllByProps({ accessibilityLabel: label }),
  ).toHaveLength(0);
}

test('renders the existing four main destinations with Today selected', () => {
  for (const tab of ['Today', 'Ask', 'Capture', 'Library']) {
    expect(
      screen.root.findByProps({ accessibilityLabel: tab + ' tab' }).props
        .accessibilityState,
    ).toEqual({ selected: tab === 'Today' });
  }
});

test.each(['Medication', 'Prescriptions'])(
  '%s is independently reachable from Library and returns to Library',
  async destination => {
    await press('Library tab');
    expect(
      screen.root.findByProps({ accessibilityLabel: 'Open Medication' }),
    ).toBeDefined();
    expect(
      screen.root.findByProps({ accessibilityLabel: 'Open Prescriptions' }),
    ).toBeDefined();
    await press('Open ' + destination);
    expect(
      screen.root
        .findAllByProps({ accessibilityRole: 'header' })
        .some(node => node.props.children === destination),
    ).toBe(true);
    expectAbsent('Library tab');
    if (destination === 'Medication') {
      for (const label of ['Add stock', 'More stock actions']) {
        expectAbsent(label);
      }
      expect(
        screen.root.findByProps({ testID: 'medication-summary' }).props
          .accessibilityActions,
      ).toContainEqual({ name: 'add', label: 'Add stock' });
      expectAbsent('View Prescription');
      expectAbsent('Replace Prescription');
      expect(loadStock).toHaveBeenCalledTimes(1);
    } else {
      expect(
        screen.root.findByProps({ accessibilityLabel: 'Add prescription' }),
      ).toBeDefined();
      expectAbsent('Add stock');
      expectAbsent('More stock actions');
      expect(loadStock).not.toHaveBeenCalled();
    }
    for (const [name, method] of Object.entries(NativePrescriptionDocuments)) {
      if (name !== 'read') {
        expect(method).not.toHaveBeenCalled();
      }
    }
    expect(NativePrescriptionDocuments.read).toHaveBeenCalledTimes(
      destination === 'Prescriptions' ? 1 : 0,
    );
    await press('Back to Library');
    expect(
      screen.root.findByProps({ accessibilityLabel: 'Library tab' }).props
        .accessibilityState,
    ).toEqual({ selected: true });
    await press('Today tab');
    expectAbsent('Open Medication');
    expect(
      screen.root.findByProps({ accessibilityLabel: 'Today tab' }).props
        .accessibilityState,
    ).toEqual({ selected: true });
  },
);

test('saved stock reloads after visiting Prescriptions and returning to Medication', async () => {
  let persistedStock = 12;
  loadStock.mockImplementation(async () => persistedStock);
  saveStock.mockImplementation(async amount => {
    persistedStock = amount;
  });
  const prompt = jest.spyOn(Alert, 'prompt').mockImplementation(() => {});
  await press('Library tab');
  await press('Open Medication');
  await act(async () =>
    screen.root
      .findByProps({ testID: 'medication-summary' })
      .props.onAccessibilityAction({ nativeEvent: { actionName: 'add' } }),
  );
  const buttons = prompt.mock.calls[0][2] as {
    onPress?: (value: string) => void;
  }[];
  await act(async () => buttons[1].onPress!('3'));
  expect(saveStock).toHaveBeenCalledWith(15);
  await press('Back to Library');
  await press('Open Prescriptions');
  expect(JSON.stringify(screen.toJSON())).not.toContain('Recorded stock');
  await press('Back to Library');
  await press('Open Medication');
  expect(loadStock).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(screen.toJSON())).toContain(
    'Recorded stock: 15 tablets',
  );
});

test('renamed medication reloads after leaving and preserves recorded stock', async () => {
  let persistedName = 'Medication A';
  jest.mocked(loadMedicationName).mockImplementation(async () => persistedName);
  jest.mocked(saveMedicationName).mockImplementation(async name => {
    persistedName = name;
  });
  const prompt = jest.spyOn(Alert, 'prompt').mockImplementation(() => {});
  await press('Library tab');
  await press('Open Medication');
  await act(async () =>
    screen.root
      .findByProps({ testID: 'medication-summary' })
      .props.onAccessibilityAction({ nativeEvent: { actionName: 'rename' } }),
  );
  const buttons = prompt.mock.calls[0][2] as {
    onPress?: (value: string) => void;
  }[];
  await act(async () => buttons[1].onPress!('Example medication'));
  await press('Back to Library');
  await press('Open Medication');
  expect(
    screen.root.findByProps({ testID: 'medication-summary' }).props
      .accessibilityLabel,
  ).toBe('Example medication, Recorded stock: 12 tablets');
  expect(saveStock).not.toHaveBeenCalled();
});
