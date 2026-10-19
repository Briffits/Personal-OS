import * as ReactNative from 'react-native';
import AppCard from '../src/design-system/components/AppCard';
import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import { NativeMedicationStorage } from '../src/native/NativeMedicationStorage';
import { NativePrescriptionDocuments } from '../src/native/NativePrescriptionDocuments';
import {
  firstId,
  prescriptionId,
  medicationFixture,
} from '../test-utils/medicationFixture';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/native/NativeMedicationStorage', () => ({
  NativeMedicationStorage: { read: jest.fn(), mutate: jest.fn() },
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
let fixture: ReturnType<typeof medicationFixture>;
beforeEach(async () => {
  jest.clearAllMocks();
  fixture = medicationFixture();
  jest.mocked(NativeMedicationStorage.read).mockImplementation(fixture.read);
  jest
    .mocked(NativeMedicationStorage.mutate)
    .mockImplementation(fixture.mutate);
  jest
    .mocked(NativePrescriptionDocuments.read)
    .mockResolvedValue({ records: [], pendingCleanup: [] });
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
function card() {
  return screen.root.findByProps({ testID: `medication-card-${firstId}` });
}
function absent(label: string) {
  expect(
    screen.root.findAllByProps({ accessibilityLabel: label }),
  ).toHaveLength(0);
}

test('renders the four main destinations with Today selected', () => {
  for (const tab of ['Today', 'Ask', 'Capture', 'Library']) {
    expect(
      screen.root.findByProps({ accessibilityLabel: tab + ' tab' }).props
        .accessibilityState,
    ).toEqual({ selected: tab === 'Today' });
  }
});

test.each(['Medication', 'Prescriptions'])(
  '%s is independently reachable and returns to Library',
  async destination => {
    await press('Library tab');
    await press('Open ' + destination);
    expect(
      screen.root
        .findAllByProps({ accessibilityRole: 'header' })
        .some(node => node.props.children === destination),
    ).toBe(true);
    absent('Library tab');
    if (destination === 'Medication') {
      expect(card().props.accessibilityActions).toContainEqual({
        name: 'add',
        label: 'Add stock',
      });
      expect(NativeMedicationStorage.read).toHaveBeenCalledTimes(1);
      expect(NativePrescriptionDocuments.read).not.toHaveBeenCalled();
    } else {
      expect(NativeMedicationStorage.read).not.toHaveBeenCalled();
      expect(NativePrescriptionDocuments.read).toHaveBeenCalledTimes(1);
    }
    for (const [method, fn] of Object.entries(NativePrescriptionDocuments)) {
      if (method !== 'read') {
        expect(fn).not.toHaveBeenCalled();
      }
    }
    await press('Back to Library');
    await press('Today tab');
    absent('Open Medication');
  },
);

test('independent stock and names persist across navigation through Prescriptions', async () => {
  const prompt = jest.spyOn(Alert, 'prompt').mockImplementation(() => {});
  await press('Library tab');
  await press('Open Medication');
  await act(async () =>
    card().props.onAccessibilityAction({ nativeEvent: { actionName: 'add' } }),
  );
  const buttons = prompt.mock.calls[0][2] as {
    onPress: (value: string) => Promise<void>;
  }[];
  await act(async () => buttons[1].onPress('3'));
  await act(async () =>
    card().props.onAccessibilityAction({ nativeEvent: { actionName: 'edit' } }),
  );
  await act(async () =>
    screen.root
      .findByProps({ accessibilityLabel: 'Medication name (required)' })
      .props.onChangeText('Renamed example'),
  );
  await press('Save medication');
  await press('Back to Library');
  await press('Open Prescriptions');
  expect(JSON.stringify(screen.toJSON())).not.toContain('Recorded stock');
  await press('Back to Library');
  await press('Open Medication');
  expect(card().props.accessibilityLabel).toBe(
    'Renamed example, Recorded stock: 15 tablets',
  );
  expect(fixture.state().records[1].stock).toBeNull();
});

test('prescription deletion never deletes medications or their stock', async () => {
  await fixture.mutate(0, {
    type: 'edit',
    id: firstId,
    displayName: 'Example one',
    prescriptionId,
  });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(NativePrescriptionDocuments.read).mockResolvedValue({
    records: [
      {
        id: prescriptionId as never,
        documentId: firstId as never,
        displayName: 'Example prescription',
        kind: 'standard',
        expiresOn: '2028-01-01',
        medicationIds: [firstId],
      },
    ],
    pendingCleanup: [],
  });
  await press('Library tab');
  await press('Open Prescriptions');
  await act(async () =>
    screen.root
      .findByProps({ testID: `prescription-card-${prescriptionId}` })
      .props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }),
  );
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => buttons[1].onPress!());
  expect(NativePrescriptionDocuments.remove).toHaveBeenCalledTimes(1);
  expect(NativeMedicationStorage.read).toHaveBeenCalledTimes(1);
  expect(NativeMedicationStorage.mutate).toHaveBeenCalledWith(1, {
    type: 'unlinkPrescription',
    prescriptionId,
  });
  expect(fixture.state().records[0].stock).toBe(12);
  expect(fixture.state().records[0].prescriptionId).toBeNull();
});

test.each(['light', 'dark'] as const)(
  'status bar and priority cards follow %s appearance without changing destinations',
  async scheme => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme);
    await act(async () => screen.update(<App />));
    expect(screen.root.findByType(ReactNative.StatusBar).props.barStyle).toBe(
      scheme === 'dark' ? 'light-content' : 'dark-content',
    );
    for (const tab of ['Today', 'Ask', 'Capture']) {
      await press(tab + ' tab');
      const cards = screen.root.findAllByType(AppCard);
      expect(cards).toHaveLength(3);
      expect(cards.every(node => node.props.variant === 'attention')).toBe(
        true,
      );
    }
    await press('Library tab');
    expect(
      screen.root
        .findAllByType(AppCard)
        .every(node => node.props.variant !== 'attention'),
    ).toBe(true);
  },
);
