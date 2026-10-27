import { NativeModules } from 'react-native';
import {
  RemindersError,
  type DueReminder,
  type RemindersAuthorization,
  type RemindersErrorCode,
  type RemindersService,
  type RemindersSnapshot,
} from '../reminders/reminders';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RemindersError('invalid-response');
  }
  return value as Record<string, unknown>;
}

function native(): RemindersService {
  const module = NativeModules.Reminders as RemindersService | undefined;
  if (
    !module ||
    typeof module.getAuthorizationStatus !== 'function' ||
    typeof module.requestAccess !== 'function' ||
    typeof module.fetchDueToday !== 'function'
  ) {
    throw new RemindersError('unavailable');
  }
  return module;
}

function authorization(value: unknown): RemindersAuthorization {
  switch (value) {
    case 'notDetermined':
    case 'authorized':
    case 'denied':
    case 'restricted':
    case 'unavailable':
      return value;
    default:
      throw new RemindersError('invalid-response');
  }
}

function nonBlank(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new RemindersError('invalid-response');
  }
  return value;
}

function dateString(value: unknown): string {
  const date = nonBlank(value);
  // Wire shape only: calendar validity and day membership belong to EventKit.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RemindersError('invalid-response');
  }
  return date;
}

function timestamp(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Math.abs(value) > 8.64e15
  ) {
    throw new RemindersError('invalid-response');
  }
  return value;
}

function snapshot(value: unknown): RemindersSnapshot {
  const data = object(value);
  const day = object(data.day);
  const timeZone = nonBlank(day.timeZone);
  try {
    // Validate display support, without interpreting or filtering due dates.
    Intl.DateTimeFormat(undefined, { timeZone }).resolvedOptions();
  } catch {
    throw new RemindersError('invalid-response');
  }
  const startsAt = timestamp(day.startsAt);
  const endsAt = timestamp(day.endsAt);
  if (endsAt <= startsAt || !Array.isArray(data.reminders)) {
    throw new RemindersError('invalid-response');
  }
  const ids = new Set<string>();
  const reminders = data.reminders.map((item): DueReminder => {
    const record = object(item);
    const id = nonBlank(record.id);
    if (ids.has(id) || typeof record.title !== 'string') {
      throw new RemindersError('invalid-response');
    }
    ids.add(id);
    const due = object(record.due);
    if (due.kind !== 'date-only' && due.kind !== 'timed') {
      throw new RemindersError('invalid-response');
    }
    return {
      id,
      title: record.title,
      due:
        due.kind === 'date-only'
          ? { kind: 'date-only', date: dateString(due.date) }
          : { kind: 'timed', at: timestamp(due.at) },
    };
  });
  return {
    day: { date: dateString(day.date), timeZone, startsAt, endsAt },
    reminders,
  };
}

function sanitizedError(
  error: unknown,
  fallback: RemindersErrorCode,
): RemindersError {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  switch (code) {
    case 'unavailable':
    case 'not-authorized':
    case 'denied':
    case 'restricted':
    case 'authorization-failed':
    case 'read-failed':
    case 'invalid-response':
    case 'busy':
      return new RemindersError(code);
    default:
      return new RemindersError(fallback);
  }
}

// Serialize across screen lifetimes too: an unmounted screen's native promise
// may still be settling. Reads may wait; permission requests must never queue.
let tail: Promise<void> = Promise.resolve();
let pending = 0;
function perform<T>(
  operation: () => Promise<T>,
  fallback: RemindersErrorCode,
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

export const NativeReminders: RemindersService = {
  getAuthorizationStatus: () =>
    perform(
      async () => authorization(await native().getAuthorizationStatus()),
      'read-failed',
    ),
  requestAccess: () => {
    if (pending > 0) {
      return Promise.reject(new RemindersError('busy'));
    }
    return perform(
      async () => authorization(await native().requestAccess()),
      'authorization-failed',
    );
  },
  fetchDueToday: () =>
    perform(
      async () => snapshot(await native().fetchDueToday()),
      'read-failed',
    ),
};
