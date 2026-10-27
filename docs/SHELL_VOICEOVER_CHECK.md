# Shell navigation: manual VoiceOver walkthrough

## Current evidence and review status

The user-confirmed retest on iPhone 13 Pro / PersonalOS VO Test at
`f30454c770021a7c48f423e233af1376b8a08d86` confirms enlarged-text tab usability
at the recorded settings, including maximum accessibility text. Short one-finger
VoiceOver flicks traversed content and reached tabs at maximum size in light
appearance; Library/Today selection and Settings heading/content were reported.
Earlier long swipes are the user's likely explanation for tones/no movement,
not a confirmed app defect. No tones or focus loss were reported at the end of
the latest VoiceOver pass.

See [the current observation record, historical reconciliation and focused
follow-up](NAVIGATION_ACCESSIBILITY.md#user-confirmed-physical-retest--27-october-2026).
The focused outstanding checks now **pass** at maximum accessibility text/light:

- Short right flicks traversed Today → Ask → Capture → Library across both rows.
- Ask/Capture activation announced selected, with focus remaining on each bottom
  tab. Their headings and placeholder content were reachable; heading access was
  by touch exploration, not the rotor.
- Settings opened with focus on Back to Today. Activating it announced “selected
  today tab” and returned focus to Today in bottom navigation.

Capture content traversal reached Today; Ask content traversal reached selected
Ask. One repeated “not available yet” response preceded reaching Ask's description;
its cause is unknown. These details are retained without inventing an exact
whole-screen order or a confirmed defect.

The focused physical gaps are closed and PR #3 is ready for final review while
remaining draft. **No full scrolling, rotor or wider-matrix pass is claimed.**
No separate scrolling gesture was reported. “Personal OS, heading” does not prove
a separate Today heading or a Headings rotor pass. Older rotor results remain
qualified by their earlier build and unspecified settings.

## Earlier manual checklist — not an acceptance record

iOS Simulator cannot verify actual VoiceOver speech, rotor navigation or focus
behaviour. Accessibility Inspector (including macOS speech) and automated audits
are not substitutes for observing iOS VoiceOver on a physical device. See
[Apple's accessibility testing guidance](https://developer.apple.com/documentation/accessibility/performing-accessibility-testing-for-your-app).

The checklist below is the original full plan, now **partially verified**. Use
the linked reconciliation to distinguish current observations, older passes at
unspecified settings and remaining gaps; do not repeat completed work solely to
fill this checklist. Only use the authorised isolated test app. The 375 × 667-point
simulator matrix below remains layout and automated-audit evidence only.

1. **Reading order and headings:** On Today, Ask, Capture and Settings, swipe
   through the elements. Confirm each heading is spoken completely, followed by
   its relevant content, without duplicate or skipped announcements. Use the
   Headings rotor to reach the screen heading.
2. **Selected tabs:** Activate Ask, Capture, Library and Today. Confirm the active
   tab is announced as selected and each control has its full name even when its
   visible label wraps. Check the responsive two-row layout at enlarged sizes.
3. **Destination focus:** Open Settings and switch between Ask and Capture.
   Confirm focus lands on meaningful content for the new destination and never
   remains on a removed control or silently skips the heading.
4. **Return focus:** Activate Back to Today from Settings, including after
   scrolling down. Confirm the return is understandable and focus returns to
   Open Settings or another predictable Today starting point. Repeat the trip.
5. **Scrolling:** At largest text, read to the end of each screen with VoiceOver
   scrolling. Confirm Capture and Settings are each spoken completely as a
   heading and are fully visible without horizontal scrolling. Confirm vertical
   scrolling and access to Back to Today/main tabs still work.

Record pass/fail, screen, appearance/text size and the exact observed focus or
spoken behavior. Do not record personal Health or Medication content.

## Evidence boundary

Automated navigation, screenshots, measured heading layout and XCTest
accessibility audits can establish what is rendered, exposed and operable under
automation. Jest checks cover the token boundary, unchanged heading names,
uncapped text, vertical-only scrolling and absence of native operations during
shell navigation. These do **not** establish spoken VoiceOver
order, rotor behavior, announcements, destination focus or return focus. The
walkthrough remains **partially verified by user observations**, with explicit
gaps in the linked record; no VoiceOver acceptance is inferred from automated
test results.

## Automated Mac recheck — 23 October 2026

The current correction replaces the earlier horizontal-scroll experiment.

- macOS 27.0.1, Xcode 27.1; Release Simulator build with bundled JavaScript passed.
- Full Jest suite: 13 suites / 318 tests passed. TypeScript, ESLint, changed-file
  Prettier and whitespace checks passed. Token tests cover both sides of the
  boundary, the accessibility range and returning to the standard token.
- Isolated iPhone SE (3rd generation), iOS 27.0, 375 × 667 points: 12 UI-test runs
  passed. Every size below was checked in both light and dark appearance.
- Default/maximum runs exercised Today, Settings/back, Ask/Capture/Library and
  return paths, repeated Settings visits and fresh-launch Today. The intermediate
  runs checked Ask, Capture and Settings headings and their return paths.
- All 36 native heading-frame measurements fit within the available width on one
  scaled line. Tests also confirmed one vertical scroll view and no swipe hint.
- All 64 captured-state audits reported no issues in contrast, element detection,
  hit regions, descriptions, traits or clipped text. Screenshots and accessibility
  trees were exported locally; no personal data or raw device logs are committed.

Settings is the longest heading. Both appearances produced these measurements:

| Text size                    | Font scale | Token       | Width (pt) | Height (pt) |
| ---------------------------- | ---------- | ----------- | ---------- | ----------- |
| Default / Large              | 1.000      | screenTitle | 118        | 36          |
| Standard XXL                 | 1.235      | screenTitle | 144.5      | 44.5        |
| Standard XXXL                | 1.353      | screenTitle | 158        | 49          |
| Accessibility Medium         | 1.786      | cardTitle   | 115.5      | 39.5        |
| Accessibility Large          | 2.143      | cardTitle   | 137.5      | 47.5        |
| Accessibility XXXL / maximum | 3.571      | cardTitle   | 226        | 79          |

The available width is approximately 333 points. Capture measures 218.5 points
at maximum size. The size step at the category boundary is the explicit switch
to the approved smaller existing token, not shrink-to-fit or a Dynamic Type cap.
These are historical automated results. Current and earlier manual VoiceOver
observations, and their remaining limits, are reconciled in the linked record.
