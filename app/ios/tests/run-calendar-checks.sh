#!/bin/bash
set -euo pipefail
test_dir="$(cd "$(dirname "$0")" && pwd)"
test_output="$(mktemp -d "${TMPDIR:-/tmp}/personalos-calendar-tests.XXXXXX")"
trap 'rm -rf "$test_output"' EXIT
xcrun swiftc -swift-version 5 -module-cache-path "$test_output/module-cache" \
  "$test_dir/../CalendarReader.swift" \
  "$test_dir/../EventKitCalendarStore.swift" \
  "$test_dir/CalendarTests.swift" -o "$test_output/calendar-tests"
"$test_output/calendar-tests"
