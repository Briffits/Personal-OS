import { createCalendarGapFormatter } from '../src/calendar/formatCalendarGap';

test('distinguishes repeated local clock times with explicit UTC offsets', () => {
  const format = createCalendarGapFormatter('America/New_York');
  const startsAt = Date.parse('2026-11-01T01:30:00-04:00');
  const endsAt = Date.parse('2026-11-01T01:30:00-05:00');
  const label = format.gap({ startsAt, endsAt }, startsAt - 1);
  expect(label.visible).toContain('GMT-4');
  expect(label.visible).toContain('GMT-5');
  expect(label.spoken).toContain('from');
  expect(label.spoken).toContain('to');
  expect(label.spoken).toContain('60 elapsed minutes');
});

test('uses Now for an ongoing gap, and the next local date for a midnight end', () => {
  const format = createCalendarGapFormatter('Asia/Kathmandu');
  const startsAt = Date.parse('2026-10-29T17:45:00Z');
  const endsAt = Date.parse('2026-10-29T18:15:00Z');
  const label = format.gap({ startsAt, endsAt }, startsAt);
  expect(label.visible).toBe(`Now – ${format.instant(endsAt)}`);
  expect(label.visible).toContain('30');
  expect(label.visible).toContain('GMT+5:45');
  expect(label.spoken).toContain('from Now to');
  expect(label.duration).toBe('At least 30 minutes');
});

test('preserves seconds/milliseconds at event endpoints and rounds duration down', () => {
  const format = createCalendarGapFormatter('UTC');
  const startsAt = Date.parse('2026-10-29T13:00:10.123Z');
  const endsAt = Date.parse('2026-10-29T13:15:40Z');
  const label = format.gap({ startsAt, endsAt }, startsAt - 1);
  expect(label.visible).toContain('10.123');
  expect(label.visible).toContain(':40');
  expect(label.duration).toBe('At least 15 minutes');
});
