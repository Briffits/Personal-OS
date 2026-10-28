import React from 'react';
import * as RN from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import RemindersScreen from '../src/screens/RemindersScreen';
import {
  deferred,
  remindersFixture,
  remindersNow,
} from '../test-utils/remindersFixture';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

let screen: ReactTestRenderer.ReactTestRenderer;
let changeState: (state: RN.AppStateStatus) => void;
let removeListener: jest.Mock;
let module: {
  getAuthorizationStatus: jest.Mock;
  requestAccess: jest.Mock;
  fetchDueToday: jest.Mock;
};
const onBack = jest.fn();

beforeEach(() => {
  jest.useFakeTimers({ now: remindersNow });
  jest.clearAllMocks();
  RN.AppState.currentState = 'active';
  removeListener = jest.fn();
  jest
    .spyOn(RN.AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      changeState = listener;
      return { remove: removeListener };
    });
  module = {
    getAuthorizationStatus: jest.fn().mockResolvedValue('authorized'),
    requestAccess: jest.fn().mockResolvedValue('authorized'),
    fetchDueToday: jest.fn().mockResolvedValue(remindersFixture()),
  };
  RN.NativeModules.Reminders = module;
});

afterEach(async () => {
  if (screen) {
    await act(async () => screen.unmount());
  }
  delete RN.NativeModules.Reminders;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function mount() {
  await act(async () => {
    screen = ReactTestRenderer.create(<RemindersScreen onBack={onBack} />);
  });
}
async function press(label: string) {
  await act(async () =>
    screen.root.findByProps({ accessibilityLabel: label }).props.onPress(),
  );
}
async function appState(state: RN.AppStateStatus) {
  await act(async () => {
    RN.AppState.currentState = state;
    changeState(state);
  });
}
function content() {
  return JSON.stringify(screen.toJSON());
}
function absent(label: string) {
  expect(
    screen.root.findAllByProps({ accessibilityLabel: label }),
  ).toHaveLength(0);
}

function buttons() {
  return screen.root.findAll(
    node =>
      typeof node.type === 'string' &&
      node.props.accessibilityRole === 'button',
  );
}

test('missing bridge shows unavailable in this build, without mock content or permission button', async () => {
  delete RN.NativeModules.Reminders;
  await mount();
  expect(content()).toContain('Reminders is unavailable in this build.');
  expect(content()).not.toContain('Example');
  expect(content()).not.toContain('No incomplete reminders');
  absent('Allow Reminders access');
  await press('Back to Today');
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('not-determined entry, refresh and foreground never prompt; only the access button does', async () => {
  module.getAuthorizationStatus.mockResolvedValue('notDetermined');
  await mount();
  await press('Refresh reminders');
  await appState('background');
  await appState('active');
  expect(module.requestAccess).not.toHaveBeenCalled();
  expect(module.fetchDueToday).not.toHaveBeenCalled();
  await press('Allow Reminders access');
  expect(module.requestAccess).toHaveBeenCalledTimes(1);
  expect(module.fetchDueToday).toHaveBeenCalledTimes(1);
  expect(content()).toContain('Example date-only reminder');
});

test('shows loading until an authorized read completes, with read-only rows including earlier timed items', async () => {
  const pending = deferred<ReturnType<typeof remindersFixture>>();
  module.fetchDueToday.mockReturnValueOnce(pending.promise);
  await mount();
  expect(content()).toContain('Loading reminders');
  expect(content()).not.toContain('No incomplete reminders');
  expect(
    screen.root.findByProps({ accessibilityLabel: 'Refresh reminders' }).props
      .disabled,
  ).toBe(true);
  await act(async () => pending.resolve(remindersFixture()));
  expect(content()).toContain('Today · No time');
  expect(content()).toContain(
    new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(Date.UTC(2026, 9, 27, 9)),
  );
  expect(buttons().map(node => node.props.accessibilityLabel)).toEqual([
    'Back to Today',
    'Refresh reminders',
  ]);
  expect(screen.root.findAllByType(RN.TextInput)).toHaveLength(0);
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test.each(['denied', 'restricted'])(
  '%s access never fetches, prompts, or appears empty',
  async status => {
    module.getAuthorizationStatus.mockResolvedValue(status);
    await mount();
    expect(content()).toContain(
      status === 'denied'
        ? 'Reminders access is off'
        : 'Reminders access is restricted',
    );
    expect(content()).not.toContain('No incomplete reminders');
    absent('Allow Reminders access');
    if (status === 'restricted') {
      absent('Open iPhone Settings');
    }
    await press('Refresh reminders');
    await appState('inactive');
    await appState('active');
    expect(module.requestAccess).not.toHaveBeenCalled();
    expect(module.fetchDueToday).not.toHaveBeenCalled();
  },
);

test('Settings requires a button tap, handles failure, and returning rechecks access', async () => {
  module.getAuthorizationStatus.mockResolvedValue('denied');
  const settings = jest
    .spyOn(RN.Linking, 'openSettings')
    .mockRejectedValueOnce(new Error('Synthetic failure'));
  await mount();
  expect(settings).not.toHaveBeenCalled();
  await press('Open iPhone Settings');
  expect(content()).toContain('Unable to open Settings');
  settings.mockResolvedValueOnce();
  await press('Open iPhone Settings');
  module.getAuthorizationStatus.mockResolvedValue('authorized');
  await appState('background');
  await appState('active');
  expect(content()).toContain('Example timed reminder');
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test('authorized empty is distinct from failure and retry rechecks authorization', async () => {
  module.fetchDueToday.mockRejectedValueOnce(
    new Error('Synthetic private content'),
  );
  await mount();
  expect(content()).toContain('Unable to load reminders');
  expect(content()).not.toContain('Synthetic private content');
  expect(content()).not.toContain('No incomplete reminders');
  module.fetchDueToday.mockResolvedValue({
    ...remindersFixture(),
    reminders: [],
  });
  await press('Retry');
  expect(content()).toContain('No incomplete reminders due today.');
  expect(module.getAuthorizationStatus).toHaveBeenCalledTimes(2);
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test('malformed response is an error, never a crash or an empty list', async () => {
  module.fetchDueToday.mockResolvedValue({ reminders: [] });
  await mount();
  expect(content()).toContain('Unable to load reminders');
  expect(content()).not.toContain('No incomplete reminders');
});

test('failed authorization offers a read-only Retry; another prompt needs a fresh access tap', async () => {
  module.getAuthorizationStatus.mockResolvedValue('notDetermined');
  module.requestAccess.mockRejectedValueOnce(new Error('Synthetic error'));
  await mount();
  await press('Allow Reminders access');
  expect(content()).toContain('Unable to load reminders');
  await press('Retry');
  expect(module.requestAccess).toHaveBeenCalledTimes(1);
  expect(module.fetchDueToday).not.toHaveBeenCalled();
  await press('Allow Reminders access');
  expect(module.requestAccess).toHaveBeenCalledTimes(2);
});

test('double access taps and permission-dialog foreground events never duplicate or replay a prompt', async () => {
  const pending = deferred<string>();
  module.getAuthorizationStatus.mockResolvedValue('notDetermined');
  module.requestAccess.mockReturnValueOnce(pending.promise);
  await mount();
  const allow = screen.root.findByProps({
    accessibilityLabel: 'Allow Reminders access',
  }).props.onPress;
  await act(async () => {
    allow();
    allow();
  });
  expect(content()).toContain('Waiting for Reminders access');
  expect(module.requestAccess).toHaveBeenCalledTimes(1);
  await appState('inactive');
  await appState('active');
  expect(module.getAuthorizationStatus).toHaveBeenCalledTimes(1);
  module.getAuthorizationStatus.mockResolvedValue('denied');
  await act(async () => pending.resolve('authorized'));
  expect(content()).toContain('Reminders access is off');
  expect(module.requestAccess).toHaveBeenCalledTimes(1);
  expect(module.fetchDueToday).not.toHaveBeenCalled();
});

test('foreground events coalesce behind a pending fetch and cannot restore stale content after revocation', async () => {
  const pending = deferred<ReturnType<typeof remindersFixture>>();
  module.fetchDueToday.mockReturnValueOnce(pending.promise);
  await mount();
  for (let index = 0; index < 3; index += 1) {
    await appState('background');
    await appState('active');
  }
  expect(module.getAuthorizationStatus).toHaveBeenCalledTimes(1);
  expect(module.fetchDueToday).toHaveBeenCalledTimes(1);
  module.getAuthorizationStatus.mockResolvedValue('denied');
  await act(async () => pending.resolve(remindersFixture()));
  expect(module.getAuthorizationStatus).toHaveBeenCalledTimes(2);
  expect(module.fetchDueToday).toHaveBeenCalledTimes(1);
  expect(content()).not.toContain('Example');
  expect(content()).toContain('Reminders access is off');
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test('pending authorization status does not start a stale fetch on foreground return', async () => {
  const pending = deferred<string>();
  module.getAuthorizationStatus.mockReturnValueOnce(pending.promise);
  await mount();
  await appState('background');
  await appState('active');
  module.getAuthorizationStatus.mockResolvedValue('restricted');
  await act(async () => pending.resolve('authorized'));
  expect(module.fetchDueToday).not.toHaveBeenCalled();
  expect(content()).toContain('Reminders access is restricted');
});

test.each(['denied', 'restricted'])(
  'access becoming %s during a refresh clears loaded rows without re-prompting',
  async code => {
    await mount();
    expect(content()).toContain('Example timed reminder');
    const pending = deferred<ReturnType<typeof remindersFixture>>();
    module.fetchDueToday.mockReturnValueOnce(pending.promise);
    await press('Refresh reminders');
    expect(content()).not.toContain('Example');
    expect(content()).toContain('Loading reminders');
    await act(async () => pending.reject({ code }));
    expect(content()).toContain(
      code === 'denied'
        ? 'Reminders access is off'
        : 'Reminders access is restricted',
    );
    expect(content()).not.toContain('Example');
    expect(content()).not.toContain('No incomplete reminders');
    absent('Allow Reminders access');
    expect(module.requestAccess).not.toHaveBeenCalled();
    expect(module.fetchDueToday).toHaveBeenCalledTimes(2);
  },
);

test('background immediately clears content and returning loads a fresh native day/time-zone snapshot', async () => {
  await mount();
  expect(content()).toContain('Example');
  await appState('background');
  expect(content()).not.toContain('Example');
  const next = remindersFixture();
  const nextDay = {
    ...next,
    day: {
      date: '2026-10-28',
      timeZone: 'Asia/Tokyo',
      startsAt: Date.UTC(2026, 9, 27, 15),
      endsAt: Date.UTC(2026, 9, 28, 15),
    },
    reminders: [
      {
        ...next.reminders[1],
        title: 'New day example',
        due: { kind: 'timed', at: Date.UTC(2026, 9, 28, 0) },
      },
    ],
  };
  jest.setSystemTime(Date.UTC(2026, 9, 28, 1));
  module.fetchDueToday.mockResolvedValue(nextDay);
  await appState('active');
  expect(content()).toContain('New day example');
  expect(content()).not.toContain('Example date-only reminder');
  expect(module.fetchDueToday).toHaveBeenCalledTimes(2);
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test('refreshes at the boundary supplied by native code, without calculating a JavaScript day', async () => {
  const fixture = remindersFixture();
  module.fetchDueToday.mockResolvedValueOnce({
    ...fixture,
    day: { ...fixture.day, endsAt: remindersNow + 2000 },
  });
  await mount();
  await act(async () => jest.advanceTimersByTime(1999));
  expect(module.fetchDueToday).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(1));
  expect(module.fetchDueToday).toHaveBeenCalledTimes(2);
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test('expired snapshot fails closed without an automatic retry loop', async () => {
  const fixture = remindersFixture();
  module.fetchDueToday.mockResolvedValue({
    ...fixture,
    day: { ...fixture.day, endsAt: remindersNow },
  });
  await mount();
  expect(content()).toContain('Unable to load reminders');
  expect(content()).not.toContain('Example');
  await act(async () => jest.advanceTimersByTime(60_000));
  expect(module.fetchDueToday).toHaveBeenCalledTimes(1);
});

test('unmount cancels subscriptions/timers and late results cannot affect a new screen', async () => {
  const pending = deferred<ReturnType<typeof remindersFixture>>();
  module.fetchDueToday.mockReturnValueOnce(pending.promise);
  await mount();
  await act(async () => screen.unmount());
  expect(removeListener).toHaveBeenCalledTimes(1);
  module.getAuthorizationStatus.mockResolvedValue('denied');
  await mount();
  // The adapter also serializes across these two screen lifetimes.
  expect(module.getAuthorizationStatus).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(remindersFixture()));
  expect(content()).toContain('Reminders access is off');
  expect(content()).not.toContain('Example');
  await act(async () => jest.advanceTimersByTime(86_400_000));
  expect(module.getAuthorizationStatus).toHaveBeenCalledTimes(2);
  expect(module.fetchDueToday).toHaveBeenCalledTimes(1);
});

test('unmount clears the native-day refresh timer', async () => {
  const timeout = jest.spyOn(globalThis, 'setTimeout');
  const clear = jest.spyOn(globalThis, 'clearTimeout');
  await mount();
  const index = timeout.mock.calls.findIndex(
    ([, delay]) => delay === remindersFixture().day.endsAt - remindersNow,
  );
  expect(index).toBeGreaterThanOrEqual(0);
  const handle = timeout.mock.results[index].value;
  await act(async () => screen.unmount());
  expect(clear).toHaveBeenCalledWith(handle);
  await act(async () => jest.advanceTimersByTime(86_400_000));
  expect(module.fetchDueToday).toHaveBeenCalledTimes(1);
});

test('unmount during a permission request cannot fetch or replay permission later', async () => {
  const pending = deferred<string>();
  module.getAuthorizationStatus.mockResolvedValue('notDetermined');
  module.requestAccess.mockReturnValueOnce(pending.promise);
  await mount();
  await press('Allow Reminders access');
  await act(async () => screen.unmount());
  await act(async () => pending.resolve('authorized'));
  expect(module.fetchDueToday).not.toHaveBeenCalled();
  expect(module.requestAccess).toHaveBeenCalledTimes(1);
});

test.each(['light', 'dark'] as const)(
  'retains readable controls and scalable text at large text sizes in %s appearance',
  async appearance => {
    jest.spyOn(RN, 'useColorScheme').mockReturnValue(appearance);
    jest
      .spyOn(RN, 'useWindowDimensions')
      .mockReturnValue({ width: 320, height: 568, scale: 2, fontScale: 3.571 });
    module.getAuthorizationStatus.mockResolvedValue('notDetermined');
    await mount();
    expect(screen.root.findAllByType(RN.ScrollView)).toHaveLength(1);
    expect(buttons()).toHaveLength(3);
    for (const button of buttons()) {
      expect(button.props.accessibilityRole).toBe('button');
      const style = RN.StyleSheet.flatten(button.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
    }
    for (const text of screen.root.findAllByType(RN.Text)) {
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.maxFontSizeMultiplier).toBeUndefined();
      expect(text.props.numberOfLines).toBeUndefined();
    }
  },
);
