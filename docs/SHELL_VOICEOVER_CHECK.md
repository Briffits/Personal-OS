# Shell navigation: manual VoiceOver walkthrough

Use the isolated iPhone SE simulator at 375 × 667 points. Repeat at default and
largest Accessibility text size in light and dark appearance. Do not replace the
installed v2 app on the physical iPhone for this check.

1. **Reading order and headings:** On Today, Ask, Capture and Settings, swipe
   through the elements. Confirm each heading is spoken completely, followed by
   its relevant content, without duplicate or skipped announcements. Use the
   Headings rotor to reach the screen heading.
2. **Selected tabs:** Activate Ask, Capture, Library and Today. Confirm the active
   tab is announced as selected and each control has its full name even when its
   visible label wraps. Tab-label layout is a separate known issue.
3. **Destination focus:** Open Settings and switch between Ask and Capture.
   Confirm focus lands on meaningful content for the new destination and never
   remains on a removed control or silently skips the heading.
4. **Return focus:** Activate Back to Today from Settings, including after
   scrolling down. Confirm the return is understandable and focus returns to
   Open Settings or another predictable Today starting point. Repeat the trip.
5. **Scrolling:** At largest text, read to the end of each screen with VoiceOver
   scrolling. For an overflowing heading, confirm its full word is spoken as one
   heading and horizontal scrolling can reveal both ends without trapping focus.
   Confirm vertical scrolling and access to Back to Today/main tabs still work.

Record pass/fail, screen, appearance/text size and the exact observed focus or
spoken behavior. Do not record personal Health or Medication content.

## Evidence boundary

Automated navigation, screenshots, measured heading layout and XCTest
accessibility audits can establish what is rendered, exposed and operable under
automation. Jest checks cover overflow hints, uncapped text and absence of native
operations during shell navigation. These do **not** establish spoken VoiceOver
order, rotor behavior, announcements, destination focus or return focus. The
walkthrough above remains **awaiting manual observation** until a person performs
it; no VoiceOver acceptance is claimed by automated test results.

## Automated Mac recheck — 23 October 2026

- macOS 27.0.1, Xcode 27.1; Release Simulator build with bundled JavaScript passed.
- Full Jest suite: 13 suites / 318 tests passed. TypeScript, ESLint, changed-file
  Prettier and whitespace checks passed.
- Isolated iPhone SE (3rd generation), iOS 27.0, 375 × 667 points: four UI-test
  runs passed, covering default and Accessibility XXXL text in light/dark mode.
- Tests exercised Today, Settings/back, Ask/Capture/Library and return paths,
  repeated Settings visits, fresh-launch Today, and both ends of each heading
  row. The new headings remained single-line at the largest text size.
- 52 captured-state audits reported no issues in contrast, element detection,
  hit regions, descriptions, traits or clipped text. Screenshots and accessibility
  trees were exported locally; no personal data or raw device logs are committed.

These results do not change the manual-observation status above.
