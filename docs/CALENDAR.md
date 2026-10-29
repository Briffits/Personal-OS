# Calendar today — VPS slice and Mac handover

Base: `5f29b109368d7963e93f934228ee665b87dbe2f0`.
Scope: a read-only Today → Calendar today → Back to Today view. This document
and `app/src/calendar/calendar.ts` define the native contract before UI work.
The VPS implements TypeScript, navigation and synthetic tests only. Native
Calendar support is absent until the Mac work below is implemented and validated.

## Contract: NativeModules.CalendarEvents

Expose exactly three parameterless promise methods, with no event subscription,
callback protocol or write methods:

```ts
type CalendarAuthorization =
  | 'notDetermined'
  | 'authorized'
  | 'writeOnly'
  | 'denied'
  | 'restricted'
  | 'unavailable';

getAuthorizationStatus(): Promise<CalendarAuthorization>;
requestAccess(): Promise<CalendarAuthorization>;
fetchToday(): Promise<CalendarSnapshot>;

type CalendarSnapshot = {
  day: {
    date: string;     // Gregorian YYYY-MM-DD, current local day
    timeZone: string; // IANA zone supported by Intl (UTC is also accepted)
    startsAt: number; // Unix milliseconds, inclusive local midnight
    endsAt: number;   // Unix milliseconds, exclusive next local midnight
  };
  events: Array<{
    occurrenceId: string;
    title: string; // Empty is allowed; UI displays “Untitled event”.
    time:
      | { kind: 'all-day'; startsOn: string; endsBefore: string }
      | { kind: 'timed'; startsAt: number; endsAt: number };
  }>;
};
```

`authorized` means usable full event access: `.fullAccess` on iOS 17+, or legacy
`.authorized` on earlier supported iOS. Preserve `.writeOnly` as `writeOnly`;
never treat it as readable or query events to discover whether access works.
Unknown/unusable statuses fail closed as `unavailable`. Authorization for
Reminders is separate and must not be requested or consulted as Calendar consent.

`getAuthorizationStatus` only checks status, without creating a store unnecessarily,
prompting or fetching. `requestAccess` is the sole prompting method and returns
the resulting normalized status, not the request callback Boolean. It may request
access from `notDetermined` or upgrade from `writeOnly`; other states return their
current status without prompting. Check active foreground state immediately before
the request, reject overlap as `busy`, and never queue a prompt for later.

`fetchToday` checks full access before querying and again before publication.
It must not trigger an implicit access upgrade from write-only. Return empty
events only after an authorized successful query, never for denial/failure.

## Native membership, identity and ordering

1. Capture current local Gregorian day and time zone using native Calendar
   arithmetic. Calculate `[startsAt, endsAt)` from local start of day and the next
   local start of day; never add 86,400 seconds. Return the actual boundaries,
   including DST short/long days. Recheck day, zone and authorization at completion;
   reject `read-failed` if day/zone changed, rather than relabelling old data.
2. Query EventKit occurrences for that day across all accessible event calendars
   (`calendars: nil`). Use a bounded event predicate and native overlap checks;
   do not fetch the entire calendar history. Retain earlier-today events. No
   availability, invitation-response or calendar-preference filter is introduced.
   Exclude events explicitly reported as canceled by EventKit. Query only fields
   needed for the contract, identity and membership; do not project notes, URLs,
   attendees, organizer, location, alarms or calendar names into JavaScript.
3. Timed events retain their original start/end instants, including multi-day
   spans. For positive duration, include exactly when
   `event.startsAt < day.endsAt && event.endsAt > day.startsAt`. Thus an event
   ending at today's midnight is excluded; one starting at tomorrow's midnight is
   excluded. For a zero-duration event, include when
   `day.startsAt <= event.startsAt && event.startsAt < day.endsAt`. Reject inverted
   or invalid intervals. EventKit resolves floating times; JS must not resolve them.
4. All-day events use real Gregorian civil dates in the native reader's local
   calendar interpretation, with `endsBefore` exclusive and greater than `startsOn`.
   Preserve the full span. Include when `startsOn <= day.date < endsBefore`.
   Extract civil dates natively in the captured local zone; never serialize an
   all-day date as UTC midnight and shift it in JavaScript. Validate actual EventKit
   all-day and floating-time delivery on Mac/device, especially across zones/DST.
5. Use EventKit's returned occurrences; do not implement a recurrence engine.
   Build `occurrenceId` as a collision-free opaque encoding of the tuple
   `(calendarIdentifier, eventIdentifier, occurrenceDate-or-null)`. Encode tuple
   components unambiguously (for example a JSON array), using Unix milliseconds
   for a non-null original occurrence date. Recurring/detached instances need
   their original occurrence date, not their potentially moved start time.
   Missing required identifiers or missing recurrence discrimination fail the read.
   The key must be stable for an unchanged occurrence across refreshes, distinguish
   occurrences/calendars and remain opaque to JS. It is not a durable cross-sync
   identity and is never persisted. Calendar moves/sync may change identifiers.
6. Collapse identical repeated rows for the same occurrence ID natively. If that
   ID has conflicting title/time data, reject `read-failed`; never pick one silently.
   Preserve distinct IDs even with identical titles/times. The JS adapter rejects
   any remaining duplicate ID, including identical rows, as `invalid-response`.
7. Return all-day rows first, ordered by `startsOn`, `endsBefore`, then
   `occurrenceId`; timed rows follow, ordered by `startsAt`, `endsAt`, then
   `occurrenceId`. String comparisons are ordinal, not locale/title sorting.
   JS neither sorts nor filters. Native tests must prove these rules independently.

Wire timestamps are finite integer milliseconds within JavaScript Date's range.
Civil dates use four-digit years 0001–9999 and valid Gregorian month/day values.
The adapter validates fields, interval direction, display-zone support and unique
IDs, and strips extra fields. These checks do not establish native membership,
correct local-day calculation or ordering.

## Errors and concurrency

Reject with a fixed `code` and a generic content-free message:

| Code                   | Meaning / UI result                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `unavailable`          | Unsupported service/build; no access button.                                             |
| `not-authorized`       | Access not requested; explicit Allow Calendar access button.                             |
| `write-only`           | Insufficient read access; explicit full-access upgrade button.                           |
| `denied`               | Access denied/revoked; explanation and explicit Settings button.                         |
| `restricted`           | System restriction; explanation, no request button.                                      |
| `authorization-failed` | Operational access-request failure; retryable error.                                     |
| `read-failed`          | Query/status failure, stale day/zone, invalid native event data or bounded read timeout. |
| `busy`                 | Cannot start now; retryable error, no queued prompt.                                     |
| `invalid-response`     | Adapter-detected malformed/duplicate wire payload.                                       |

Native errors must not include EventKit descriptions or event content. The adapter
keeps only recognized codes and fixed text; unknown errors become `read-failed` or
`authorization-failed`, according to the operation.

Retain a lazy EventKit store and serialize its operations across module/screen
lifetimes. Perform expensive reads off the main UI thread with appropriate store
confinement; initiate access requests while foregrounded on the main queue.
Status/read promises must settle; provide a bounded read deadline (30 seconds)
and discard late results. A timeout is not proof of native cancellation: keep any
still-running underlying work gated, reject new work as busy until it finishes,
and never publish its late rows. Authorization remains gated until the OS request
settles. Back remains usable throughout; no automatic authorization retry.

## Screen refresh and privacy

Data flow: `CalendarScreen → useCalendar → NativeCalendar → CalendarEvents`.
Navigation uses existing in-memory React state and hides tabs on the secondary
screen. No other data domain is called. Native absence/incomplete methods produce
“Calendar is unavailable in this build.” Production contains no fixture fallback.

Entry, manual Refresh/Retry and foreground return check status before any read.
Only `authorized` fetches. Only a foreground explicit Allow Calendar access tap
requests permission, including upgrade from write-only. Denied access offers
`Linking.openSettings()` on an explicit tap, with an actionable failure message.
Retry and return from Settings only recheck status; they never request access.

Refresh/inactivity clears old rows. Generation checks prevent stale, backgrounded
or unmounted responses from publishing or starting a later fetch. Refreshes during
an operation coalesce into one later non-prompting read. Adapter calls serialize
across remounts; permission requests reject busy instead of joining that queue.

After a fresh snapshot, the UI schedules one timer for
`snapshot.day.endsAt - Date.now()`. A snapshot whose day has not started or has
ended is a retryable error, without an automatic retry loop. The timer refreshes
status/data; it never calculates midnight, event membership or recurrence. Clear
the timer on refresh, inactivity and unmount. Foreground return obtains a new
native day/zone after missed timers. No background fetch, polling or EventKit change
subscription is added; manual/foreground refresh is the update mechanism within
the day. A time-zone change while continuously active is reflected on the next
refresh; there is no immediate time-zone observer in this slice.

All-day rows say “All day”; timed rows show original start/end dates and times in
the snapshot's time zone so overnight spans are not misrepresented. Only screen
memory holds event content. No persistent cache, analytics, logs, network calls,
write methods, event editor or automatic settings navigation is introduced.

## Exact remaining Mac work

- Add a small `CalendarEvents` Swift module/Objective-C bridge with the methods
  above, an injected-store native reader/coordinator, and an EventKit adapter.
  Keep Calendar independent of Medication, Health and Reminders implementation.
- Wire those native sources into the existing target. Add
  `NSCalendarsFullAccessUsageDescription` for iOS 17+ and the legacy
  `NSCalendarsUsageDescription` if earlier supported iOS remains supported.
  Use availability-guarded full-event access APIs and legacy event authorization
  only on earlier OS versions. No deployment-target, signing, entitlement,
  dependency, storage or Health change is required by this contract.
- Explain the permission scope honestly: iOS requires full event access for reads,
  while Personal OS exposes read-only behaviour. No Contacts or Reminders request,
  EventKitUI editor, save/remove/commit operation or private URL scheme belongs here.
- Verify installed SDK APIs and exact occurrence-ID construction, including
  recurring and detached event identity. Test all membership/order rules using
  an injected store and synthetic data, including 23/25-hour days, midnight
  endpoints, point events, multi-day/all-day spans, floating/explicit zones,
  duplicate/conflicting occurrences, missing titles, cancellation, restricted/
  write-only/revoked access, day/zone changes in flight, slow reads and late results.
- Compile/link the iOS app and verify module registration and actual wire values.
  Then conduct separately authorized synthetic-only device validation of explicit
  allow/deny/upgrade, Settings return, foreground edits, local records offline,
  rollover, time zones, VoiceOver focus/order, largest Dynamic Type, small screens
  and light/dark appearance. An isolated bundle alone does not isolate EventKit
  data; use a device/account with synthetic calendar data only. Capture no personal
  content. Mock tests and compilation do not establish these device behaviours.

Apple references: [access levels and usage descriptions](https://developer.apple.com/documentation/eventkit/accessing-the-event-store),
[event-range predicate](<https://developer.apple.com/documentation/eventkit/ekeventstore/predicateforevents(withstart:end:calendars:)>),
[original occurrence date](https://developer.apple.com/documentation/eventkit/ekevent/occurrencedate),
and [event identifier limitations](https://developer.apple.com/documentation/eventkit/ekevent/eventidentifier).

## Roadmap reconciliation and exclusions

This is only milestone 5's event-view slice. Available-time calculation remains
separate, as do conflict detection, scheduling, priority ranking, Help Me Start,
daily briefing, background work and richer Calendar features. No Calendar writes
or new persistence are authorized.

**Gmail remains in the agreed 1.0 scope unless explicitly changed.** This user
clarification conflicts with the overview's final development-plan paragraph,
README's “later phases” wording, and AGENTS.md's default exclusion of Gmail unless
requested. Record that conflict rather than silently moving Gmail post-1.0.
Gmail implementation is not part of this Calendar task. These older roadmap files
are unchanged here; this note records the governing scope clarification.

The completed Health medication-access slice uses explicit Connect and Health-app
management. FB25287175 remains upstream, with the accepted workaround non-blocking;
no diagnostic investigation is reopened. Broader Health-to-stock work is separate
and is not completed by object access or medication-v2 compatibility. Both synthetic
compatibility rehearsals are complete. Production startup, retained-medication
display and cold-relaunch passes are user observations, not field-level storage
verification.

Previously deferred lifecycle cleanup, administration instructions and optical
prescription support remain separate post-1.0 enhancements. No roadmap expansion,
backend, extra platform, dependency install or deployment change is included.

## VPS validation

Completed on the isolated `feat/calendar-today-vps` worktree at the base above.
Existing installed dependencies were independently copied after both
`package.json` and `package-lock.json` hashes matched the base; nothing was
installed and dependency manifests/lockfiles are unchanged.

From `app`:

```sh
./node_modules/.bin/tsc --noEmit
npm run lint -- --max-warnings=0
npm test -- --runInBand --watchman=false
```

- TypeScript and ESLint passed, with zero lint warnings.
- Final full Jest run: **19 suites / 542 tests passed**. The initial focused run
  passed 103 tests across adapter/screen/App suites. Additional coverage was then
  added; the first full run passed 541/542 tests, with one test selector mistakenly
  including navigation buttons among accessible event rows. The selector was
  corrected to distinguish rows from buttons; the complete suite then passed.
  No runtime fix or reduced assertion was needed for that test failure.
- Changed-file Prettier and whitespace checks passed.
- Reviewed the full changed-file set, native boundary, permission call sites,
  error sanitization and domain isolation. No native/configuration, dependency,
  storage, Health, content logging or deployment change is included.

Synthetic tests cover normalized authorization (including write-only), unavailable
bridges, invalid/duplicate payloads, stripping extra fields, occurrence preservation,
original event spans and native order, malformed civil dates/intervals, explicit
permission gating, request failures and non-readable results, Settings return,
stale/unmounted callbacks, foreground/manual coalescing, clear-on-refresh/revocation,
native-supplied 23/25-hour and rollover boundaries, expired/future snapshots, timer
cleanup, read-only rows, overnight formatting, missing titles, and navigation
isolation from other domains. Renderer checks cover labels, grouped rows,
44-point targets and uncapped text in both appearances at enlarged text sizes.

No EventKit query, native test/build, app installation/launch, device operation,
personal-data access or actual iOS permission request was performed. Native
membership, occurrence expansion/identity, real DST/time-zone delivery, offline
EventKit behaviour and physical VoiceOver/layout remain Mac/device obligations.
VPS checks do not make the complete Calendar integration functional: the present
build correctly displays unavailable until the bridge is implemented.

## Exact file scope

Modified:

```text
app/App.tsx
app/__tests__/App.test.tsx
app/src/screens/TodayScreen.tsx
```

Added:

```text
app/__tests__/CalendarScreen.test.tsx
app/__tests__/NativeCalendar.test.ts
app/src/calendar/calendar.ts
app/src/calendar/useCalendar.ts
app/src/native/NativeCalendar.ts
app/src/screens/CalendarScreen.tsx
app/test-utils/calendarFixture.ts
docs/CALENDAR.md
```

## Complete pre-commit review

Reviewed all 11 files against the pinned base and approved VPS boundary. No blocking
implementation defect was found and no runtime correction was needed. The review
confirmed:

- Permission requests require explicit foreground actions, including write-only
  upgrades. Status checks, refresh, rollover, Settings return and remount never
  request access automatically; pending requests are not replayed.
- Generation checks, clearing on inactivity/refresh, coalescing, serialized native
  calls, and subscription/timer cleanup protect against stale publication across
  refreshes and screen lifetimes. Native completion must still recheck access.
- JS uses only native day bounds for snapshot freshness and rollover. Foreground
  return reloads day/zone. A continuously foregrounded time-zone change waits for
  the next refresh, as documented; no new observer or polling was added.
- All-day dates remain civil dates. The occurrence-ID contract includes original
  recurrence discrimination; distinct occurrence IDs survive even with identical
  titles/times. JS rejects duplicate IDs instead of silently choosing/collapsing
  rows. Native identity construction and recurrence delivery remain unverified.
- Empty, error and unavailable outcomes stay distinct. Navigation, uncapped text,
  grouped event labels and minimum targets use established patterns. Actual
  VoiceOver focus/layout remains a physical-device check.
- There are no event writes, content logs, persistent caches, unrelated domain
  operations or native/configuration changes in the 11-file diff.

The full passing 19-suite / 542-test run above remains applicable: review changed
only this documentation. Recheck this file's formatting and the complete diff's
whitespace before committing; no additional Jest run or native/device validation
is claimed by this review. The initial VPS preparation performed no commit or
push; publication is a separate authorized step. No merge or installation is
part of either step.

Commit title: `Add read-only Calendar UI and native contract`.
