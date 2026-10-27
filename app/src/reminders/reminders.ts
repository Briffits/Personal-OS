export type RemindersAuthorization =
  | 'notDetermined'
  | 'authorized'
  | 'denied'
  | 'restricted'
  | 'unavailable';

export type ReminderDue =
  | { readonly kind: 'date-only'; readonly date: string }
  | { readonly kind: 'timed'; readonly at: number };

export type DueReminder = {
  readonly id: string;
  readonly title: string;
  readonly due: ReminderDue;
};

export type RemindersSnapshot = {
  readonly day: {
    /** Gregorian YYYY-MM-DD in the reader's current local time zone. */
    readonly date: string;
    readonly timeZone: string;
    /** Unix milliseconds. Native calendar arithmetic owns these boundaries. */
    readonly startsAt: number;
    readonly endsAt: number;
  };
  /** Already filtered and ordered by native code. Never filtered in JavaScript. */
  readonly reminders: readonly DueReminder[];
};

/** NativeModules.Reminders: three parameterless promise methods; no writes. */
export interface RemindersService {
  getAuthorizationStatus(): Promise<RemindersAuthorization>;
  /** Only an explicit foreground user action may call this method. */
  requestAccess(): Promise<RemindersAuthorization>;
  /** Must never prompt. Return only incomplete reminders due in the local day. */
  fetchDueToday(): Promise<RemindersSnapshot>;
}

export type RemindersErrorCode =
  | 'unavailable'
  | 'not-authorized'
  | 'denied'
  | 'restricted'
  | 'authorization-failed'
  | 'read-failed'
  | 'invalid-response'
  | 'busy';

export class RemindersError extends Error {
  constructor(readonly code: RemindersErrorCode) {
    // Never retain a native error message, payload or underlying error.
    super('The Reminders operation could not be completed.');
  }
}
