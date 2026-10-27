# Reminders due today — VPS slice and Mac handover

Status: TypeScript/UI implemented; EventKit bridge, permission configuration,
native build and physical-iPhone validation are outstanding. Based on
`826d5f4ec22183d7a8869e983fbc3e02b5c0c2f3` (merged shell navigation).

## Implemented boundary

Today → Reminders due today → Back to Today uses the existing secondary-screen
pattern and in-memory React navigation. The tab bar is hidden on the secondary
screen. NOW/TODAY priority placeholders are unchanged. This is a read-only list,
with no ranking, editing, completion, deletion, scheduling or new persistence.

Data flows through:

```text
RemindersScreen → useReminders → NativeReminders → NativeModules.Reminders
```

- `src/reminders/reminders.ts` defines the complete service/wire contract.
- `src/native/NativeReminders.ts` validates wire shapes, strips extra fields,
  rejects duplicate identifiers and normalizes errors without retaining native
  messages or payloads. It performs no calendar filtering or sorting.
- `src/reminders/useReminders.ts` owns loading, authorization state, refresh
  coordination and response freshness. No unrelated domain is called.
- `src/screens/RemindersScreen.tsx` renders the states and read-only rows. Timed
  due values are formatted in the snapshot's time zone; date-only values are
  never parsed as timestamps. Empty titles display “Untitled reminder”.

There are no production mock reminders. An absent/incomplete native module shows
“Reminders is unavailable in this build.” instead of an empty list. No access
button is offered in that state. All mock content lives in tests/test utilities.

## Exact native handover contract

Register the module as **`Reminders`**, available at `NativeModules.Reminders`.
Expose exactly these parameterless promise methods (no callback/event protocol):

```ts
type RemindersAuthorization =
  | 'notDetermined'
  | 'authorized'
  | 'denied'
  | 'restricted'
  | 'unavailable';

getAuthorizationStatus(): Promise<RemindersAuthorization>;
requestAccess(): Promise<RemindersAuthorization>;
fetchDueToday(): Promise<RemindersSnapshot>;

type RemindersSnapshot = {
  day: {
    date: string;     // Gregorian YYYY-MM-DD, native reader's current local day
    timeZone: string; // IANA identifier supported by Intl, e.g. Europe/London
    startsAt: number; // Unix milliseconds, inclusive local start of day
    endsAt: number;   // Unix milliseconds, exclusive next local start of day
  };
  reminders: Array<{
    id: string;      // nonblank, unique within snapshot; opaque EventKit ID
    title: string;   // may be empty; display fallback is in the UI
    due:
      | { kind: 'date-only'; date: string } // Gregorian YYYY-MM-DD; no fake time
      | { kind: 'timed'; at: number };     // finite Unix milliseconds
  }>;
};
```

`getAuthorizationStatus` must inspect authorization only, without prompting or
fetching. Return `authorized` for usable full Reminders access, using the
appropriate EventKit status for the running OS. Unknown/unusable access must
never be treated as authorized.

`requestAccess` is the only prompting method. The UI calls it only from the
**Allow Reminders access** button while foregrounded and not busy. Return the
resulting normalized authorization string, not a Boolean. Native code must also
check foreground availability immediately before requesting access, reject busy
requests and never schedule a permission prompt for later. Ordinary denial is a
`denied` result; operational failure rejects. No automatic access request belongs
in module setup, status checking, fetching, retry or foreground handling.

`fetchDueToday` must never prompt. Check authorization before querying and before
returning results. Return a successful empty array only after an authorized,
successful query; a nil/failed query must not be converted to empty success.
Rejections use fixed `code` strings:

| Code                   | Meaning / UI result                                                  |
| ---------------------- | -------------------------------------------------------------------- |
| `unavailable`          | Native service unsupported/unavailable; unavailable-in-build state   |
| `not-authorized`       | Access not yet requested; show explicit access button                |
| `denied`               | Access denied/revoked; show explanation and explicit Settings button |
| `restricted`           | System restriction; show restricted explanation                      |
| `authorization-failed` | Permission operation failed; retryable error                         |
| `read-failed`          | Status/query operation failed; retryable error                       |
| `busy`                 | Operation cannot start now; retryable error, no queued prompt        |

The adapter also produces `invalid-response` for an invalid wire shape. Unknown
native failures become `authorization-failed` for access requests or `read-failed`
for reads. Rejections must not contain reminder content, raw EventKit descriptions
or other private context. The adapter retains only the fixed code and a fixed
generic message. Neither layer logs reminder data.

### Native-owned membership, ordering and date rules

The native reader must return only `isCompleted == false` reminders with a due
date in the current local day, across accessible Reminders lists. Include due
times earlier today. Exclude undated reminders, completed reminders, previous
days and later days. Use `isCompleted`, not presence of `completionDate`.

- Calculate `[startsAt, endsAt)` with calendar arithmetic in the current local
  time zone. Never add a fixed 86,400 seconds. The next midnight is excluded.
- Date-only reminders compare as calendar dates and remain date-only on the
  wire, without conversion to UTC midnight or inventing a due time.
- Resolve floating timed components in the current local time zone; honor an
  explicit time zone for timed reminders before testing membership.
- Preserve the native calendar meaning when producing Gregorian wire dates.
  Validate calendar dates natively; JavaScript only validates their wire shape.
- Recheck authorization at completion. If access was revoked/restricted, reject
  `denied`/`restricted` without returning reminder data. Reserve `not-authorized`
  for access that has not yet been requested; never use it for denied access.
- Re-evaluate the day and time zone at completion. If either changed during the
  query, refresh internally or reject `read-failed`; never label an obsolete
  result as today's data.
- Return unique IDs and deterministic ordering: date-only reminders first,
  then timed reminders in ascending due-time order, with ID as the tie-breaker.
  Do not expand recurrence rules or synthesize additional occurrences.
- Do not read/serialize notes, URLs, locations, attachments or unrelated fields.
  No writes, save/commit calls, reminders completion or content logging.

EventKit's required full Reminders permission grants more platform capability
than this feature uses. The Mac work must configure the appropriate Reminders
usage description and availability-guarded access API for the existing OS range,
without requesting Calendar or Contacts permission. Sources:
[EventKit access](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)
and [due-date components](https://developer.apple.com/documentation/eventkit/ekreminder/duedatecomponents).
No native code, permission keys or Xcode changes are included in this VPS slice.

## Refresh and failure behavior

- Screen entry, manual refresh/Retry and transition back to active check access
  before fetching. Denied/restricted/not-determined states never fetch.
- Denied access offers **Open iPhone Settings** only on an explicit tap. Failure
  to open Settings is explained. Returning to the foreground rechecks access.
- Refresh clears displayed rows; errors never leave obsolete data labelled as
  current, and never masquerade as empty success. No content is persisted.
- Background/inactive transitions invalidate in-flight results, clear displayed
  content and cancel the day-boundary timer. Returning requests one fresh read.
- Within a screen, refreshes during a pending operation coalesce into one later
  read. Old responses cannot publish or start another stale fetch. Access actions
  are never replayed by refresh.
- The adapter serializes native methods across screen lifetimes. Nonprompting
  reads may wait for an earlier call to settle. Access requests reject `busy`
  rather than entering that queue. Native promises must eventually settle; this
  slice does not invent native cancellation or release a lock while a native
  operation could still be executing. Back remains available while loading.
- After success, a single timer refreshes at native `day.endsAt`. This is snapshot
  freshness, not JavaScript calendar membership. An already expired snapshot is
  a retryable error, avoiding an automatic retry loop.
- Unmount removes the listener/timer and prevents all late state publication or
  continuation into fetching. There is no background fetch or polling service.

## Validation boundary

VPS checks passed using the existing dependency installation (no installs):

- TypeScript: `./node_modules/.bin/tsc --noEmit`.
- ESLint: `npm run lint -- --max-warnings=0` (zero warnings).
- Initial full Jest run: `npm test -- --runInBand` — 15 suites, 370 tests passed.
  Final scope review added denied/restricted-during-refresh regression cases and
  clarified the native completion errors; no runtime code changed. The affected
  screen suite was rerun with 22 tests passing, along with TypeScript, focused
  ESLint (zero warnings), and formatting. Unaffected suites were not rerun.
- Changed-file Prettier checks and `git diff --check`.

Mocked adapter/screen/navigation tests exercise:

- explicit permission gating on entry, retry, foreground, repeated taps and
  permission-dialog inactive/active transitions;
- loading, denied, restricted, unavailable, empty, malformed/error and retry;
- serialized reads, foreground coalescing, revocation, late results and remounts;
- native-supplied day boundaries/time zones, date-only display, timed display,
  23/25-hour day payloads, expired snapshots and timer cleanup;
- preserved native membership/order (including deliberately inconsistent test
  payloads proving there is no competing JavaScript filter);
- accessible roles, minimum touch targets, uncapped text and scroll containment;
- Today/Back navigation and no calls to Medication/Prescriptions from this flow.

These tests **do not establish correct EventKit membership, permission UI,
native module registration, DST calculation, time-zone conversion, iCloud sync,
native offline behavior or actual iOS accessibility/layout**.

The Mac phase must build the bridge with existing tooling and validate on a
physical iPhone: first request/allow/deny, restriction where reproducible,
Settings revocation/restoration, date-only/timed/undated/completed reminders,
earlier today, both midnight boundaries, DST short/long days, time-zone changes,
foreground changes made in Apple Reminders, offline local records, failed reads,
small screens, largest Dynamic Type, VoiceOver reading order/focus, and light/dark
appearance. Use synthetic reminders; no private contents in logs or screenshots.

HealthKit FB25287175 and medication v2 storage review remain separate. Neither
requires resolution or changes for this slice. No storage, HealthKit, dependency,
deployment, signing or deployment-target changes are included.

Suggested commit: `Add read-only Reminders UI and native contract`
