import Foundation
import Security

final class MedicationKeychain: MedicationKeychainAccess {
  private func query(service: String, account: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
     kSecAttrService as String: service,
     kSecAttrAccount as String: account,
     kSecAttrSynchronizable as String: false]
  }

  func read(service: String, account: String) throws -> Data? {
    var attributes = query(service: service, account: account)
    attributes[kSecReturnData as String] = true
    attributes[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(attributes as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else {
      throw MedicationStorageError.readFailed
    }
    return data
  }

  func insert(_ data: Data, service: String, account: String) throws {
    var attributes = query(service: service, account: account)
    attributes[kSecValueData as String] = data
    attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    guard SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess else {
      throw MedicationStorageError.writeFailed
    }
  }

  func update(_ data: Data, service: String, account: String) throws {
    // Do not use react-native-keychain's delete-then-insert replacement path.
    // Updating an absent item is an error, never an invitation to re-import legacy data.
    let changes: [String: Any] = [kSecValueData as String: data]
    guard SecItemUpdate(query(service: service, account: account) as CFDictionary,
                        changes as CFDictionary) == errSecSuccess else {
      throw MedicationStorageError.writeFailed
    }
  }
}
