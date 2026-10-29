#!/bin/bash
# Synthetic files/in-memory stores only. Does not compile MedicationKeychain.swift.
set -euo pipefail
medication_test_dir="$(cd "$(dirname "$0")" && pwd)"
medication_root="$(cd "$medication_test_dir/../../.." && pwd)"
medication_scratch="$(mktemp -d "${TMPDIR:-/tmp}/personalos-medication-v2.XXXXXX")"
xcrun --sdk macosx swiftc -module-cache-path "$medication_scratch/cache"   "$medication_test_dir/../MedicationCollectionStorage.swift"   "$medication_test_dir/MedicationCollectionStorageTests.swift" -o "$medication_scratch/current-tests"
"$medication_scratch/current-tests" "$medication_root/app/test-utils/fixtures/medication-v2.json" "$medication_scratch/migrated.json"
git -C "$medication_root" show 14bae037ff3f7c6febe9016ea4e9d693f8fc825c:app/ios/MedicationCollectionStorage.swift > "$medication_scratch/MedicationV1.swift"
xcrun --sdk macosx swiftc -module-cache-path "$medication_scratch/cache"   "$medication_scratch/MedicationV1.swift" "$medication_test_dir/MedicationV1DowngradeTests.swift" -o "$medication_scratch/old-reader-tests"
"$medication_scratch/old-reader-tests" "$medication_scratch/migrated.json"
printf 'Synthetic test evidence retained at %s\n' "$medication_scratch"
