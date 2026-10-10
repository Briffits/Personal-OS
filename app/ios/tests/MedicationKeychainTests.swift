// macOS-only Security integration smoke test. All items use a unique test service.
// xcrun swiftc app/ios/MedicationCollectionStorage.swift app/ios/MedicationKeychain.swift \
//   app/ios/tests/MedicationKeychainTests.swift -o /tmp/medication-keychain-tests
import Foundation
import Security

@main
struct MedicationKeychainTests {
  static func main() throws {
    let service = "com.personalos.tests.medication.\(UUID().uuidString.lowercased())"
    let account = "synthetic-test"
    let keychain = MedicationKeychain()
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                               kSecAttrService as String: service, kSecAttrAccount as String: account,
                               kSecAttrSynchronizable as String: false]
    defer { SecItemDelete(query as CFDictionary) } // Only this test's randomly named item.
    func check(_ condition: Bool) throws {
      if !condition { throw NSError(domain: "MedicationKeychainTests", code: 1) }
    }
    try check(try keychain.read(service: service, account: account) == nil)
    let original = Data("synthetic original".utf8)
    let replacement = Data("synthetic replacement".utf8)
    try keychain.insert(original, service: service, account: account)
    do {
      try keychain.insert(replacement, service: service, account: account)
      throw NSError(domain: "MedicationKeychainTests", code: 2)
    } catch MedicationStorageError.writeFailed { }
    try check(try keychain.read(service: service, account: account) == original)
    try keychain.update(replacement, service: service, account: account)
    try check(try keychain.read(service: service, account: account) == replacement)
    do {
      try keychain.update(original, service: service, account: "missing-account")
      throw NSError(domain: "MedicationKeychainTests", code: 3)
    } catch MedicationStorageError.writeFailed { }
    try check(try keychain.read(service: service, account: account) == replacement)
    print("Passed Keychain insert/update/read and account-isolation checks. iOS protection still requires device validation.")
  }
}
