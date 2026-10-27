import { NativeModules } from 'react-native';
import { NativeReminders } from '../src/native/NativeReminders';
import { RemindersError } from '../src/reminders/reminders';
import { deferred, remindersFixture } from '../test-utils/remindersFixture';

function bridge() {
  const module = {
    getAuthorizationStatus: jest.fn().mockResolvedValue('authorized'),
    requestAccess: jest.fn().mockResolvedValue('authorized'),
    fetchDueToday: jest.fn().mockResolvedValue(remindersFixture()),
  };
  NativeModules.Reminders = module;
  return module;
}

afterEach(() => {
  delete NativeModules.Reminders;
});

test('absent or incomplete bridge is unavailable, never an empty success', async () => {
  for (const module of [undefined, {}, { getAuthorizationStatus: jest.fn() }]) {
    NativeModules.Reminders = module;
    await expect(
      NativeReminders.getAuthorizationStatus(),
    ).rejects.toMatchObject({ code: 'unavailable' });
    await expect(NativeReminders.fetchDueToday()).rejects.toMatchObject({
      code: 'unavailable',
    });
    await expect(NativeReminders.requestAccess()).rejects.toMatchObject({
      code: 'unavailable',
    });
  }
});

test.each([
  'notDetermined',
  'authorized',
  'denied',
  'restricted',
  'unavailable',
])(
  'returns normalized %s authorization without requesting permission or fetching',
  async status => {
    const module = bridge();
    module.getAuthorizationStatus.mockResolvedValue(status);
    expect(await NativeReminders.getAuthorizationStatus()).toBe(status);
    expect(module.getAuthorizationStatus).toHaveBeenCalledWith();
    expect(module.requestAccess).not.toHaveBeenCalled();
    expect(module.fetchDueToday).not.toHaveBeenCalled();
  },
);

test('each method forwards only its own parameterless call', async () => {
  const module = bridge();
  expect(await NativeReminders.requestAccess()).toBe('authorized');
  expect(module.requestAccess).toHaveBeenCalledWith();
  expect(module.getAuthorizationStatus).not.toHaveBeenCalled();
  expect(module.fetchDueToday).not.toHaveBeenCalled();
  expect(await NativeReminders.fetchDueToday()).toEqual(remindersFixture());
  expect(module.fetchDueToday).toHaveBeenCalledWith();
  expect(module.requestAccess).toHaveBeenCalledTimes(1);
  expect(Object.keys(NativeReminders).sort()).toEqual([
    'fetchDueToday',
    'getAuthorizationStatus',
    'requestAccess',
  ]);
});

test('preserves native membership, dates and order without JavaScript calendar filtering', async () => {
  const module = bridge();
  const fixture = remindersFixture();
  // Intentionally inconsistent membership proves the adapter does not invent
  // a second calendar implementation. Correct membership is a native obligation.
  const response = {
    ...fixture,
    reminders: [
      {
        ...fixture.reminders[1],
        due: { kind: 'timed', at: fixture.day.endsAt },
      },
      {
        ...fixture.reminders[0],
        due: { kind: 'date-only', date: '2026-10-26' },
      },
    ],
  };
  module.fetchDueToday.mockResolvedValue(response);
  expect(await NativeReminders.fetchDueToday()).toEqual(response);
});

test.each([23, 25])(
  'accepts a native %s-hour day without assuming 24 hours',
  async hours => {
    const module = bridge();
    const fixture = remindersFixture();
    const response = {
      ...fixture,
      day: { ...fixture.day, endsAt: fixture.day.startsAt + hours * 3_600_000 },
    };
    module.fetchDueToday.mockResolvedValue(response);
    expect(await NativeReminders.fetchDueToday()).toEqual(response);
  },
);

test.each([
  null,
  {},
  {
    ...remindersFixture(),
    day: { ...remindersFixture().day, timeZone: 'not/a-zone' },
  },
  { ...remindersFixture(), day: { ...remindersFixture().day, endsAt: 0 } },
  { ...remindersFixture(), reminders: null },
  { ...remindersFixture(), reminders: [null] },
  {
    ...remindersFixture(),
    reminders: [{ ...remindersFixture().reminders[0], id: ' ' }],
  },
  {
    ...remindersFixture(),
    reminders: [{ ...remindersFixture().reminders[0], title: null }],
  },
  {
    ...remindersFixture(),
    reminders: [
      { ...remindersFixture().reminders[0], due: { kind: 'unknown' } },
    ],
  },
  {
    ...remindersFixture(),
    reminders: [
      {
        ...remindersFixture().reminders[0],
        due: { kind: 'date-only', date: '27/10/2026' },
      },
    ],
  },
  {
    ...remindersFixture(),
    reminders: [
      {
        ...remindersFixture().reminders[0],
        due: { kind: 'timed', at: Infinity },
      },
    ],
  },
  {
    ...remindersFixture(),
    reminders: [
      { ...remindersFixture().reminders[0], due: { kind: 'timed', at: 9e15 } },
    ],
  },
  {
    ...remindersFixture(),
    reminders: [
      remindersFixture().reminders[0],
      remindersFixture().reminders[0],
    ],
  },
])(
  'rejects malformed or duplicate payload %# without partial/empty success',
  async response => {
    const module = bridge();
    module.fetchDueToday.mockResolvedValue(response);
    await expect(NativeReminders.fetchDueToday()).rejects.toMatchObject({
      code: 'invalid-response',
    });
  },
);

test('unknown authorization and raw native failures become fixed safe errors', async () => {
  const module = bridge();
  module.getAuthorizationStatus.mockResolvedValue(true);
  await expect(NativeReminders.getAuthorizationStatus()).rejects.toMatchObject({
    code: 'invalid-response',
  });
  module.requestAccess.mockRejectedValue(
    new Error('Synthetic private error detail'),
  );
  await expect(NativeReminders.requestAccess()).rejects.toEqual(
    new RemindersError('authorization-failed'),
  );
  module.fetchDueToday.mockRejectedValue({
    code: 'unexpected',
    message: 'Synthetic private error detail',
  });
  await expect(NativeReminders.fetchDueToday()).rejects.toEqual(
    new RemindersError('read-failed'),
  );
  module.fetchDueToday.mockRejectedValue({
    code: 'denied',
    message: 'Synthetic private error detail',
  });
  await expect(NativeReminders.fetchDueToday()).rejects.toEqual(
    new RemindersError('denied'),
  );
});

test('returns only the documented fields, without carrying extra native content', async () => {
  const module = bridge();
  const fixture = remindersFixture();
  module.fetchDueToday.mockResolvedValue({
    ...fixture,
    extra: 'Synthetic private data',
    reminders: fixture.reminders.map(reminder => ({
      ...reminder,
      notes: 'Synthetic note',
    })),
  });
  expect(await NativeReminders.fetchDueToday()).toEqual(fixture);
});

test('serializes reads across consumers and refuses to queue permission requests', async () => {
  const module = bridge();
  const pending = deferred<ReturnType<typeof remindersFixture>>();
  module.fetchDueToday.mockReturnValueOnce(pending.promise);
  const first = NativeReminders.fetchDueToday();
  const second = NativeReminders.getAuthorizationStatus();
  await Promise.resolve();
  expect(module.fetchDueToday).toHaveBeenCalledTimes(1);
  expect(module.getAuthorizationStatus).not.toHaveBeenCalled();
  await expect(NativeReminders.requestAccess()).rejects.toMatchObject({
    code: 'busy',
  });
  pending.resolve(remindersFixture());
  await first;
  expect(await second).toBe('authorized');
  expect(module.requestAccess).not.toHaveBeenCalled();
  expect(await NativeReminders.requestAccess()).toBe('authorized');
});
