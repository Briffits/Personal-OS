import Foundation
import CoreFoundation

enum MedicationStorageError: String, Error {
  case invalidRecord = "invalid-record"
  case invalidInput = "invalid-input"
  case readFailed = "read-failed"
  case writeFailed = "write-failed"
  case staleState = "stale-state"
  case migrationRequired = "migration-required"
  case notFound = "not-found"
  case commitUncertain = "commit-uncertain"
}

// Keychain is the only production implementation. Tests inject failures at the
// same read/insert/update boundary without touching a user's real Keychain.
protocol MedicationKeychainAccess {
  func read(service: String, account: String) throws -> Data?
  func insert(_ data: Data, service: String, account: String) throws
  func update(_ data: Data, service: String, account: String) throws
}

struct MedicationRecord: Equatable {
  let id: String
  var displayName: String
  var stock: Int?
  var prescriptionId: String?

  var payload: [String: Any] {
    ["id": id, "displayName": displayName,
     "stock": stock.map { $0 as Any } ?? NSNull(),
     "prescriptionId": prescriptionId.map { $0 as Any } ?? NSNull()]
  }
}

struct PendingLegacyMedication: Equatable {
  let id: String
  let stock: Int

  var payload: [String: Any] {
    ["id": id, "stock": stock, "prescriptionId": NSNull()]
  }
}

struct MedicationCollection: Equatable {
  var revision: Int
  var records: [MedicationRecord]
  var pendingLegacy: PendingLegacyMedication?

  var payload: [String: Any] {
    ["schemaVersion": 1, "revision": revision,
     "records": records.map { $0.payload },
     "pendingLegacy": pendingLegacy.map { $0.payload as Any } ?? NSNull()]
  }
}

final class MedicationCollectionStorage {
  static let service = "com.personalos.medication-collection"
  static let account = "medication-collection"
  static let legacyNameService = "com.personalos.medication-name"
  static let legacyStockService = "com.personalos.medication-stock"
  static let maximumInteger = 9_007_199_254_740_991

  // Shared by all instances: revision comparison and publication are one
  // critical section, including initialization and migration. No app extension
  // writes this store; a future multi-process writer would need a new contract.
  private static let lock = NSLock()
  private let keychain: MedicationKeychainAccess
  private let makeID: () -> String

  init(keychain: MedicationKeychainAccess,
       makeID: @escaping () -> String = { UUID().uuidString.lowercased() }) {
    self.keychain = keychain
    self.makeID = makeID
  }

  private func serialized<T>(_ operation: () throws -> T) rethrows -> T {
    Self.lock.lock()
    defer { Self.lock.unlock() }
    return try operation()
  }

  static func count(_ value: Any?) throws -> Int {
    guard let number = value as? NSNumber,
          CFGetTypeID(number) != CFBooleanGetTypeID() else {
      throw MedicationStorageError.invalidRecord
    }
    let double = number.doubleValue
    guard double.isFinite, double >= 0, double <= Double(maximumInteger),
          double.rounded(.towardZero) == double else {
      throw MedicationStorageError.invalidRecord
    }
    return Int(double)
  }

  private static func identifier(_ value: Any?) throws -> String {
    guard let value = value as? String,
          let uuid = UUID(uuidString: value), uuid.uuidString.lowercased() == value else {
      throw MedicationStorageError.invalidRecord
    }
    return value
  }

  private static func name(_ value: Any?) throws -> String {
    guard let value = value as? String,
          !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw MedicationStorageError.invalidRecord
    }
    return value
  }

  private static func prescription(_ value: Any?) throws -> String? {
    if value is NSNull { return nil }
    return try identifier(value)
  }

  private static func decode(_ data: Data) throws -> MedicationCollection {
    do {
      guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            try count(object["schemaVersion"]) == 1,
            let values = object["records"] as? [[String: Any]] else {
        throw MedicationStorageError.invalidRecord
      }
      let revision = try count(object["revision"])
      let records = try values.map { item -> MedicationRecord in
        let stock: Int?
        if item["stock"] is NSNull { stock = nil }
        else { stock = try count(item["stock"]) }
        return MedicationRecord(id: try identifier(item["id"]),
                                displayName: try name(item["displayName"]), stock: stock,
                                prescriptionId: try prescription(item["prescriptionId"]))
      }
      guard Set(records.map { $0.id }).count == records.count else {
        throw MedicationStorageError.invalidRecord
      }
      var pending: PendingLegacyMedication?
      if !(object["pendingLegacy"] is NSNull) {
        guard records.isEmpty, let item = object["pendingLegacy"] as? [String: Any],
              item["prescriptionId"] is NSNull else {
          throw MedicationStorageError.invalidRecord
        }
        pending = PendingLegacyMedication(id: try identifier(item["id"]), stock: try count(item["stock"]))
      }
      return MedicationCollection(revision: revision, records: records, pendingLegacy: pending)
    } catch {
      throw MedicationStorageError.invalidRecord
    }
  }

  private func stored() throws -> MedicationCollection? {
    guard let data = try keychain.read(service: Self.service, account: Self.account) else { return nil }
    return try Self.decode(data)
  }

  private func publish(_ state: MedicationCollection, inserting: Bool) throws -> MedicationCollection {
    let data = try JSONSerialization.data(withJSONObject: state.payload, options: [.sortedKeys])
    if inserting {
      try keychain.insert(data, service: Self.service, account: Self.account)
    } else {
      try keychain.update(data, service: Self.service, account: Self.account)
    }
    // Never turn a lost acknowledgement into a claimed rollback. A retry must
    // read durable state before the user can submit another additive change.
    do {
      guard let verified = try stored(), verified == state else {
        throw MedicationStorageError.commitUncertain
      }
      return verified
    } catch { throw MedicationStorageError.commitUncertain }
  }

  private func initialize() throws -> MedicationCollection {
    if let state = try stored() { return state }
    let nameData = try keychain.read(service: Self.legacyNameService, account: "medication-name")
    let stockData = try keychain.read(service: Self.legacyStockService, account: "estimated-stock")
    var name: String?
    var stock: Int?
    if let data = nameData {
      name = try Self.name(String(data: data, encoding: .utf8))
    }
    if let data = stockData {
      do {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
          throw MedicationStorageError.invalidRecord
        }
        stock = try Self.count(object["estimatedStock"])
      } catch { throw MedicationStorageError.invalidRecord }
    }
    var state = MedicationCollection(revision: 0, records: [], pendingLegacy: nil)
    if let name = name {
      state.records = [MedicationRecord(id: try Self.identifier(makeID()), displayName: name,
                                        stock: stock, prescriptionId: nil)]
    } else if let stock = stock {
      state.pendingLegacy = PendingLegacyMedication(id: try Self.identifier(makeID()), stock: stock)
    }
    // No inferred name/link, and no legacy update/delete. The new envelope itself
    // is the durable migration marker, including an intentionally empty collection.
    return try publish(state, inserting: true)
  }

  func read() throws -> MedicationCollection {
    try serialized { try initialize() }
  }

  func mutate(revision: Int, command: [String: Any]) throws -> MedicationCollection {
    try serialized {
      // Mutations may never reinitialize a missing collection from stale legacy data.
      guard var state = try stored() else { throw MedicationStorageError.notFound }
      guard state.revision == revision, revision < Self.maximumInteger else {
        throw MedicationStorageError.staleState
      }
      guard let type = command["type"] as? String else { throw MedicationStorageError.invalidInput }
      if state.pendingLegacy != nil && type != "completeLegacy" && type != "unlinkPrescription" {
        throw MedicationStorageError.migrationRequired
      }
      do {
        switch type {
        case "unlinkPrescription":
          let prescriptionId = try Self.identifier(command["prescriptionId"])
          guard state.records.contains(where: { $0.prescriptionId == prescriptionId }) else { return state }
          // Only this relationship field changes, and all matches publish together.
          for index in state.records.indices where state.records[index].prescriptionId == prescriptionId {
            state.records[index].prescriptionId = nil
          }
        case "create":
          let id = try Self.identifier(makeID())
          guard !state.records.contains(where: { $0.id == id }) else { throw MedicationStorageError.invalidInput }
          state.records.append(MedicationRecord(id: id,
            displayName: try Self.name(command["displayName"]).trimmingCharacters(in: .whitespacesAndNewlines),
            stock: nil, prescriptionId: try Self.prescription(command["prescriptionId"])))
        case "completeLegacy":
          guard let pending = state.pendingLegacy else { throw MedicationStorageError.notFound }
          state.records = [MedicationRecord(id: pending.id,
            displayName: try Self.name(command["displayName"]).trimmingCharacters(in: .whitespacesAndNewlines),
            stock: pending.stock, prescriptionId: nil)]
          state.pendingLegacy = nil
        case "edit", "setStock", "remove":
          let id = try Self.identifier(command["id"])
          guard let index = state.records.firstIndex(where: { $0.id == id }) else {
            throw MedicationStorageError.notFound
          }
          if type == "edit" {
            state.records[index].displayName = try Self.name(command["displayName"]).trimmingCharacters(in: .whitespacesAndNewlines)
            state.records[index].prescriptionId = try Self.prescription(command["prescriptionId"])
          } else if type == "setStock" {
            state.records[index].stock = try Self.count(command["stock"])
          } else { state.records.remove(at: index) }
        default: throw MedicationStorageError.invalidInput
        }
      } catch MedicationStorageError.invalidRecord { throw MedicationStorageError.invalidInput }
      state.revision += 1
      return try publish(state, inserting: false)
    }
  }
}
