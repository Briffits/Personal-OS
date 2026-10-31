import type { CalendarEventTime } from './calendar';

/** Presentation only; the snapshot owns membership, ordering and civil spans. */
export function createCalendarTimeFormatter(timeZone: string) {
  const dateOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone,
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  };
  const date = new Intl.DateTimeFormat(undefined, dateOptions);
  const clock = new Intl.DateTimeFormat(undefined, timeOptions);
  const dateTime = new Intl.DateTimeFormat(undefined, {
    ...dateOptions,
    ...timeOptions,
  });

  return (time: CalendarEventTime) => {
    // Civil spans are already normalized natively. Never display endsBefore as
    // an included day or shift an all-day civil date through a time zone.
    if (time.kind === 'all-day') {
      return { visible: 'All day', spoken: 'All day' };
    }
    const startDate = date.format(time.startsAt);
    const endDate = date.format(time.endsAt);
    if (startDate === endDate) {
      const start = clock.format(time.startsAt);
      const end = clock.format(time.endsAt);
      return {
        visible: `${startDate}, ${start} – ${end}`,
        spoken: `${startDate}, from ${start} to ${end}`,
      };
    }
    const start = dateTime.format(time.startsAt);
    const end = dateTime.format(time.endsAt);
    return {
      visible: `${start} – ${end}`,
      spoken: `from ${start} to ${end}`,
    };
  };
}
