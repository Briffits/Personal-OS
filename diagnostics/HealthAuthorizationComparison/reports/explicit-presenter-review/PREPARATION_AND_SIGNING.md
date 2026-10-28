# Preparation and signing provenance — sanitized summary

The four-file explicit-presenter preparation passed the source audit, focused
checkpoint comparisons, five negative audit checks and unsigned Debug build.
The signed Debug build also succeeded using Xcode 27.1 (27A9275) and iPhoneOS SDK
27.1, Swift 5 mode, deployment target iOS 26. Existing M Sendable conversion and
AppIntents extraction-skipped warnings remained; no new D warning was reported.

The first signing build rejected manual selection of an Xcode-managed profile.
Using automatic signing with the existing local team/profile succeeded without
allowing provisioning updates. Signing settings and disabled shared scheme opt-in
were unchanged in tracked source. Private configuration and logs stayed outside
this checkpoint.

Codesign strict/deep verification passed. The original bundle ID remained
org.personalos.diagnostics.HealthAuthorizationComparison. Embedded provisioning
profile bytes matched the retained local diagnostic profile exactly; the signing
certificate belonged to that profile. Signed entitlement values matched it, with
only application-identifier, com.apple.developer.team-identifier,
com.apple.developer.healthkit and get-task-allow keys. The profile covered the
identified trial phone and expires 2026-10-29 at 14:42:27 UTC. No profile, certificate,
team value, device identifier or signing configuration is included here.

The earlier signed D1/D2 artifact was unavailable, so its actual certificate,
entitlements and provisioning could not be directly compared. This limitation
remains despite matching the retained local profile and original bundle identity.

Signed executable SHA-256:
`e29ea83ceea5a9cd82d6d395d8b29f30f1c163dafc5c31cb0ec03cee6c62fa80`.
Signed Debug implementation dylib SHA-256:
`7e2b1c74b1daaf3f98f8694fec99e574e3a1b8b21eade0ca3003c359c3c7eb17`.
The source file hashes in SHA256SUMS match the signing-preparation source manifest.
These are artifact fingerprints, not device identifiers or proof of consent.

The device installation command returned success and confirmed the original bundle
ID. The user had confirmed the previous standalone app absent, so installation was
recorded as fresh. The later trials used that signed installation; no further build
or installation occurred between the two explicit-presenter processes. No uninstall
or permission reset was performed by the assistant. Permission-history continuity
remains unknown. Actual device OS was not freshly recorded for these trial reports;
do not substitute SDK version for device OS.

Source/runtime boundaries and the proposed procedure are preserved in the adjacent
EXPLICIT_PRESENTER_D.md. That file records preparation-time status; INVESTIGATION.md
provides the later actual observations, including the interrupted request that did
not follow the intended readiness-confirmation sequence.
