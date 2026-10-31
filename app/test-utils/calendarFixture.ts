import type { CalendarSnapshot } from '../src/calendar/calendar';

// Entirely synthetic: no device exports, calendar identifiers or personal data.
export const calendarNow = Date.UTC(2026, 9, 29, 12);

export function calendarFixture(): CalendarSnapshot {
  return {
    day: {
      date: '2026-10-29',
      timeZone: 'UTC',
      startsAt: Date.UTC(2026, 9, 29),
      endsAt: Date.UTC(2026, 9, 30),
    },
    events: [
      {
        occurrenceId: 'synthetic-all-day',
        title: 'Example all-day event',
        time: {
          kind: 'all-day',
          startsOn: '2026-10-28',
          endsBefore: '2026-10-31',
        },
      },
      {
        occurrenceId: 'synthetic-overnight',
        title: 'Example overnight event',
        time: {
          kind: 'timed',
          startsAt: Date.UTC(2026, 9, 28, 23),
          endsAt: Date.UTC(2026, 9, 29, 1),
        },
      },
      {
        occurrenceId: 'synthetic-timed',
        title: 'Example timed event',
        time: {
          kind: 'timed',
          startsAt: Date.UTC(2026, 9, 29, 9),
          endsAt: Date.UTC(2026, 9, 29, 10),
        },
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
