export type CalendarAuthorization =
  | 'notDetermined'
  | 'authorized'
  | 'writeOnly'
  | 'denied'
  | 'restricted'
  | 'unavailable';

export type CalendarEventTime =
  | {
      readonly kind: 'all-day';
      /** Gregorian civil dates, with an exclusive end; never UTC instants. */
      readonly startsOn: string;
      readonly endsBefore: string;
    }
  | {
      readonly kind: 'timed';
      /** Unix milliseconds; equal endpoints represent a point event. */
      readonly startsAt: number;
      readonly endsAt: number;
    };

export type CalendarEvent = {
  /** Opaque occurrence identity, not a series ID, title or array index. */
  readonly occurrenceId: string;
  readonly title: string;
  readonly time: CalendarEventTime;
};

export type CalendarSnapshot = {
  readonly day: {
    /** Native reader's current local day, expressed as Gregorian YYYY-MM-DD. */
    readonly date: string;
    readonly timeZone: string;
    /** Native-calculated local midnight and next midnight; no fixed 24h day. */
    readonly startsAt: number;
    readonly endsAt: number;
  };
  /** Native owns membership, deduplication and order. JS preserves this array. */
  readonly events: readonly CalendarEvent[];
};

/** NativeModules.CalendarEvents: only these parameterless promise methods. */
export interface CalendarService {
  /** Status only. Never prompt or read events. Authorized means full read access. */
  getAuthorizationStatus(): Promise<CalendarAuthorization>;
  /** Only an explicit foreground tap may request/upgrade to full access. */
  requestAccess(): Promise<CalendarAuthorization>;
  /** Never prompt, including when access is write-only. See docs/CALENDAR.md. */
  fetchToday(): Promise<CalendarSnapshot>;
}

export type CalendarErrorCode =
  | 'unavailable'
  | 'not-authorized'
  | 'write-only'
  | 'denied'
  | 'restricted'
  | 'authorization-failed'
  | 'read-failed'
  | 'invalid-response'
  | 'busy';

export class CalendarError extends Error {
  constructor(readonly code: CalendarErrorCode) {
    // Never retain native messages, event content or underlying errors.
    super('The Calendar operation could not be completed.');
  }
}
