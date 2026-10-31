import { AppState, NativeModules } from 'react-native';
import { NativeCalendar } from '../src/native/NativeCalendar';
import { CalendarError } from '../src/calendar/calendar';
import { calendarFixture, deferred } from '../test-utils/calendarFixture';

function bridge() {
  const module = {
    getAuthorizationStatus: jest.fn().mockResolvedValue('authorized'),
    requestAccess: jest.fn().mockResolvedValue('authorized'),
    fetchToday: jest.fn().mockResolvedValue(calendarFixture()),
  };
  NativeModules.CalendarEvents = module;
  return module;
}

beforeEach(() => {
  AppState.currentState = 'active';
});
afterEach(() => {
  delete NativeModules.CalendarEvents;
});

test('absent or incomplete bridge is unavailable, never fabricated empty data', async () => {
  for (const module of [undefined, {}, { getAuthorizationStatus: jest.fn() }]) {
    NativeModules.CalendarEvents = module;
    for (const method of Object.values(NativeCalendar)) {
      await expect(method()).rejects.toMatchObject({ code: 'unavailable' });
    }
  }
});

test.each([
  'notDetermined',
  'authorized',
  'writeOnly',
  'denied',
  'restricted',
  'unavailable',
])('preserves %s status without prompting or fetching', async status => {
  const module = bridge();
  module.getAuthorizationStatus.mockResolvedValue(status);
  expect(await NativeCalendar.getAuthorizationStatus()).toBe(status);
  expect(module.getAuthorizationStatus).toHaveBeenCalledWith();
  expect(module.requestAccess).not.toHaveBeenCalled();
  expect(module.fetchToday).not.toHaveBeenCalled();
});

test('exposes only three parameterless read/access methods', async () => {
  const module = bridge();
  expect(await NativeCalendar.requestAccess()).toBe('authorized');
  expect(module.requestAccess).toHaveBeenCalledWith();
  expect(module.getAuthorizationStatus).not.toHaveBeenCalled();
  expect(module.fetchToday).not.toHaveBeenCalled();
  expect(await NativeCalendar.fetchToday()).toEqual(calendarFixture());
  expect(module.fetchToday).toHaveBeenCalledWith();
  expect(module.requestAccess).toHaveBeenCalledTimes(1);
  expect(Object.keys(NativeCalendar).sort()).toEqual([
    'fetchToday',
    'getAuthorizationStatus',
    'requestAccess',
  ]);
});

test('preserves native membership, original spans and ordering without a second calendar implementation', async () => {
  const module = bridge();
  const fixture = calendarFixture();
  // Deliberately outside today/out of order: membership and order are native
  // obligations, not silently repaired or recomputed by the JS adapter.
  const response = {
    ...fixture,
    events: [
      {
        ...fixture.events[2],
        time: {
          kind: 'timed',
          startsAt: fixture.day.endsAt,
          endsAt: fixture.day.endsAt,
        },
      },
      {
        ...fixture.events[0],
        time: {
          kind: 'all-day',
          startsOn: '2024-02-29',
          endsBefore: '2024-03-02',
        },
      },
      fixture.events[1],
    ],
  };
  module.fetchToday.mockResolvedValue(response);
  expect(await NativeCalendar.fetchToday()).toEqual(response);
});

test('retains equal titles/times with distinct occurrence IDs and strips extra data', async () => {
  const module = bridge();
  const fixture = calendarFixture();
  const event = fixture.events[2];
  const response = {
    ...fixture,
    events: [event, { ...event, occurrenceId: 'synthetic-second-occurrence' }],
  };
  module.fetchToday.mockResolvedValue({
    ...response,
    privateData: 'synthetic-extra',
    day: { ...response.day, extra: 'synthetic-extra' },
    events: response.events.map(row => ({
      ...row,
      notes: 'synthetic-extra',
      time: { ...row.time, extra: 'synthetic-extra' },
    })),
  });
  const result = await NativeCalendar.fetchToday();
  expect(result).toEqual(response);
  expect(JSON.stringify(result)).not.toContain('synthetic-extra');
});

test.each([23, 25])(
  'accepts native %s-hour boundaries without assuming 24 hours',
  async hours => {
    const module = bridge();
    const fixture = calendarFixture();
    const response = {
      ...fixture,
      day: { ...fixture.day, endsAt: fixture.day.startsAt + hours * 3_600_000 },
    };
    module.fetchToday.mockResolvedValue(response);
    expect(await NativeCalendar.fetchToday()).toEqual(response);
  },
);

const fixture = calendarFixture();
const event = fixture.events[0];
test.each([
  null,
  [],
  {},
  { ...fixture, day: null },
  { ...fixture, day: { ...fixture.day, timeZone: 'not/a-zone' } },
  { ...fixture, day: { ...fixture.day, startsAt: '0' } },
  { ...fixture, day: { ...fixture.day, endsAt: fixture.day.startsAt } },
  { ...fixture, day: { ...fixture.day, date: '2026-02-29' } },
  { ...fixture, events: null },
  { ...fixture, events: [null] },
  { ...fixture, events: [{ ...event, occurrenceId: ' ' }] },
  { ...fixture, events: [{ ...event, title: null }] },
  { ...fixture, events: [{ ...event, time: null }] },
  { ...fixture, events: [event, event] },
  {
    ...fixture,
    events: [event, { ...event, title: 'Conflicting synthetic title' }],
  },
])(
  'rejects malformed or duplicate snapshot %# without partial success',
  async response => {
    const module = bridge();
    module.fetchToday.mockResolvedValue(response);
    await expect(NativeCalendar.fetchToday()).rejects.toMatchObject({
      code: 'invalid-response',
    });
  },
);

test.each([
  { kind: 'unknown' },
  { kind: 'all-day', startsOn: '29/10/2026', endsBefore: '2026-10-30' },
  { kind: 'all-day', startsOn: '0000-01-01', endsBefore: '2026-10-30' },
  { kind: 'all-day', startsOn: '2026-13-01', endsBefore: '2027-01-01' },
  { kind: 'all-day', startsOn: '2026-04-31', endsBefore: '2026-05-02' },
  { kind: 'all-day', startsOn: '1900-02-29', endsBefore: '1900-03-01' },
  { kind: 'all-day', startsOn: '2026-10-29', endsBefore: '2026-10-29' },
  { kind: 'all-day', startsOn: '2026-10-30', endsBefore: '2026-10-29' },
  { kind: 'timed', startsAt: NaN, endsAt: 1 },
  { kind: 'timed', startsAt: 0, endsAt: Infinity },
  { kind: 'timed', startsAt: 0, endsAt: 9e15 },
  { kind: 'timed', startsAt: 0.5, endsAt: 1 },
  { kind: 'timed', startsAt: '0', endsAt: 1 },
  { kind: 'timed', startsAt: 1, endsAt: 0 },
])('rejects invalid time shape %#', async time => {
  const module = bridge();
  module.fetchToday.mockResolvedValue({
    ...fixture,
    events: [{ ...event, time }],
  });
  await expect(NativeCalendar.fetchToday()).rejects.toMatchObject({
    code: 'invalid-response',
  });
});

test.each([true, 'fullAccess', 'unknown', null, { code: 'authorized' }])(
  'rejects unnormalized status %# for both status and request',
  async value => {
    const module = bridge();
    module.getAuthorizationStatus.mockResolvedValue(value);
    module.requestAccess.mockResolvedValue(value);
    await expect(NativeCalendar.getAuthorizationStatus()).rejects.toMatchObject(
      { code: 'invalid-response' },
    );
    await expect(NativeCalendar.requestAccess()).rejects.toMatchObject({
      code: 'invalid-response',
    });
  },
);

test.each([
  'unavailable',
  'not-authorized',
  'write-only',
  'denied',
  'restricted',
  'authorization-failed',
  'read-failed',
  'invalid-response',
  'busy',
])('sanitizes %s errors without retaining native data', async code => {
  const module = bridge();
  module.fetchToday.mockRejectedValue({
    code,
    message: 'synthetic-private',
    payload: { title: 'synthetic-private' },
  });
  const error = await NativeCalendar.fetchToday().catch(value => value);
  expect(error).toBeInstanceOf(CalendarError);
  expect(error.code).toBe(code);
  expect(error.message).toBe('The Calendar operation could not be completed.');
  expect(JSON.stringify(error)).not.toContain('synthetic-private');
});

test('unknown errors are normalized by operation, including synchronous bridge failure', async () => {
  const module = bridge();
  module.getAuthorizationStatus.mockImplementation(() => {
    throw new Error('synthetic-private');
  });
  module.requestAccess.mockRejectedValue({
    code: 'unexpected',
    message: 'synthetic-private',
  });
  module.fetchToday.mockRejectedValue('synthetic-private');
  await expect(NativeCalendar.getAuthorizationStatus()).rejects.toMatchObject({
    code: 'read-failed',
  });
  await expect(NativeCalendar.requestAccess()).rejects.toMatchObject({
    code: 'authorization-failed',
  });
  await expect(NativeCalendar.fetchToday()).rejects.toMatchObject({
    code: 'read-failed',
  });
});

test('serializes reads across callers and rejects permission actions instead of queuing them', async () => {
  const module = bridge();
  const pending = deferred<string>();
  module.getAuthorizationStatus.mockReturnValueOnce(pending.promise);
  const first = NativeCalendar.getAuthorizationStatus();
  const second = NativeCalendar.fetchToday();
  await expect(NativeCalendar.requestAccess()).rejects.toMatchObject({
    code: 'busy',
  });
  expect(module.fetchToday).not.toHaveBeenCalled();
  pending.resolve('authorized');
  await first;
  await second;
  expect(module.fetchToday).toHaveBeenCalledTimes(1);
  expect(module.requestAccess).not.toHaveBeenCalled();
});

test('double permission calls and background transitions never defer a prompt', async () => {
  const module = bridge();
  const pending = deferred<string>();
  module.requestAccess.mockReturnValueOnce(pending.promise);
  const first = NativeCalendar.requestAccess();
  await expect(NativeCalendar.requestAccess()).rejects.toMatchObject({
    code: 'busy',
  });
  pending.resolve('denied');
  await expect(first).resolves.toBe('denied');
  expect(module.requestAccess).toHaveBeenCalledTimes(1);
  const next = NativeCalendar.requestAccess();
  AppState.currentState = 'background';
  await expect(next).rejects.toMatchObject({ code: 'busy' });
  await expect(NativeCalendar.requestAccess()).rejects.toMatchObject({
    code: 'busy',
  });
  expect(module.requestAccess).toHaveBeenCalledTimes(1);
});
