import { createCalendarTimeFormatter } from '../src/calendar/formatCalendarEventTime';

const instant = (value: string) => Date.parse(value);

test.each([
  ['UTC', '2026-10-29T09:00:00Z', '2026-10-29T10:00:00Z', true],
  ['UTC', '2026-10-28T23:00:00Z', '2026-10-29T01:00:00Z', false],
  ['UTC', '2026-10-29T23:59:00Z', '2026-10-30T00:00:00Z', false],
  ['UTC', '2026-10-29T00:00:00Z', '2026-10-29T00:01:00Z', true],
  ['UTC', '2026-10-29T09:00:00Z', '2026-10-29T09:00:00Z', true],
  // UTC dates differ but both endpoints display on one Tokyo date.
  ['Asia/Tokyo', '2026-10-28T23:00:00Z', '2026-10-29T01:00:00Z', true],
  // UTC dates match but the display zone crosses midnight.
  ['America/New_York', '2026-10-29T03:59:00Z', '2026-10-29T04:00:00Z', false],
  ['Asia/Kathmandu', '2026-10-29T18:14:00Z', '2026-10-29T18:15:00Z', false],
  ['Europe/Malta', '2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z', true],
  ['UTC', '2026-12-31T23:00:00Z', '2027-01-01T01:00:00Z', false],
])(
  'formats %s %s to %s (same displayed date: %s)',
  (zone, startISO, endISO, sameDay) => {
    const time = Object.freeze({
      kind: 'timed' as const,
      startsAt: instant(startISO),
      endsAt: instant(endISO),
    });
    const dateOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: zone,
    };
    const clockOptions: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: zone,
    };
    const date = new Intl.DateTimeFormat(undefined, dateOptions);
    const endpoints = new Intl.DateTimeFormat(
      undefined,
      sameDay ? clockOptions : { ...dateOptions, ...clockOptions },
    );
    const start = endpoints.format(time.startsAt);
    const end = endpoints.format(time.endsAt);
    const prefix = sameDay ? `${date.format(time.startsAt)}, ` : '';
    const result = createCalendarTimeFormatter(zone)(time);
    expect(result.visible).toBe(`${prefix}${start} – ${end}`);
    expect(result.spoken).toBe(`${prefix}from ${start} to ${end}`);
    expect(result.spoken).not.toContain('–');
    // Formatting cannot change original endpoints or the input's identity.
    expect(time).toEqual({
      kind: 'timed',
      startsAt: instant(startISO),
      endsAt: instant(endISO),
    });
  },
);

test.each([
  ['2026-10-29', '2026-10-30'],
  ['2026-10-28', '2026-10-31'],
  ['2026-12-31', '2027-01-02'],
])(
  'preserves All day for civil span %s to exclusive %s without displaying an extra day',
  (startsOn, endsBefore) => {
    const time = Object.freeze({
      kind: 'all-day' as const,
      startsOn,
      endsBefore,
    });
    for (const zone of ['UTC', 'Pacific/Apia', 'America/New_York']) {
      expect(createCalendarTimeFormatter(zone)(time)).toEqual({
        visible: 'All day',
        spoken: 'All day',
      });
      expect(time).toEqual({ kind: 'all-day', startsOn, endsBefore });
    }
  },
);
