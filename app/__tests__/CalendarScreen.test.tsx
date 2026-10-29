import React from 'react';
import * as RN from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import CalendarScreen from '../src/screens/CalendarScreen';
import {
  deferred,
  calendarFixture,
  calendarNow,
} from '../test-utils/calendarFixture';

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
  fetchToday: jest.Mock;
};
const onBack = jest.fn();

beforeEach(() => {
  jest.useFakeTimers({ now: calendarNow });
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
    fetchToday: jest.fn().mockResolvedValue(calendarFixture()),
  };
  RN.NativeModules.CalendarEvents = module;
});

afterEach(async () => {
  if (screen) {
    await act(async () => screen.unmount());
  }
  delete RN.NativeModules.CalendarEvents;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function mount() {
  await act(async () => {
    screen = ReactTestRenderer.create(<CalendarScreen onBack={onBack} />);
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
  delete RN.NativeModules.CalendarEvents;
  await mount();
  expect(content()).toContain('Calendar is unavailable in this build.');
  expect(content()).not.toContain('Example');
  expect(content()).not.toContain('No events');
  absent('Allow Calendar access');
  await press('Back to Today');
  expect(onBack).toHaveBeenCalledTimes(1);
});

test.each(['notDetermined', 'writeOnly'])(
  '%s entry, refresh and foreground never prompt; only the access button does',
  async status => {
    module.getAuthorizationStatus.mockResolvedValue(status);
    await mount();
    await press('Refresh events');
    await appState('background');
    await appState('active');
    expect(module.requestAccess).not.toHaveBeenCalled();
    expect(module.fetchToday).not.toHaveBeenCalled();
    if (status === 'writeOnly') {
      expect(content()).toContain(
        'Calendar access currently allows adding events only',
      );
      expect(content()).not.toContain('No events today');
    }
    await press('Allow Calendar access');
    expect(module.requestAccess).toHaveBeenCalledTimes(1);
    expect(module.fetchToday).toHaveBeenCalledTimes(1);
    expect(content()).toContain('Example all-day event');
  },
);

test.each(['denied', 'writeOnly', 'restricted'])(
  'permission result %s never fetches or invents readable access',
  async status => {
    module.getAuthorizationStatus.mockResolvedValue('notDetermined');
    module.requestAccess.mockResolvedValue(status);
    await mount();
    await press('Allow Calendar access');
    expect(module.fetchToday).not.toHaveBeenCalled();
    expect(content()).not.toContain('No events today');
    expect(content()).not.toContain('Example');
    expect(content()).not.toContain('Unable to load events');
  },
);

test('background entry and stale access handlers cannot prompt', async () => {
  RN.AppState.currentState = 'background';
  module.getAuthorizationStatus.mockResolvedValue('writeOnly');
  await mount();
  expect(module.getAuthorizationStatus).not.toHaveBeenCalled();
  await appState('active');
  const allow = screen.root.findByProps({
    accessibilityLabel: 'Allow Calendar access',
  }).props.onPress;
  await appState('inactive');
  await act(async () => allow());
  await appState('active');
  expect(module.requestAccess).not.toHaveBeenCalled();
  expect(module.fetchToday).not.toHaveBeenCalled();
});

test.each([
  ['write-only', 'Calendar access currently allows adding events only'],
  ['not-authorized', 'Allow access to see today'],
  ['read-failed', 'Unable to load events'],
  ['busy', 'Unable to load events'],
  ['unavailable', 'Calendar is unavailable in this build'],
])('refresh error %s clears previously loaded rows', async (code, message) => {
  await mount();
  expect(content()).toContain('Example timed event');
  module.fetchToday.mockRejectedValueOnce({ code });
  await press('Refresh events');
  expect(content()).toContain(message);
  expect(content()).not.toContain('Example');
  expect(content()).not.toContain('No events today');
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test('formats original overnight endpoints in the snapshot zone, preserves row order and missing-title fallback', async () => {
  const fixture = calendarFixture();
  const zone = 'Asia/Tokyo';
  module.fetchToday.mockResolvedValue({
    ...fixture,
    day: { ...fixture.day, timeZone: zone },
    events: [{ ...fixture.events[1], title: '   ' }, fixture.events[0]],
  });
  await mount();
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: zone,
  });
  const rows = screen.root
    .findAllByType(RN.View)
    .filter(
      node =>
        node.props.accessible === true &&
        node.props.accessibilityRole !== 'button',
    );
  expect(rows.map(row => row.props.accessibilityLabel)).toEqual([
    `Untitled event, ${formatter.format(
      Date.UTC(2026, 9, 28, 23),
    )} – ${formatter.format(Date.UTC(2026, 9, 29, 1))}`,
    'Example all-day event, All day',
  ]);
});

test.each([23, 25])(
  'uses the native %s-hour day end to schedule rollover',
  async hours => {
    const fixture = calendarFixture();
    const endsAt = fixture.day.startsAt + hours * 3_600_000;
    module.fetchToday.mockResolvedValueOnce({
      ...fixture,
      day: { ...fixture.day, endsAt },
    });
    await mount();
    await act(async () => jest.advanceTimersByTime(endsAt - calendarNow - 1));
    expect(module.fetchToday).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(1));
    expect(module.fetchToday).toHaveBeenCalledTimes(2);
    expect(module.requestAccess).not.toHaveBeenCalled();
  },
);

test('future snapshot fails closed without scheduling an automatic retry', async () => {
  const fixture = calendarFixture();
  module.fetchToday.mockResolvedValue({
    ...fixture,
    day: { ...fixture.day, startsAt: calendarNow + 1 },
  });
  await mount();
  expect(content()).toContain('Unable to load events');
  expect(content()).not.toContain('Example');
  await act(async () => jest.advanceTimersByTime(60_000));
  expect(module.fetchToday).toHaveBeenCalledTimes(1);
});

test('background cancels rollover and only foreground return reloads', async () => {
  const fixture = calendarFixture();
  module.fetchToday.mockResolvedValueOnce({
    ...fixture,
    day: { ...fixture.day, endsAt: calendarNow + 1000 },
  });
  await mount();
  await appState('background');
  await act(async () => jest.advanceTimersByTime(2000));
  expect(module.fetchToday).toHaveBeenCalledTimes(1);
  expect(content()).not.toContain('Example');
  await appState('active');
  expect(module.fetchToday).toHaveBeenCalledTimes(2);
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test('manual refreshes coalesce and Back works while a read is pending', async () => {
  await mount();
  const pending = deferred<ReturnType<typeof calendarFixture>>();
  module.fetchToday.mockReturnValueOnce(pending.promise);
  const refresh = screen.root.findByProps({
    accessibilityLabel: 'Refresh events',
  }).props.onPress;
  await act(async () => refresh());
  await act(async () => {
    refresh();
    refresh();
  });
  expect(content()).not.toContain('Example');
  await press('Back to Today');
  expect(onBack).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(calendarFixture()));
  expect(module.fetchToday).toHaveBeenCalledTimes(3); // Entry, pending, one coalesced read.
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test('shows loading until an authorized read completes, with read-only rows including earlier timed items', async () => {
  const pending = deferred<ReturnType<typeof calendarFixture>>();
  module.fetchToday.mockReturnValueOnce(pending.promise);
  await mount();
  expect(content()).toContain('Loading events');
  expect(content()).not.toContain('No events');
  expect(
    screen.root.findByProps({ accessibilityLabel: 'Refresh events' }).props
      .disabled,
  ).toBe(true);
  await act(async () => pending.resolve(calendarFixture()));
  expect(content()).toContain('All day');
  expect(content()).toContain(
    new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(Date.UTC(2026, 9, 29, 9)),
  );
  expect(buttons().map(node => node.props.accessibilityLabel)).toEqual([
    'Back to Today',
    'Refresh events',
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
        ? 'Calendar access is off'
        : 'Calendar access is restricted',
    );
    expect(content()).not.toContain('No events');
    absent('Allow Calendar access');
    if (status === 'restricted') {
      absent('Open iPhone Settings');
    }
    await press('Refresh events');
    await appState('inactive');
    await appState('active');
    expect(module.requestAccess).not.toHaveBeenCalled();
    expect(module.fetchToday).not.toHaveBeenCalled();
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
  expect(content()).toContain('Example timed event');
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test('authorized empty is distinct from failure and retry rechecks authorization', async () => {
  module.fetchToday.mockRejectedValueOnce(
    new Error('Synthetic private content'),
  );
  await mount();
  expect(content()).toContain('Unable to load events');
  expect(content()).not.toContain('Synthetic private content');
  expect(content()).not.toContain('No events');
  module.fetchToday.mockResolvedValue({
    ...calendarFixture(),
    events: [],
  });
  await press('Retry');
  expect(content()).toContain('No events today.');
  expect(module.getAuthorizationStatus).toHaveBeenCalledTimes(2);
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test('malformed response is an error, never a crash or an empty list', async () => {
  module.fetchToday.mockResolvedValue({ events: [] });
  await mount();
  expect(content()).toContain('Unable to load events');
  expect(content()).not.toContain('No events');
});

test('failed authorization offers a read-only Retry; another prompt needs a fresh access tap', async () => {
  module.getAuthorizationStatus.mockResolvedValue('notDetermined');
  module.requestAccess.mockRejectedValueOnce(new Error('Synthetic error'));
  await mount();
  await press('Allow Calendar access');
  expect(content()).toContain('Unable to load events');
  await press('Retry');
  expect(module.requestAccess).toHaveBeenCalledTimes(1);
  expect(module.fetchToday).not.toHaveBeenCalled();
  await press('Allow Calendar access');
  expect(module.requestAccess).toHaveBeenCalledTimes(2);
});

test('double access taps and permission-dialog foreground events never duplicate or replay a prompt', async () => {
  const pending = deferred<string>();
  module.getAuthorizationStatus.mockResolvedValue('notDetermined');
  module.requestAccess.mockReturnValueOnce(pending.promise);
  await mount();
  const allow = screen.root.findByProps({
    accessibilityLabel: 'Allow Calendar access',
  }).props.onPress;
  await act(async () => {
    allow();
    allow();
  });
  expect(content()).toContain('Waiting for Calendar access');
  expect(module.requestAccess).toHaveBeenCalledTimes(1);
  await appState('inactive');
  await appState('active');
  expect(module.getAuthorizationStatus).toHaveBeenCalledTimes(1);
  module.getAuthorizationStatus.mockResolvedValue('denied');
  await act(async () => pending.resolve('authorized'));
  expect(content()).toContain('Calendar access is off');
  expect(module.requestAccess).toHaveBeenCalledTimes(1);
  expect(module.fetchToday).not.toHaveBeenCalled();
});

test('foreground events coalesce behind a pending fetch and cannot restore stale content after revocation', async () => {
  const pending = deferred<ReturnType<typeof calendarFixture>>();
  module.fetchToday.mockReturnValueOnce(pending.promise);
  await mount();
  for (let index = 0; index < 3; index += 1) {
    await appState('background');
    await appState('active');
  }
  expect(module.getAuthorizationStatus).toHaveBeenCalledTimes(1);
  expect(module.fetchToday).toHaveBeenCalledTimes(1);
  module.getAuthorizationStatus.mockResolvedValue('denied');
  await act(async () => pending.resolve(calendarFixture()));
  expect(module.getAuthorizationStatus).toHaveBeenCalledTimes(2);
  expect(module.fetchToday).toHaveBeenCalledTimes(1);
  expect(content()).not.toContain('Example');
  expect(content()).toContain('Calendar access is off');
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
  expect(module.fetchToday).not.toHaveBeenCalled();
  expect(content()).toContain('Calendar access is restricted');
});

test.each(['denied', 'restricted'])(
  'access becoming %s during a refresh clears loaded rows without re-prompting',
  async code => {
    await mount();
    expect(content()).toContain('Example timed event');
    const pending = deferred<ReturnType<typeof calendarFixture>>();
    module.fetchToday.mockReturnValueOnce(pending.promise);
    await press('Refresh events');
    expect(content()).not.toContain('Example');
    expect(content()).toContain('Loading events');
    await act(async () => pending.reject({ code }));
    expect(content()).toContain(
      code === 'denied'
        ? 'Calendar access is off'
        : 'Calendar access is restricted',
    );
    expect(content()).not.toContain('Example');
    expect(content()).not.toContain('No events');
    absent('Allow Calendar access');
    expect(module.requestAccess).not.toHaveBeenCalled();
    expect(module.fetchToday).toHaveBeenCalledTimes(2);
  },
);

test('background immediately clears content and returning loads a fresh native day/time-zone snapshot', async () => {
  await mount();
  expect(content()).toContain('Example');
  await appState('background');
  expect(content()).not.toContain('Example');
  const next = calendarFixture();
  const nextDay = {
    ...next,
    day: {
      date: '2026-10-30',
      timeZone: 'Asia/Tokyo',
      startsAt: Date.UTC(2026, 9, 29, 15),
      endsAt: Date.UTC(2026, 9, 30, 15),
    },
    events: [
      {
        ...next.events[2],
        title: 'New day example',
        time: {
          kind: 'timed',
          startsAt: Date.UTC(2026, 9, 30, 0),
          endsAt: Date.UTC(2026, 9, 30, 1),
        },
      },
    ],
  };
  jest.setSystemTime(Date.UTC(2026, 9, 30, 1));
  module.fetchToday.mockResolvedValue(nextDay);
  await appState('active');
  expect(content()).toContain('New day example');
  expect(content()).not.toContain('Example all-day event');
  expect(module.fetchToday).toHaveBeenCalledTimes(2);
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test('refreshes at the boundary supplied by native code, without calculating a JavaScript day', async () => {
  const fixture = calendarFixture();
  module.fetchToday.mockResolvedValueOnce({
    ...fixture,
    day: { ...fixture.day, endsAt: calendarNow + 2000 },
  });
  await mount();
  await act(async () => jest.advanceTimersByTime(1999));
  expect(module.fetchToday).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(1));
  expect(module.fetchToday).toHaveBeenCalledTimes(2);
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test('expired snapshot fails closed without an automatic retry loop', async () => {
  const fixture = calendarFixture();
  module.fetchToday.mockResolvedValue({
    ...fixture,
    day: { ...fixture.day, endsAt: calendarNow },
  });
  await mount();
  expect(content()).toContain('Unable to load events');
  expect(content()).not.toContain('Example');
  await act(async () => jest.advanceTimersByTime(60_000));
  expect(module.fetchToday).toHaveBeenCalledTimes(1);
});

test('unmount cancels subscriptions/timers and late results cannot affect a new screen', async () => {
  const pending = deferred<ReturnType<typeof calendarFixture>>();
  module.fetchToday.mockReturnValueOnce(pending.promise);
  await mount();
  await act(async () => screen.unmount());
  expect(removeListener).toHaveBeenCalledTimes(1);
  module.getAuthorizationStatus.mockResolvedValue('denied');
  await mount();
  // The adapter also serializes across these two screen lifetimes.
  expect(module.getAuthorizationStatus).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(calendarFixture()));
  expect(content()).toContain('Calendar access is off');
  expect(content()).not.toContain('Example');
  await act(async () => jest.advanceTimersByTime(86_400_000));
  expect(module.getAuthorizationStatus).toHaveBeenCalledTimes(2);
  expect(module.fetchToday).toHaveBeenCalledTimes(1);
});

test('unmount clears the native-day refresh timer', async () => {
  const timeout = jest.spyOn(globalThis, 'setTimeout');
  const clear = jest.spyOn(globalThis, 'clearTimeout');
  await mount();
  const index = timeout.mock.calls.findIndex(
    ([, delay]) => delay === calendarFixture().day.endsAt - calendarNow,
  );
  expect(index).toBeGreaterThanOrEqual(0);
  const handle = timeout.mock.results[index].value;
  await act(async () => screen.unmount());
  expect(clear).toHaveBeenCalledWith(handle);
  await act(async () => jest.advanceTimersByTime(86_400_000));
  expect(module.fetchToday).toHaveBeenCalledTimes(1);
});

test('unmount during a permission request cannot fetch or replay permission later', async () => {
  const pending = deferred<string>();
  module.getAuthorizationStatus.mockResolvedValue('notDetermined');
  module.requestAccess.mockReturnValueOnce(pending.promise);
  await mount();
  await press('Allow Calendar access');
  await act(async () => screen.unmount());
  await act(async () => pending.resolve('authorized'));
  expect(module.fetchToday).not.toHaveBeenCalled();
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
