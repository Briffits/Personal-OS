import type { CalendarGap } from './calculateCalendarGaps';

export function createCalendarGapFormatter(timeZone: string) {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    // Explicit offsets distinguish repeated wall-clock times on DST fallback.
    timeZoneName: 'shortOffset',
    timeZone,
  };
  const clock = new Intl.DateTimeFormat(undefined, options);
  const seconds = new Intl.DateTimeFormat(undefined, {
    ...options,
    second: '2-digit',
  });
  const millisecondOptions = {
    ...options,
    second: '2-digit' as const,
    fractionalSecondDigits: 3,
  };
  const milliseconds = new Intl.DateTimeFormat(undefined, millisecondOptions);
  function instant(value: number) {
    // Do not round an event endpoint into time covered by an event.
    const formatter =
      value % 1000 !== 0
        ? milliseconds
        : value % 60_000 !== 0
        ? seconds
        : clock;
    return formatter.format(value);
  }
  return {
    readTime: (value: number) => clock.format(value),
    instant,
    gap: (gap: CalendarGap, now: number) => {
      const start = gap.startsAt === now ? 'Now' : instant(gap.startsAt);
      const end = instant(gap.endsAt);
      const minutes = Math.floor((gap.endsAt - gap.startsAt) / 60_000);
      const duration = `At least ${minutes} minutes`;
      return {
        visible: `${start} – ${end}`,
        duration,
        spoken: `Calendar gap, from ${start} to ${end}, at least ${minutes} elapsed minutes`,
      };
    },
  };
}
