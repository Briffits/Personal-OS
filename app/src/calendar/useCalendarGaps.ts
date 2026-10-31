import { useEffect, useMemo, useReducer } from 'react';
import type { CalendarSnapshot } from './calendar';
import {
  calculateCalendarGaps,
  minimumCalendarGapMs,
} from './calculateCalendarGaps';

/** Mounted only for useCalendar's ready state; never reads or requests access. */
export function useCalendarGaps(snapshot: CalendarSnapshot) {
  const [, tick] = useReducer((value: number) => value + 1, 0);
  const now = Date.now();
  const result = useMemo(
    () => calculateCalendarGaps(snapshot, now),
    [snapshot, now],
  );

  useEffect(() => {
    if (result.kind !== 'ready') {
      return;
    }
    let next = Math.min(
      (Math.floor(now / 60_000) + 1) * 60_000,
      snapshot.day.endsAt,
    );
    for (const { time } of snapshot.events) {
      if (time.kind === 'timed') {
        for (const boundary of [time.startsAt, time.endsAt]) {
          if (boundary > now) {
            next = Math.min(next, boundary);
          }
        }
      }
    }
    for (const gap of result.gaps) {
      // Exactly 15 minutes qualifies; remove a shrinking gap one ms later.
      const belowMinimum = gap.endsAt - minimumCalendarGapMs + 1;
      if (belowMinimum > now) {
        next = Math.min(next, belowMinimum);
      }
    }
    const timer = setTimeout(tick, Math.max(1, next - Date.now()));
    // The parent removes this component on refresh, inactivity and unmount.
    return () => clearTimeout(timer);
  }, [snapshot, now, result]);

  return { now, result };
}
