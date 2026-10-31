import type { CalendarSnapshot } from './calendar';

export const minimumCalendarGapMs = 15 * 60_000;

export type CalendarGap = {
  readonly startsAt: number;
  readonly endsAt: number;
};

export type CalendarGapsResult =
  | { readonly kind: 'ready'; readonly gaps: readonly CalendarGap[] }
  | { readonly kind: 'unavailable' };

function validInstant(value: number) {
  return Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15;
}

/**
 * Derive gaps from an adapter-validated snapshot, without changing its rows.
 * Native owns day boundaries, membership, recurrence and cancellation. Missing
 * availability/response metadata is never inferred; all-day rows are advisory.
 */
export function calculateCalendarGaps(
  snapshot: CalendarSnapshot,
  now: number,
): CalendarGapsResult {
  const { day } = snapshot;
  if (
    !validInstant(now) ||
    !validInstant(day.startsAt) ||
    !validInstant(day.endsAt) ||
    day.startsAt >= day.endsAt ||
    now < day.startsAt ||
    now >= day.endsAt
  ) {
    return { kind: 'unavailable' };
  }

  const intervals: CalendarGap[] = [];
  for (const { time } of snapshot.events) {
    if (time.kind === 'all-day') {
      continue;
    }
    if (
      !validInstant(time.startsAt) ||
      !validInstant(time.endsAt) ||
      time.endsAt < time.startsAt
    ) {
      return { kind: 'unavailable' };
    }
    const startsAt = Math.max(now, time.startsAt);
    const endsAt = Math.min(day.endsAt, time.endsAt);
    if (startsAt < endsAt) {
      intervals.push({ startsAt, endsAt });
    }
  }
  intervals.sort((a, b) => a.startsAt - b.startsAt || a.endsAt - b.endsAt);

  const gaps: CalendarGap[] = [];
  let cursor = now;
  // Advancing to the furthest end merges overlapping/adjacent intervals,
  // including nested and identical intervals, without a second stored list.
  for (const interval of intervals) {
    if (interval.startsAt - cursor >= minimumCalendarGapMs) {
      gaps.push({ startsAt: cursor, endsAt: interval.startsAt });
    }
    cursor = Math.max(cursor, interval.endsAt);
  }
  if (day.endsAt - cursor >= minimumCalendarGapMs) {
    gaps.push({ startsAt: cursor, endsAt: day.endsAt });
  }
  return { kind: 'ready', gaps };
}
