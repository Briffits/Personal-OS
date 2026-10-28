#!/bin/bash
# Runs synthetic native tests on macOS. Never creates an EKEventStore or launches the app.
set -euo pipefail
reminders_tests_dir="$(cd "$(dirname "$0")" && pwd)"
reminders_package_dir="$(mktemp -d "${TMPDIR:-/tmp}/personalos-reminders.XXXXXX")"
mkdir -p "$reminders_package_dir/Tests/RemindersTests"
cp "$reminders_tests_dir/../RemindersReader.swift" \
   "$reminders_tests_dir/../EventKitRemindersStore.swift" \
   "$reminders_tests_dir/RemindersTests.swift" "$reminders_package_dir/Tests/RemindersTests/"
cat > "$reminders_package_dir/Package.swift" <<'PACKAGE'
// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "RemindersChecks", platforms: [.macOS(.v12)],
                      targets: [.testTarget(name: "RemindersTests")])
PACKAGE
swift test --package-path "$reminders_package_dir"
printf 'Temporary test harness retained at %s\n' "$reminders_package_dir"
