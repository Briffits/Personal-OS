import { AppState, NativeModules } from 'react-native';
import {
  CalendarError,
  type CalendarAuthorization,
  type CalendarErrorCode,
  type CalendarEvent,
  type CalendarEventTime,
  type CalendarService,
  type CalendarSnapshot,
} from '../calendar/calendar';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CalendarError('invalid-response');
  }
  return value as Record<string, unknown>;
}

function native(): CalendarService {
  const module = NativeModules.CalendarEvents as CalendarService | undefined;
  if (
    !module ||
    typeof module.getAuthorizationStatus !== 'function' ||
    typeof module.requestAccess !== 'function' ||
    typeof module.fetchToday !== 'function'
  ) {
    throw new CalendarError('unavailable');
  }
  return module;
}

function authorization(value: unknown): CalendarAuthorization {
  switch (value) {
    case 'notDetermined':
    case 'authorized':
    case 'writeOnly':
    case 'denied':
    case 'restricted':
    case 'unavailable':
      return value;
    default:
      throw new CalendarError('invalid-response');
  }
}

function nonBlank(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CalendarError('invalid-response');
  }
  return value;
}

function civilDate(value: unknown): string {
  const date = nonBlank(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new CalendarError('invalid-response');
  }
  // Validate the civil-date wire value only; never calculate day membership.
  const [year, month, day] = date.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new CalendarError('invalid-response');
  }
  return date;
}

function timestamp(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    Math.abs(value) > 8.64e15
  ) {
    throw new CalendarError('invalid-response');
  }
  return value;
}

function eventTime(value: unknown): CalendarEventTime {
  const time = object(value);
  if (time.kind === 'all-day') {
    const startsOn = civilDate(time.startsOn);
    const endsBefore = civilDate(time.endsBefore);
    if (endsBefore <= startsOn) {
      throw new CalendarError('invalid-response');
    }
    return { kind: 'all-day', startsOn, endsBefore };
  }
  if (time.kind === 'timed') {
    const startsAt = timestamp(time.startsAt);
    const endsAt = timestamp(time.endsAt);
    if (endsAt < startsAt) {
      throw new CalendarError('invalid-response');
    }
    return { kind: 'timed', startsAt, endsAt };
  }
  throw new CalendarError('invalid-response');
}

function snapshot(value: unknown): CalendarSnapshot {
  const data = object(value);
  const day = object(data.day);
  const timeZone = nonBlank(day.timeZone);
  try {
    Intl.DateTimeFormat(undefined, { timeZone }).resolvedOptions();
  } catch {
    throw new CalendarError('invalid-response');
  }
  const startsAt = timestamp(day.startsAt);
  const endsAt = timestamp(day.endsAt);
  if (endsAt <= startsAt || !Array.isArray(data.events)) {
    throw new CalendarError('invalid-response');
  }
  const ids = new Set<string>();
  const events = data.events.map((item): CalendarEvent => {
    const event = object(item);
    const occurrenceId = nonBlank(event.occurrenceId);
    if (ids.has(occurrenceId) || typeof event.title !== 'string') {
      throw new CalendarError('invalid-response');
    }
    ids.add(occurrenceId);
    return { occurrenceId, title: event.title, time: eventTime(event.time) };
  });
  return {
    day: { date: civilDate(day.date), timeZone, startsAt, endsAt },
    events,
  };
}

function sanitizedError(
  error: unknown,
  fallback: CalendarErrorCode,
): CalendarError {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  switch (code) {
    case 'unavailable':
    case 'not-authorized':
    case 'write-only':
    case 'denied':
    case 'restricted':
    case 'authorization-failed':
    case 'read-failed':
    case 'invalid-response':
    case 'busy':
      return new CalendarError(code);
    default:
      return new CalendarError(fallback);
  }
}

// The queue holds no snapshot cache. It prevents overlapping native operations
// across remounts. Explicit permission actions must never join a pending queue.
let tail: Promise<void> = Promise.resolve();
let pending = 0;
function perform<T>(
  operation: () => Promise<T>,
  fallback: CalendarErrorCode,
): Promise<T> {
  pending += 1;
  const result = tail.then(operation).catch(error => {
    throw sanitizedError(error, fallback);
  });
  tail = result.then(
    () => {
      pending -= 1;
    },
    () => {
      pending -= 1;
    },
  );
  return result;
}

export const NativeCalendar: CalendarService = {
  getAuthorizationStatus: () =>
    perform(
      async () => authorization(await native().getAuthorizationStatus()),
      'read-failed',
    ),
  requestAccess: () => {
    if (pending > 0 || AppState.currentState !== 'active') {
      return Promise.reject(new CalendarError('busy'));
    }
    return perform(async () => {
      if (AppState.currentState !== 'active') {
        throw new CalendarError('busy');
      }
      return authorization(await native().requestAccess());
    }, 'authorization-failed');
  },
  fetchToday: () =>
    perform(async () => snapshot(await native().fetchToday()), 'read-failed'),
};
