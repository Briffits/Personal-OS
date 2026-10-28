import React from 'react';
import * as RN from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import HealthMedicationsScreen from '../src/screens/HealthMedicationsScreen';
import { deferred } from '../test-utils/remindersFixture';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
let screen: Renderer.ReactTestRenderer;
let change: (state: RN.AppStateStatus) => void;
let native: {
  appDisplayName: string;
  requestAccess: jest.Mock;
  readMedications: jest.Mock;
};
const rows = [
  {
    name: 'Synthetic medication A',
    nickname: 'Synthetic nickname',
    isArchived: false,
  },
];
beforeEach(() => {
  jest.useFakeTimers();
  RN.AppState.currentState = 'active';
  jest
    .spyOn(RN.AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      change = listener;
      return { remove: jest.fn() };
    });
  native = {
    appDisplayName: 'PersonalOS Health Test',
    requestAccess: jest.fn().mockResolvedValue(null),
    readMedications: jest.fn().mockResolvedValue([]),
  };
  RN.NativeModules.HealthMedications = native;
});
afterEach(async () => {
  await act(async () => screen?.unmount());
  delete RN.NativeModules.HealthMedications;
  jest.restoreAllMocks();
  jest.useRealTimers();
});
async function mount() {
  await act(async () => {
    screen = Renderer.create(<HealthMedicationsScreen onBack={jest.fn()} />);
  });
}
async function press(label: string) {
  await act(async () => {
    screen.root.findByProps({ accessibilityLabel: label }).props.onPress();
  });
}
async function lifecycle(state: RN.AppStateStatus) {
  await act(async () => {
    RN.AppState.currentState = state;
    change(state);
  });
}
function content() {
  return JSON.stringify(screen.toJSON());
}

test('entry, explicit refresh and foreground read without requesting access; only Connect requests', async () => {
  await mount();
  await press('Refresh medications');
  await lifecycle('background');
  await lifecycle('active');
  expect(native.readMedications).toHaveBeenCalledTimes(3);
  expect(native.requestAccess).not.toHaveBeenCalled();
  await press('Connect Apple Health medications');
  expect(native.requestAccess).toHaveBeenCalledTimes(1);
  expect(native.readMedications).toHaveBeenCalledTimes(4);
  expect(content()).toContain('No medications are available to read');
  expect(content()).not.toContain('Access granted');
  expect(content()).not.toContain('permission denied');
});

test('management guidance uses the actual display name and makes no navigation or authorization call', async () => {
  const url = jest.spyOn(RN.Linking, 'openURL');
  const settings = jest.spyOn(RN.Linking, 'openSettings');
  await mount();
  await press('Manage medication access');
  expect(content()).toContain('Open the Health app → your profile → Apps →');
  expect(content()).toContain('PersonalOS Health Test');
  expect(content()).toContain('medication selections');
  expect(content()).toContain('selection sheet may not appear again');
  expect(url).not.toHaveBeenCalled();
  expect(settings).not.toHaveBeenCalled();
  expect(native.requestAccess).not.toHaveBeenCalled();
});

test('request completion refreshes objects and does not use callback results as consent', async () => {
  await mount();
  native.readMedications.mockResolvedValue(rows);
  await press('Connect Apple Health medications');
  expect(content()).toContain('Synthetic medication A');
  expect(content()).not.toContain('Access granted');
  native.requestAccess.mockRejectedValue({
    code: 'health-request-failed',
    message: 'PRIVATE ERROR',
  });
  native.readMedications.mockResolvedValue([]);
  await press('Connect Apple Health medications');
  expect(content()).toContain('access request did not complete successfully');
  expect(content()).toContain('No medications are available to read');
  expect(content()).not.toContain('Synthetic medication A');
  expect(content()).not.toContain('PRIVATE ERROR');
});

test('refresh immediately clears obsolete data; empty and error results never retain it', async () => {
  native.readMedications.mockResolvedValue(rows);
  await mount();
  const read = deferred<unknown[]>();
  native.readMedications.mockReturnValueOnce(read.promise);
  await press('Refresh medications');
  expect(content()).not.toContain('Synthetic medication A');
  expect(content()).toContain('Loading Apple Health medications');
  await act(async () => read.resolve([]));
  expect(content()).toContain('No medications are available to read');
  native.readMedications.mockRejectedValue({
    code: 'health-read-failed',
    message: 'PRIVATE ERROR',
  });
  await press('Refresh medications');
  expect(content()).toContain('Unable to read Apple Health medications');
  expect(content()).not.toContain('PRIVATE ERROR');
});

test('background invalidates a pending read and coalesces a new foreground read, never a prompt', async () => {
  const read = deferred<unknown[]>();
  native.readMedications
    .mockReturnValueOnce(read.promise)
    .mockResolvedValue([]);
  await mount();
  await lifecycle('inactive');
  await lifecycle('background');
  await lifecycle('active');
  await press('Connect Apple Health medications');
  expect(native.requestAccess).not.toHaveBeenCalled();
  expect(native.readMedications).toHaveBeenCalledTimes(1);
  await act(async () => read.resolve(rows));
  expect(native.readMedications).toHaveBeenCalledTimes(2);
  expect(content()).not.toContain('Synthetic medication A');
  expect(content()).toContain('No medications are available to read');
});

test('overlapping Connect taps and a UI timeout do not queue a second request', async () => {
  await mount();
  const request = deferred<void>();
  native.requestAccess.mockReturnValue(request.promise);
  await press('Connect Apple Health medications');
  await press('Connect Apple Health medications');
  await act(async () => jest.advanceTimersByTime(30000));
  expect(content()).toContain('has not finished this operation');
  await press('Connect Apple Health medications');
  expect(native.requestAccess).toHaveBeenCalledTimes(1);
  await press('Manage medication access');
  expect(content()).toContain('Manage selections in Health');
  await act(async () => request.resolve());
  expect(native.readMedications).toHaveBeenCalledTimes(2);
  expect(content()).toContain('No medications are available to read');
});

test('request callback while inactive cannot read or publish until foreground return', async () => {
  await mount();
  const request = deferred<void>();
  native.requestAccess.mockReturnValue(request.promise);
  await press('Connect Apple Health medications');
  await lifecycle('inactive');
  await act(async () => request.resolve());
  expect(native.readMedications).toHaveBeenCalledTimes(1);
  await lifecycle('active');
  expect(native.readMedications).toHaveBeenCalledTimes(2);
  expect(native.requestAccess).toHaveBeenCalledTimes(1);
});

test('unmounted request callback cannot start a query', async () => {
  await mount();
  const request = deferred<void>();
  native.requestAccess.mockReturnValue(request.promise);
  await press('Connect Apple Health medications');
  await act(async () => screen.unmount());
  await act(async () => request.resolve());
  expect(native.readMedications).toHaveBeenCalledTimes(1);
});

test.each(['missing', 'unsupported', 'malformed'])(
  '%s bridge response has an honest state',
  async mode => {
    if (mode === 'missing') {
      delete RN.NativeModules.HealthMedications;
    }
    if (mode === 'unsupported') {
      native.readMedications.mockRejectedValue({ code: 'health-unavailable' });
    }
    if (mode === 'malformed') {
      native.readMedications.mockResolvedValue([
        { name: 'PRIVATE', isArchived: 'no' },
      ]);
    }
    await mount();
    expect(content()).toContain(
      mode === 'malformed' ? 'Unable to read' : 'require iOS 26',
    );
    expect(content()).not.toContain('PRIVATE');
    expect(content()).not.toContain('No medications are available');
    await press('Manage medication access');
    expect(content()).toContain('Manage selections in Health');
  },
);

test('controls remain labelled, scalable and at least 44 points at large text in dark mode', async () => {
  jest
    .spyOn(RN, 'useWindowDimensions')
    .mockReturnValue({ width: 375, height: 667, scale: 2, fontScale: 3.5 });
  jest.spyOn(RN, 'useColorScheme').mockReturnValue('dark');
  await mount();
  for (const button of screen.root.findAllByType(RN.Pressable)) {
    expect(button.props.accessibilityRole).toBe('button');
    expect(
      RN.StyleSheet.flatten(button.props.style).minHeight,
    ).toBeGreaterThanOrEqual(44);
  }
  for (const text of screen.root.findAllByType(RN.Text)) {
    expect(text.props.allowFontScaling).not.toBe(false);
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.maxFontSizeMultiplier).toBeUndefined();
  }
});

test('a request that times out while backgrounded returns to waiting without a retry', async () => {
  await mount();
  const request = deferred<void>();
  native.requestAccess.mockReturnValue(request.promise);
  await press('Connect Apple Health medications');
  await lifecycle('background');
  await act(async () => jest.advanceTimersByTime(30000));
  await lifecycle('active');
  expect(content()).toContain('has not finished this operation');
  expect(native.requestAccess).toHaveBeenCalledTimes(1);
  await act(async () => request.resolve());
  expect(content()).toContain('No medications are available to read');
});

test('a late read discards its rows and leaves a retryable error, not an ongoing-operation claim', async () => {
  const read = deferred<unknown[]>();
  native.readMedications.mockReturnValueOnce(read.promise);
  await mount();
  await act(async () => jest.advanceTimersByTime(30000));
  expect(content()).toContain('has not finished this operation');
  await act(async () => read.resolve(rows));
  expect(content()).not.toContain('Synthetic medication A');
  expect(content()).not.toContain('has not finished this operation');
  expect(content()).toContain('Unable to read Apple Health medications');
  await press('Refresh medications');
  expect(content()).toContain('No medications are available to read');
});

test('missing native display name never tells a test user to select production PersonalOS', async () => {
  delete RN.NativeModules.HealthMedications;
  await mount();
  await press('Manage medication access');
  expect(content()).toContain('this app (use its name from the Home Screen)');
  expect(content()).not.toContain('PersonalOS');
});
