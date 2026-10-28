# Reminders due today — VPS slice and Mac handover

Status: TypeScript/UI and native EventKit bridge implemented; unsigned iOS build
and synthetic native tests passed. Focused physical-iPhone validation passed as
reported below; remaining device boundaries are explicit. Based on
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
The original VPS slice included no native code, permission keys or Xcode changes.
The Mac implementation below adds them without changing the TypeScript contract.

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

The original Mac handover checklist called for building the bridge and checking
the following on a physical iPhone (see dated results below for completed coverage):
first request/allow/deny, restriction where reproducible,
Settings revocation/restoration, date-only/timed/undated/completed reminders,
earlier today, both midnight boundaries, DST short/long days, time-zone changes,
foreground changes made in Apple Reminders, offline local records, failed reads,
small screens, largest Dynamic Type, VoiceOver reading order/focus, and light/dark
appearance. Use synthetic reminders; no private contents in logs or screenshots.

HealthKit FB25287175 and medication v2 storage review remain separate. Neither
requires resolution or changes for this slice. No storage, HealthKit, dependency,
deployment, signing or deployment-target changes are included.

Suggested commit: `Add read-only Reminders UI and native contract`


## Mac implementation and validation — 2026-10-27

Implemented in the isolated `feat/reminders-today-mac` worktree, starting at
`5ae4ac8bf61be57c269771d1b91a41dc976df48e`.

### Native files and responsibilities

- `app/ios/RemindersModule.swift` and `RemindersBridge.m`: register
  `NativeModules.Reminders` with exactly the three promise methods above. The
  bridge runs on the main queue, so foreground inspection and permission request
  initiation have no intervening asynchronous hop.
- `app/ios/RemindersReader.swift`: pure date/filtering logic and an injected-store
  coordinator for authorization, busy handling, and snapshot freshness.
- `app/ios/EventKitRemindersStore.swift`: lazy EventKit store, OS-version-guarded
  access requests, authorization normalization, and asynchronous read projection.
- `app/ios/PersonalOS.xcodeproj/project.pbxproj`: adds the four source files only.
- `app/ios/PersonalOS/Info.plist`: adds `NSRemindersFullAccessUsageDescription`
  and the legacy `NSRemindersUsageDescription` for the existing OS range.
- `app/ios/tests/RemindersTests.swift` and `run-reminders-checks.sh`: synthetic
  native tests in a temporary, dependency-free Swift package. They never create
  an EventKit store or request OS access.

The adapter queries incomplete reminders across accessible lists with nil date
bounds. This avoids depending on EventKit range conversion for floating and
all-day values; the native filter owns exact membership. Only identifier, title,
completion flag and due components are projected. This scans all incomplete
reminders on each requested refresh, a deliberate correctness tradeoff; large
real-world lists still need device performance validation.

Date-only values retain their source calendar meaning and are converted to a
Gregorian civil date in the local zone, without applying their explicit zone as
an instant offset. Timed values use the due components' explicit zone or the
current zone for floating time. Missing source calendars default to Gregorian,
as required by EventKit. Invalid or incomplete date components, nonexistent DST
wall times, and duplicate/blank included IDs fail the read rather than producing
misleading data. Ambiguous repeated wall times use Foundation's deterministic
calendar resolution; no recurrence expansion is performed.

Only `requestAccess` can prompt, and only while active and idle. Existing access
states return without prompting. iOS 17+ uses full Reminders access; earlier iOS
uses the legacy Reminders-only request. Unknown/write-only authorization fails
closed. Reads check access before querying and at completion, including after
filtering. Day/time-zone changes reject `read-failed`. Nil queries fail; an
actually successful authorized empty query returns an empty snapshot. Reads
have a 30-second timeout that cancels the EventKit fetch and rejects through the
same completion checks; late callbacks are ignored. Permission operations remain
busy until the OS completes the user-driven permission decision.

No reminders are written, saved, completed, deleted, logged or persisted. No
Calendar/Contacts permission, backend, storage or HealthKit integration is added.

### API verification

Verified against the installed Xcode 27.1 / iPhoneOS 27.1 SDK headers
(`EKEventStore.h`, `EKReminder.h`, `EKTypes.h`) and Apple's documentation:

- [Due-date components](https://developer.apple.com/documentation/eventkit/ekreminder/duedatecomponents):
  floating time, date-only semantics, Gregorian requirements and independent
  due-component time zone.
- [Full Reminders access](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoreminders(completion:)):
  iOS 17 availability, asynchronous permission response and avoiding reads before
  access is granted.
- [Full-access purpose string](https://developer.apple.com/documentation/bundleresources/information-property-list/nsremindersfullaccessusagedescription):
  required purpose text.

SDK headers additionally establish nil fetch results, the all-incomplete
predicate with nil bounds/lists, cancellation behavior, and full-access status
compatibility with the legacy authorized value.

### Checks performed

- `bash app/ios/tests/run-reminders-checks.sh`: **15 tests passed**. Covers
  23/25-hour days, both midnight boundaries, earlier-today membership,
  date-only/floating/explicit-zone values, non-Gregorian conversion, leap/invalid
  dates, DST gaps/overlaps, ordering, IDs, authorization mapping, prompt gating,
  busy handling, allow/deny/failure, revocation, nil/empty reads and day/zone changes.
- From `app`, `./node_modules/.bin/tsc --noEmit`: passed.
- `npm test -- --runInBand --watchman=false NativeReminders RemindersScreen App.test`:
  **3 suites / 69 tests passed**. Unrelated JS suites were not rerun.
- `npm run lint -- --max-warnings=0`: passed.
- Plist/project syntax and `git diff --check`: passed.
- Unsigned generic-iOS Debug build: **BUILD SUCCEEDED**. Existing React umbrella
  header and script-phase warnings remain; no Reminders source warnings.

The isolated worktree had no dependencies installed. Matching existing Mac
`node_modules`, Pods and generated build inputs were copied locally after checking
both lockfiles; no package/pod installation ran. Copied autolinking paths were
retargeted only within the isolated ignored build inputs. Build outputs went to
`/private/tmp/personalos-reminders-derived`, with log at
`/private/tmp/personalos-reminders-build.log`:

```sh
RCT_NO_LAUNCH_PACKAGER=1 SKIP_BUNDLING=1 xcodebuild \
  -workspace app/ios/PersonalOS.xcworkspace -scheme PersonalOS \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath /private/tmp/personalos-reminders-derived \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
```

This validates native compilation/linking, not JS bundling, runtime module
availability, actual EventKit delivery, read-timeout cancellation on a device,
or the permission dialog. Deployment targets, signing settings and dependency
manifests/lockfiles are unchanged. No install, launch, device permission request,
merge or deployment was performed; Metro and other worktrees were not changed.

At the end of the 2026-10-27 build phase, the physical-iPhone checklist remained
outstanding, including authorization and Settings transitions, real EventKit date semantics and time-zone/DST changes,
iCloud/offline behavior, foreground refresh, failed/slow reads and large lists,
VoiceOver, largest Dynamic Type, small-screen layout and light/dark appearance.
Use only synthetic reminders for those checks.

Suggested commit: `Add read-only native Reminders bridge and tests`


## Physical-iPhone validation and focus review — 2026-10-28

Tested identity: **PersonalOS Reminders Test**, already installed and reported by
its operator as built from `a2526f4c060b4192cdbff24fd7de76e6486fb4ed`.
The resumed session did not independently verify the installed binary's provenance.
Results below are operator-confirmed observations, not automated device assertions.
No reminder contents, list names, record identifiers or screenshots are retained
in this report. Fixtures were created manually in a separate synthetic list;
existing personal reminders were preserved.

### Confirmed device results

- Startup/no-prompt and denial/Settings-return checks were already reported as
  passed in the handoff. Access was left denied; those checks were not repeated.
- Enabling access for the test identity in Settings and returning displayed the
  authorised empty state. This establishes the observed UI outcome, not an
  independent audit of all accessible personal reminders.
- Initial fixture membership included an incomplete date-only reminder due today
  followed by an incomplete timed reminder due earlier today. The configured
  synthetic time displayed correctly. Yesterday, tomorrow, undated and
  completed-today fixtures were absent from the reported fixture set.
- Changing the tomorrow fixture to today in Apple Reminders made it appear on
  foreground return without tapping Refresh.
- With Airplane Mode on and Wi-Fi off, manual Refresh retained the expected
  synthetic fixtures. This validates reading these locally available records
  offline; it does not validate cloud synchronization or a cold launch offline.
- Revoking access in Settings and returning without manual Refresh cleared all
  rows and displayed the denied explanation with the Settings button. Restoring
  access and returning made fixtures visible again.
- VoiceOver reading order and the spoken timed due value were clear. VoiceOver
  activated Refresh successfully, navigation remained usable afterward, and Back
  returned to Today where the Reminders entry was reachable.
- At the largest accessibility text size, checked content and Refresh were
  readable and reachable, with no reported clipping or overlap. Light and dark
  appearances were each reported clear at that size. Preferred display settings
  were restored afterward.

### VoiceOver entry focus: non-blocking observation

On opening Reminders from Today, VoiceOver initially focused **Refresh reminders**.
The screen source orders Back, the heading (with header role), introduction,
read-only reminder rows and Refresh within one scroll view. Each reminder groups
its title and due label into one accessible element. Navigation replaces the
Today screen in React state; no explicit accessibility-focus request is made.
Source order alone does not prove native initial-focus behaviour.

One focused follow-up checked orientation from that initial focus without touch
exploration: swipe left to Back, then right through the heading and content. The
operator confirmed the destination was clear and all elements were reachable
predictably, without a reported trap or disruptive jump. Initial heading focus
is not a requirement by itself. No practical defect was established in the tested
flow, so Refresh-first focus is recorded as **non-blocking** and no focus change
is proposed. This conclusion does not promise the same initial focus on every
iOS version, device or asynchronous loading outcome.

### Explicit untested device boundaries

- Exact start/end midnight membership, midnight rollover while open, DST short
  and long days, time-zone changes, explicit-zone versus floating EventKit dates,
  non-Gregorian dates, invalid components, recurrence, multiple-list coverage and
  equal-time tie ordering. Synthetic native tests cover several calendar rules;
  they do not establish their actual EventKit delivery on a device.
- System-restricted access, first-dialog Allow (the grant here was through
  Settings), induced permission/read failures, slow reads, timeout/cancellation,
  and revocation while a query is in flight. Mock/native coordinator tests are
  distinct from device evidence.
- iCloud sync, cold launch offline, large-list performance and memory use. The
  implementation fetches all incomplete reminders, filters on the main queue,
  and renders the resulting rows in a ScrollView; large datasets were not tested.
- Small-screen hardware, other iOS versions, measured colour contrast, all UI
  states at maximum text size, and an exhaustive accessibility audit.
- No new production/v2 or Health regression coverage is claimed. No sensitive
  device logs were collected to supplement the observations.

### PR review and applicable validation

Reviewed all 19 changed files from base
`826d5f4ec22183d7a8869e983fbc3e02b5c0c2f3` to head
`a2526f4c060b4192cdbff24fd7de76e6486fb4ed`: navigation/UI, typed contract,
validation adapter, foreground/stale-result handling, native permissions and
calendar filtering, bridge registration, project/plist wiring, fixtures, tests
and this documentation. No blocking code defect was identified. No new dependency,
reminder write path, content logging, persistence or unrelated domain change was
found. The untested boundaries above remain limitations, not passed checks.

Applicable prior validation is recorded in the dated sections above: 15 native
synthetic tests; the Mac TypeScript and lint checks; 3 focused Jest suites / 69
tests; and the successful unsigned iOS build. The earlier VPS full-suite result
is historical coverage, not a fresh full-suite run at this head. The focused
device observations add runtime evidence without replacing those test boundaries.
Unchanged code was not rebuilt or retested during this documentation review.

GitHub PR #4 still has an outdated VPS-only title/body describing the bridge as
absent. Its description should reflect the native implementation and these device
results before merge. This local documentation change must also be committed
and published to become part of the PR; no commit, push, PR edit or merge was
performed by this review. Merge readiness is a code-review judgement for this
read-only MVP slice, not a claim that the entire device checklist has passed.
At review time GitHub reported the PR as draft, with mergeability unknown, zero
check runs and no commit statuses (the combined status was pending). These are
not successful CI results. Ready-for-review status and GitHub mergeability/check
requirements must be resolved before merge; the review did not change PR state.

Connectivity and preferred display settings were restored after the main test
session. Last confirmed test-identity Reminders access remains enabled; synthetic
fixtures remain. This review did not change permissions, remove fixtures, rebuild,
or alter production/v2, Metro or Health diagnostics.
