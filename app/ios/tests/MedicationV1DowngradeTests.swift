import Foundation

// Compiled only with the pinned main/v1 reader by run-medication-checks.sh.
private final class DowngradeKeychain: MedicationKeychainAccess {
  let bytes: Data
  var writes = 0
  var legacyReads = 0
  init(_ bytes: Data) { self.bytes = bytes }
  func read(service: String, account: String) throws -> Data? {
    if service == MedicationCollectionStorage.service { return bytes }
    legacyReads += 1
    return nil
  }
  func insert(_ data: Data, service: String, account: String) throws { writes += 1 }
  func update(_ data: Data, service: String, account: String) throws { writes += 1 }
}
@main
struct MedicationV1DowngradeTests {
  static func main() throws {
    let bytes = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
    let keychain = DowngradeKeychain(bytes)
    let store = MedicationCollectionStorage(keychain: keychain)
    for operation in [0, 1] {
      do {
        if operation == 0 { _ = try store.read() }
        else { _ = try store.mutate(revision: 0, command: ["type": "remove", "id": "11111111-1111-4111-8111-111111111111"]) }
        fatalError("Old reader accepted v2")
      } catch MedicationStorageError.invalidRecord { }
    }
    guard keychain.writes == 0 && keychain.legacyReads == 0 && keychain.bytes == bytes else {
      fatalError("Downgrade modified data or fell back")
    }
    print("PASS: pinned v1 reader rejects migrated v2 without writes or fallback")
  }
}
