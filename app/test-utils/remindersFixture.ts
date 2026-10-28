import type { RemindersSnapshot } from '../src/reminders/reminders';

export const remindersNow = Date.UTC(2026, 9, 27, 12);

export function remindersFixture(): RemindersSnapshot {
  return {
    day: {
      date: '2026-10-27',
      timeZone: 'UTC',
      startsAt: Date.UTC(2026, 9, 27),
      endsAt: Date.UTC(2026, 9, 28),
    },
    reminders: [
      {
        id: 'example-date-only',
        title: 'Example date-only reminder',
        due: { kind: 'date-only', date: '2026-10-27' },
      },
      {
        id: 'example-timed',
        title: 'Example timed reminder',
        due: { kind: 'timed', at: Date.UTC(2026, 9, 27, 9) },
      },
    ],
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
