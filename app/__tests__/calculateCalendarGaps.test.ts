import {
  calculateCalendarGaps,
  minimumCalendarGapMs,
} from '../src/calendar/calculateCalendarGaps';
import type { CalendarSnapshot } from '../src/calendar/calendar';
import { calendarFixture, calendarNow } from '../test-utils/calendarFixture';

const minute = 60_000;
const day = calendarFixture().day;
function snapshot(intervals: readonly (readonly [number, number])[]) {
  return {
    day,
    events: intervals.map(([startsAt, endsAt], index) => ({
      occurrenceId: `synthetic-${index}`,
      title: 'Example event',
      time: { kind: 'timed' as const, startsAt, endsAt },
    })),
  };
}
function gaps(intervals: readonly (readonly [number, number])[]) {
  return {
    kind: 'ready',
    gaps: intervals.map(([startsAt, endsAt]) => ({ startsAt, endsAt })),
  };
}

test('empty successful input yields only now to the native next-day boundary', () => {
  expect(calculateCalendarGaps(snapshot([]), calendarNow)).toEqual(
    gaps([[calendarNow, day.endsAt]]),
  );
});

test.each([0, 1, 14 * minute, 15 * minute - 1, 15 * minute, 15 * minute + 1])(
  'minimum threshold is inclusive at exact elapsed milliseconds: %s',
  remaining => {
    const now = day.endsAt - remaining;
    expect(calculateCalendarGaps(snapshot([]), now)).toEqual(
      remaining === 0
        ? { kind: 'unavailable' }
        : remaining >= minimumCalendarGapMs
        ? gaps([[now, day.endsAt]])
        : gaps([]),
    );
  },
);

test('clips overnight, in-progress and tomorrow-spanning events; ignores past/boundary-only intervals', () => {
  const firstEnd = calendarNow + 30 * minute;
  const lastStart = day.endsAt - 60 * minute;
  const input = snapshot([
    [day.startsAt - minute, day.startsAt],
    [day.startsAt, calendarNow],
    [day.startsAt - minute, firstEnd],
    [lastStart, day.endsAt + minute],
    [day.endsAt, day.endsAt + minute],
  ]);
  expect(calculateCalendarGaps(input, calendarNow)).toEqual(
    gaps([[firstEnd, lastStart]]),
  );
});

test('a multi-day timed event covering the window leaves no gaps', () => {
  expect(
    calculateCalendarGaps(
      snapshot([[day.startsAt - minute, day.endsAt + minute]]),
      calendarNow,
    ),
  ).toEqual(gaps([]));
});

test('merges unsorted, overlapping, nested, identical and adjacent intervals', () => {
  const at = (minutes: number) => calendarNow + minutes * minute;
  expect(
    calculateCalendarGaps(
      snapshot([
        [at(90), at(120)],
        [at(45), at(75)],
        [at(30), at(60)],
        [at(35), at(40)],
        [at(30), at(60)],
        [at(75), at(90)],
      ]),
      calendarNow,
    ),
  ).toEqual(
    gaps([
      [at(0), at(30)],
      [at(120), day.endsAt],
    ]),
  );
});

test('does not bridge a short real gap or round it up to the minimum', () => {
  const end = calendarNow + 20 * minute;
  const start = end + 15 * minute - 1;
  expect(
    calculateCalendarGaps(
      snapshot([
        [calendarNow, end],
        [start, day.endsAt],
      ]),
      calendarNow,
    ),
  ).toEqual(gaps([]));
});

test('retains every qualifying gap in chronological order', () => {
  const at = (minutes: number) => calendarNow + minutes * minute;
  expect(
    calculateCalendarGaps(
      snapshot([
        [at(15), at(20)],
        [at(35), at(40)],
        [at(55), day.endsAt],
      ]),
      calendarNow,
    ),
  ).toEqual(
    gaps([
      [at(0), at(15)],
      [at(20), at(35)],
      [at(40), at(55)],
    ]),
  );
});

test('point events do not split gaps or invent buffers', () => {
  expect(
    calculateCalendarGaps(
      snapshot([
        [calendarNow, calendarNow],
        [calendarNow + minute, calendarNow + minute],
        [day.endsAt, day.endsAt],
      ]),
      calendarNow,
    ),
  ).toEqual(gaps([[calendarNow, day.endsAt]]));
});

test('all-day-only input remains advisory, including multi-day civil spans', () => {
  expect(
    calculateCalendarGaps(
      { day, events: [calendarFixture().events[0]] },
      calendarNow,
    ),
  ).toEqual(gaps([[calendarNow, day.endsAt]]));
});

test('mixed all-day/timed input subtracts only timed intervals without changing any source data', () => {
  const timed = snapshot([[calendarNow + minute * 30, day.endsAt]]);
  const input = { day, events: [calendarFixture().events[0], ...timed.events] };
  const before = JSON.stringify(input);
  Object.freeze(input.day);
  for (const event of input.events) {
    Object.freeze(event.time);
    Object.freeze(event);
  }
  Object.freeze(input.events);
  Object.freeze(input);
  expect(calculateCalendarGaps(input, calendarNow)).toEqual(
    gaps([[calendarNow, calendarNow + minute * 30]]),
  );
  expect(JSON.stringify(input)).toBe(before);
});

test.each([day.startsAt - 1, day.endsAt, day.endsAt + 1, NaN, Infinity, 0.5])(
  'stale/future-day or invalid current instant %s cannot produce gaps',
  now => {
    expect(calculateCalendarGaps(snapshot([]), now)).toEqual({
      kind: 'unavailable',
    });
  },
);

test.each([
  [NaN, day.endsAt],
  [calendarNow, Infinity],
  [calendarNow + 1, calendarNow],
  [calendarNow + 0.5, day.endsAt],
  [-8.64e15 - 1, day.endsAt],
])('invalid timed interval %s–%s fails closed', (start, end) => {
  expect(calculateCalendarGaps(snapshot([[start, end]]), calendarNow)).toEqual({
    kind: 'unavailable',
  });
});

test.each([
  { ...day, startsAt: NaN },
  { ...day, endsAt: Infinity },
  { ...day, endsAt: day.startsAt },
  { ...day, endsAt: day.startsAt - 1 },
])('invalid day boundaries fail closed: %o', invalidDay => {
  expect(
    calculateCalendarGaps({ day: invalidDay, events: [] }, calendarNow),
  ).toEqual({ kind: 'unavailable' });
});

test.each([
  [
    'America/New_York',
    '2026-03-08',
    '2026-03-08T05:00:00Z',
    '2026-03-09T04:00:00Z',
    23,
  ],
  [
    'America/New_York',
    '2026-11-01',
    '2026-11-01T04:00:00Z',
    '2026-11-02T05:00:00Z',
    25,
  ],
  [
    'Australia/Lord_Howe',
    '2026-10-04',
    '2026-10-03T13:30:00Z',
    '2026-10-04T13:00:00Z',
    23.5,
  ],
  [
    'Australia/Lord_Howe',
    '2026-04-05',
    '2026-04-04T13:00:00Z',
    '2026-04-05T13:30:00Z',
    24.5,
  ],
  [
    'Asia/Kathmandu',
    '2026-10-29',
    '2026-10-28T18:15:00Z',
    '2026-10-29T18:15:00Z',
    24,
  ],
] as const)(
  'uses supplied local boundaries for %s on %s, including DST and UTC-date disagreement',
  (timeZone, date, start, end, hours) => {
    const startsAt = Date.parse(start);
    const endsAt = Date.parse(end);
    const input: CalendarSnapshot = {
      day: { timeZone, date, startsAt, endsAt },
      events: [
        {
          ...calendarFixture().events[0],
          time: { kind: 'all-day', startsOn: date, endsBefore: '2027-01-01' },
        },
      ],
    };
    expect(endsAt - startsAt).toBe(hours * 60 * minute);
    expect(calculateCalendarGaps(input, startsAt)).toEqual(
      gaps([[startsAt, endsAt]]),
    );
    expect(calculateCalendarGaps(input, endsAt - minimumCalendarGapMs)).toEqual(
      gaps([[endsAt - minimumCalendarGapMs, endsAt]]),
    );
    expect(calculateCalendarGaps(input, endsAt)).toEqual({
      kind: 'unavailable',
    });
  },
);

test.each([
  [
    '2026-03-08T01:55:00-05:00',
    '2026-03-08T03:10:00-04:00',
    '2026-03-08T00:00:00-05:00',
    '2026-03-09T00:00:00-04:00',
  ],
  [
    '2026-11-01T01:55:00-04:00',
    '2026-11-01T01:10:00-05:00',
    '2026-11-01T00:00:00-04:00',
    '2026-11-02T00:00:00-05:00',
  ],
])(
  '15 elapsed minutes qualifies across an offset change: %s to %s',
  (start, end, dayStart, dayEnd) => {
    const startsAt = Date.parse(start);
    const endsAt = Date.parse(end);
    const input = {
      day: {
        date: start.slice(0, 10),
        timeZone: 'America/New_York',
        startsAt: Date.parse(dayStart),
        endsAt: Date.parse(dayEnd),
      },
      events: snapshot([[endsAt, Date.parse(dayEnd)]]).events,
    };
    expect(calculateCalendarGaps(input, startsAt)).toEqual(
      gaps([[startsAt, endsAt]]),
    );
    expect(endsAt - startsAt).toBe(minimumCalendarGapMs);
  },
);
