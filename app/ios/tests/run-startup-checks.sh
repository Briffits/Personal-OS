#!/bin/bash
# Execute only the pure startup filter tests on macOS; never launches the app.
set -euo pipefail
startup_tests_dir="$(cd "$(dirname "$0")" && pwd)"
startup_package_dir="$(mktemp -d "${TMPDIR:-/tmp}/personalos-startup.XXXXXX")"
mkdir -p "$startup_package_dir/Tests/StartupTests"
cp "$startup_tests_dir/../ReactNativeStartupModules.swift" "$startup_tests_dir/ReactNativeStartupTests.swift" "$startup_package_dir/Tests/StartupTests/"
cat > "$startup_package_dir/Package.swift" <<'PACKAGE'
// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "StartupChecks", targets: [.testTarget(name: "StartupTests")])
PACKAGE
swift test --package-path "$startup_package_dir"
printf 'Temporary test harness retained at %s\n' "$startup_package_dir"
