# Calendar today — VPS slice and Mac handover

Base: `5f29b109368d7963e93f934228ee665b87dbe2f0`.
Scope: a read-only Today → Calendar today → Back to Today view. This document
and `app/src/calendar/calendar.ts` define the native contract before UI work.
The VPS checkpoint implements TypeScript, navigation and synthetic tests. The Mac
native slice described below now implements the bridge and has passed synthetic
native tests, unsigned builds and no-permission Simulator navigation checks.
EventKit event delivery and physical-device validation remain outstanding.

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

The deadline bounds the promise, not the underlying EventKit operation. If that
operation never returns/calls back, the process-wide gate remains busy indefinitely.
Retry, Back/re-entry, foreground return and module remount do not release it or
start a second store operation. Status checks still work; no content is published
by the expired operation. Once underlying work finishes, the gate releases and a
subsequent explicit refresh can try again. If it never finishes, a cold process
restart creates a new coordinator and checks OS authorization again; it neither
proves native cancellation nor guarantees recovery from an OS-level problem.
There is no automatic permission re-request or process restart.

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

## Original Mac handover checklist

Implementation and build items are completed in the Mac native slice below.
The separately authorized runtime/device obligations remain outstanding.

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

## Mac native slice — initial implementation checkpoint

Started from verified PR #7 / `origin/feat/calendar-today-vps` head
`5f3e4e3aab9808b72611ad7f46e620f193fff468`, in an isolated detached Mac worktree.
PR #7 was verified open and draft. No shared TypeScript contract change was needed.

### Implementation

- `CalendarEventsModule.swift` and `CalendarEventsBridge.m` register exactly
  `getAuthorizationStatus`, `requestAccess` and `fetchToday` as promise methods.
  One lazy, main-confined coordinator survives module lifetimes; status inspection
  does not create an EventKit store. Only explicit `requestAccess` may prompt,
  including upgrading write-only access, and only when foregrounded. Errors expose
  fixed codes and content-free text, never underlying EventKit errors.
- `EventKitCalendarStore.swift` uses a separate lazy event store, full-event access
  on iOS 17+, and the guarded legacy event request on older supported iOS. Store
  ownership transfers exclusively between main-queue access requests and the serial
  read worker under the coordinator gate. Only value projections cross back to main.
  Reads use a bounded day predicate with `calendars: nil`, exclude canceled events,
  and do not prompt or call the Reminders store.
- `CalendarReader.swift` owns Gregorian local-day boundaries, half-open timed
  overlap/point events, exclusive all-day civil spans, original recurrence-date
  tuple identity, exact duplicate collapse/conflict rejection and deterministic
  all-day-first ordering. IDs use JSON arrays; exact encoded bytes distinguish
  Unicode variants, and tie ordering uses UTF-16 units to match JS ordinal order.
  Full original spans are preserved; no recurrence expansion is implemented here.
- Read and authorization promises have 30-second deadlines. A deadline settles
  the promise without claiming cancellation; the operation remains busy until
  underlying work finishes. Token guards ignore duplicate/late callbacks and
  stale timers. Status inspection remains available during outstanding work.
  Reads recheck access, local day and time zone before publishing.
- The Xcode target registers the four production source files. Info.plist adds
  full-access and legacy Calendar descriptions explaining that iOS requires full
  access for reads while Personal OS does not edit events. No write-only usage
  description, event mutations, content logging, persistence or event cache added.

### SDK verification and limits

Verified against Xcode 27.1 (27A9275), iPhoneOS 27.1 SDK headers `EKEvent.h`,
`EKEventStore.h`, and Apple's documentation for
[event access](https://developer.apple.com/documentation/eventkit/accessing-the-event-store),
[bounded predicates](<https://developer.apple.com/documentation/eventkit/ekeventstore/predicateforevents(withstart:end:calendars:)>),
and [original occurrence date](https://developer.apple.com/documentation/eventkit/ekevent/occurrencedate).
The installed headers confirm original occurrence dates survive detached-instance
start changes, floating/all-day values are returned in the default time zone,
and synchronous event queries should run off the main thread.

EventKit's synchronous `events(matching:)` API has no NSError/result-error channel.
The implementation detects observable access loss, invalid projected data and
deadlines; it cannot distinguish an undocumented internal failure that EventKit
silently represents as an empty array from a successful empty query. No contract
was changed and no permission or personal-data query was used to probe this.

A time-zone change while continuously foregrounded is reflected on the **next
refresh**. There is no immediate time-zone-change observer. Native completion
rejects a day/zone change during a read. EventKit's actual floating/all-day delivery,
recurrence discrimination and retained-store behavior across permission changes
still require authorized synthetic runtime validation.

### Mac validation

- `bash ios/tests/run-calendar-checks.sh`: **134 synthetic assertions passed**.
  The first pass had 125; additional ordering, serialized wire-shape, missing
  endpoint and authorization-error assertions increased the final count. Tests
  construct no EKEventStore and perform no access request. They cover 23/25-hour
  DST days, half-hour DST, non-hour zones, a skipped civil day, leap day, local vs
  UTC date, midnight endpoints and point events, all-day/multi-day spans, missing
  and invalid data, recurring/detached identities, duplicate conflicts, Unicode
  identity/order, cancellation, all access states, access loss, concurrent calls,
  deadlines, late/duplicate callbacks and day/zone changes during reads.
- `./node_modules/.bin/tsc --noEmit`: passed.
- `npm run lint -- --max-warnings=0`: passed.
- `npm test -- --runInBand --watchman=false NativeCalendar CalendarScreen App.test`:
  **3 suites / 119 tests passed**. This is the affected-suite run; the earlier VPS
  full-suite result is historical, not a new full-suite Mac run.
- Generic-iOS Release `xcodebuild`, with `CODE_SIGNING_ALLOWED=NO` and
  `CODE_SIGNING_REQUIRED=NO`, separate DerivedData and Metro startup disabled:
  **BUILD SUCCEEDED**. Static product inspection confirms Calendar registration
  selectors, both usage descriptions and bundled JavaScript. No app was launched;
  this does not establish a live React Native/EventKit bridge round trip.
- Complete diff whitespace check passed. Dependency and lockfiles, deployment
  targets, signing settings, storage, Health and Reminders sources are unchanged.
  Existing matching dependency/Pods directories were copied independently; no
  dependencies were installed. Existing worktrees, changes, stashes, Metro and
  installed apps were preserved. No commit, push or merge was performed.

### Remaining runtime work (not performed)

Use only a separately authorized synthetic Calendar account/device: an isolated
bundle does not isolate EventKit data. Verify live bridge payloads, full-access
allow/deny/write-only upgrade, Settings return/revocation, reads after access
changes, floating/all-day and detached recurrence delivery across zones/DST,
foreground edits/refresh, offline local events, midnight rollover, VoiceOver
focus/order, largest Dynamic Type, small-screen layout and light/dark appearance.
No personal calendar data, actual permission prompt, installation, physical-phone
launch or device test was part of this Mac slice.

### Exact Mac diff relative to the verified checkpoint

Added:

```text
app/ios/CalendarReader.swift
app/ios/EventKitCalendarStore.swift
app/ios/CalendarEventsModule.swift
app/ios/CalendarEventsBridge.m
app/ios/tests/CalendarTests.swift
app/ios/tests/run-calendar-checks.sh
```

Modified:

```text
app/ios/PersonalOS.xcodeproj/project.pbxproj
app/ios/PersonalOS/Info.plist
docs/CALENDAR.md
```

## Mac final review and Simulator validation

Reviewed the complete native diff against this contract and the unchanged
`app/src/calendar/calendar.ts`. One concrete implementation issue was corrected:
Foundation can produce a historical Julian leap date (for example `1500-02-29`)
through its Gregorian calendar. Native civil-date serialization now checks the
wire contract's Gregorian leap rules and rejects such invalid dates as
`read-failed`, rather than returning a payload the JS adapter rejects. Regression
tests cover the invalid historical date and the valid Gregorian century leap
date `1600-02-29`.

The timeout recovery description above is now explicit: a never-returning native
operation can keep the process-wide gate busy indefinitely. Repeated retries do
not launch another operation; status inspection and Back remain usable. A late
completion releases the gate without publishing stale content. A cold process
restart creates a new coordinator, but does not establish cancellation or promise
recovery from an OS fault. Additional tests cover repeated retries while no native
completion arrives. No unsafe gate reset, second store or invented error signal
was added. EventKit's silently returned empty-array limitation remains unchanged.

The review also confirmed explicit-only foreground access requests, write-only
read rejection, bounded native predicates, full original timed/all-day spans,
original recurrence discrimination, exact duplicate/conflict handling, ordinal
ordering, access/day/zone rechecks, fixed content-free errors, source registration
and both permission descriptions. No other blocking implementation finding was
identified within this slice. No storage, Health/Reminders, dependency, signing,
deployment-target or shared TypeScript changes were made.

### Evidence categories

**Synthetic/native:** final focused runner passed **146 assertions**, including
the review regressions. Static SDK access mapping tests instantiate no EventKit
store. TypeScript and zero-warning lint passed; affected Jest suites passed
**3 suites / 119 tests**. The unsigned generic-iOS Release build passed after the
date-validation correction. Earlier VPS full-suite results remain historical.

**Simulator runtime:** built a bundled-JavaScript Release with Metro startup
disabled, installed only on a newly created isolated iPhone 17 Pro Simulator
running iOS 27.0, and ran an external XCTest UI harness. **One UI test passed,
zero failures.** It verified:

- Today startup and Today → Calendar → Back navigation, including re-entry.
- The real adapter displayed the exact `notDetermined` explanation and explicit
  Allow Calendar access button, rather than native-unavailable or empty-events UI.
  This verifies runtime module availability: the adapter checks all three native
  methods before calling `getAuthorizationStatus`. It does not exercise the
  permission request or event-read methods.
- Three Refresh events taps kept the same unrequested-access state. Application
  and SpringBoard alert checks found no prompt before/after navigation and refresh.
- No Allow Calendar access, Settings or permission-dialog control was tapped.
  Read-only inspection of this new Simulator's Calendar permission metadata found
  no app-specific decisions before or after the test. No account was connected,
  permission granted/reset, or event data queried.

The external UI harness, screenshots and xcresult are retained with local build
evidence, outside the repository. No harness code or launch switch was injected
into the production app. The UI harness itself is not an event-data test.

**Outstanding physical/runtime:** actual allow/deny/write-only upgrade and Settings
return/revocation, authorized event reads and post-access-change behavior,
EventKit floating/all-day and recurring/detached occurrence delivery across zones
and DST, foreground event edits, local offline records, midnight rollover, and
physical VoiceOver/layout/Dynamic Type/appearance checks remain unperformed.
These require a separately authorized synthetic-only Calendar environment; no
physical iPhone was installed, launched or queried during this review.

A continuously foregrounded time-zone change still takes effect on the next
refresh only. No immediate time-zone-change detection is claimed.

Only the nine files listed in the Mac diff above are included in the native
follow-up. Existing changes, worktrees, stashes, Metro, production PersonalOS and
both Health test apps were preserved. Publication keeps PR #7 draft; no merge is
part of this work.
