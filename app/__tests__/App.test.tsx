import * as ReactNative from 'react-native';
import AppCard from '../src/design-system/components/AppCard';
import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import { layout } from '../src/design-system';
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

function expectHeading(title: string) {
  expect(
    screen.root
      .findAllByType(ReactNative.Text)
      .filter(node => node.props.accessibilityRole === 'header')
      .map(node => node.props.children),
  ).toEqual([title]);
}

function expectNoNativeOperations() {
  // These are the app's native data boundaries, including document selection
  // and protected viewing (which can invoke biometric authentication).
  for (const boundary of [
    NativeMedicationStorage,
    NativePrescriptionDocuments,
  ]) {
    for (const operation of Object.values(boundary)) {
      expect(operation).not.toHaveBeenCalled();
    }
  }
}

test('renders the four main destinations with Today selected', () => {
  expectHeading('Personal OS');
  for (const tab of ['Today', 'Ask', 'Capture', 'Library']) {
    expect(
      screen.root.findByProps({ accessibilityLabel: tab + ' tab' }).props
        .accessibilityState,
    ).toEqual({ selected: tab === 'Today' });
  }
  expectNoNativeOperations();
});

test.each(['Ask', 'Capture'])(
  '%s has distinct unavailable content and returns through the main tabs',
  async destination => {
    await press(destination + ' tab');
    expectHeading(destination);
    expect(JSON.stringify(screen.toJSON())).toContain('Not available yet');
    expect(JSON.stringify(screen.toJSON())).not.toContain(
      'Your next priority will appear here',
    );
    expect(screen.root.findAllByType(ReactNative.TextInput)).toHaveLength(0);
    expect(
      screen.root.findByProps({ accessibilityLabel: destination + ' tab' })
        .props.accessibilityState,
    ).toEqual({ selected: true });
    await press('Library tab');
    expectHeading('Library');
    await press('Today tab');
    expectHeading('Personal OS');
    expectNoNativeOperations();
  },
);

test('Settings is a placeholder with a return to Today and no native operations', async () => {
  const openSettings = jest
    .spyOn(ReactNative.Linking, 'openSettings')
    .mockResolvedValue();
  const openURL = jest
    .spyOn(ReactNative.Linking, 'openURL')
    .mockResolvedValue();
  for (let visit = 0; visit < 2; visit += 1) {
    await press('Open Settings');
    expectHeading('Settings');
    expect(JSON.stringify(screen.toJSON())).toContain('Not available yet');
    expect(JSON.stringify(screen.toJSON())).toContain(
      'There are no settings to change in this version.',
    );
    expect(screen.root.findAllByType(ReactNative.TextInput)).toHaveLength(0);
    expect(screen.root.findAllByType(ReactNative.Switch)).toHaveLength(0);
    absent('Today tab');
    expect(
      screen.root
        .findAll(
          node =>
            typeof node.type === 'string' &&
            node.props.accessibilityRole === 'button',
        )
        .map(node => node.props.accessibilityLabel),
    ).toEqual(['Back to Today']);
    await press('Back to Today');
    expectHeading('Personal OS');
    expect(
      screen.root.findByProps({ accessibilityLabel: 'Today tab' }).props
        .accessibilityState,
    ).toEqual({ selected: true });
  }
  await press('Ask tab');
  await press('Capture tab');
  await press('Today tab');
  expectNoNativeOperations();
  expect(openSettings).not.toHaveBeenCalled();
  expect(openURL).not.toHaveBeenCalled();
});

test('shell navigation stays in memory and a fresh app starts on Today', async () => {
  await press('Open Settings');
  await act(async () => screen.unmount());
  await act(async () => {
    screen = ReactTestRenderer.create(<App />);
  });
  expectHeading('Personal OS');
  absent('Back to Today');
  expectNoNativeOperations();
});

test('new shell controls retain minimum targets and uncapped text on a small screen', async () => {
  jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
    width: 320,
    height: 568,
    scale: 2,
    fontScale: 3,
  });
  await act(async () => screen.update(<App />));
  function expectTouchTarget(label: string) {
    const button = screen.root.findByProps({ accessibilityLabel: label });
    const style = ReactNative.StyleSheet.flatten(button.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(layout.minimumTouchTarget);
    expect(style.minWidth).toBeGreaterThanOrEqual(layout.minimumTouchTarget);
  }
  function expectScalableContent() {
    expect(screen.root.findAllByType(ReactNative.ScrollView)).toHaveLength(1);
    for (const text of screen.root.findAllByType(ReactNative.Text)) {
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.maxFontSizeMultiplier).toBeUndefined();
      expect(text.props.numberOfLines).toBeUndefined();
    }
  }
  expectTouchTarget('Open Settings');
  expectScalableContent();
  await press('Open Settings');
  expectTouchTarget('Back to Today');
  expectScalableContent();
  await press('Back to Today');
  for (const destination of ['Ask', 'Capture']) {
    await press(destination + ' tab');
    expectScalableContent();
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
    const priorityCards = screen.root.findAllByType(AppCard);
    expect(priorityCards).toHaveLength(3);
    expect(
      priorityCards.every(node => node.props.variant === 'attention'),
    ).toBe(true);
    await press('Open Settings');
    expect(screen.root.findAllByType(AppCard)).toHaveLength(1);
    expect(screen.root.findByType(AppCard).props.variant).not.toBe('attention');
    await press('Back to Today');
    for (const tab of ['Ask', 'Capture']) {
      await press(tab + ' tab');
      const cards = screen.root.findAllByType(AppCard);
      expect(cards).toHaveLength(1);
      expect(cards.every(node => node.props.variant !== 'attention')).toBe(
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
