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
  case duplicateHealthLink = "duplicate-health-link"
  case baselineRequired = "baseline-required"
  case healthUnavailable = "health-unavailable"
}

// Keychain is the only production implementation. Tests inject failures at the
// same read/insert/update boundary without touching a user's real Keychain.
protocol MedicationKeychainAccess {
  func read(service: String, account: String) throws -> Data?
  func insert(_ data: Data, service: String, account: String) throws
  func update(_ data: Data, service: String, account: String) throws
}

struct StockBaseline: Equatable {
  let id: String
  let quantity: Double
  let recordedAt: String
  let healthKitConceptReference: String?
  var payload: [String: Any] {
    ["id": id, "quantity": quantity, "recordedAt": recordedAt,
     "healthKitConceptReference": healthKitConceptReference.map { $0 as Any } ?? NSNull()]
  }
}
struct StockAddition: Equatable {
  let id: String
  let baselineId: String
  let quantity: Double
  let recordedAt: String
  var payload: [String: Any] {
    ["id": id, "baselineId": baselineId, "quantity": quantity, "recordedAt": recordedAt]
  }
}
struct MedicationRecord: Equatable {
  let id: String
  var displayName: String
  var prescriptionId: String?
  var stockBaseline: StockBaseline? = nil
  var stockAdditions: [StockAddition] = []
  var legacyRecordedStock: Double? = nil
  var lowStockThreshold: Double? = nil
  // Opaque identity only; no descriptive Health metadata is persisted.
  var healthKitConceptReference: String? = nil

  var payload: [String: Any] {
    ["id": id, "displayName": displayName, "stockUnit": "count",
     "prescriptionId": prescriptionId.map { $0 as Any } ?? NSNull(),
     "stockBaseline": stockBaseline.map { $0.payload as Any } ?? NSNull(),
     "stockAdditions": stockAdditions.map { $0.payload },
     "legacyRecordedStock": legacyRecordedStock.map { $0 as Any } ?? NSNull(),
     "lowStockThreshold": lowStockThreshold.map { $0 as Any } ?? NSNull(),
     "healthKitLink": healthKitConceptReference.map { ["conceptReference": $0] as Any } ?? NSNull()]
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
  var schemaVersion: Int = 2
  var revision: Int
  var records: [MedicationRecord]
  var pendingLegacy: PendingLegacyMedication?

  var payload: [String: Any] {
    ["schemaVersion": schemaVersion, "revision": revision,
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
  private let now: () -> Date
  private let validateConcept: (String) throws -> Void
  private let sameConcept: (String, String) throws -> Bool

  init(keychain: MedicationKeychainAccess,
       makeID: @escaping () -> String = { UUID().uuidString.lowercased() },
       now: @escaping () -> Date = Date.init,
       validateConcept: @escaping (String) throws -> Void = { _ in throw MedicationStorageError.healthUnavailable },
       sameConcept: @escaping (String, String) throws -> Bool = { _, _ in throw MedicationStorageError.healthUnavailable }) {
    self.keychain = keychain
    self.makeID = makeID
    self.now = now
    self.validateConcept = validateConcept
    self.sameConcept = sameConcept
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

  static func quantity(_ value: Any?) throws -> Double {
    guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else {
      throw MedicationStorageError.invalidRecord
    }
    let value = number.doubleValue
    guard value.isFinite, value >= 0, value <= Double(maximumInteger) else {
      throw MedicationStorageError.invalidRecord
    }
    return value
  }
  private static func addLegacyCount(_ current: Double, _ addition: Double) throws -> Double {
    // Foundation decimal arithmetic avoids persisting binary rounding noise for
    // ordinary fractional manual additions. Reject unsupported precision/range.
    let locale = Locale(identifier: "en_US_POSIX")
    guard let left = Decimal(string: String(current), locale: locale),
          let right = Decimal(string: String(addition), locale: locale),
          !left.isNaN, !right.isNaN else { throw MedicationStorageError.invalidInput }
    var a = left; var b = right; var result = Decimal()
    guard NSDecimalAdd(&result, &a, &b, .plain) == .noError else { throw MedicationStorageError.invalidInput }
    let value = try quantity(NSDecimalNumber(decimal: result).doubleValue)
    guard value > current else { throw MedicationStorageError.invalidInput }
    return value
  }
  private static func optionalQuantity(_ value: Any?) throws -> Double? {
    if value is NSNull { return nil }
    return try quantity(value)
  }
  private static func reference(_ value: Any?) throws -> String? {
    if value is NSNull { return nil }
    return try name(value)
  }
  private static func formatter() -> ISO8601DateFormatter {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    return formatter
  }
  private static func instant(_ value: Any?) throws -> String {
    guard let value = value as? String, let date = formatter().date(from: value),
          formatter().string(from: date) == value else { throw MedicationStorageError.invalidRecord }
    return value
  }
  private static func decode(_ data: Data) throws -> MedicationCollection {
    do {
      guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let values = object["records"] as? [[String: Any]] else { throw MedicationStorageError.invalidRecord }
      let version = try count(object["schemaVersion"])
      guard version == 1 || version == 2 else { throw MedicationStorageError.invalidRecord }
      let revision = try count(object["revision"])
      let records = try values.map { item -> MedicationRecord in
        var record = MedicationRecord(id: try identifier(item["id"]),
          displayName: try name(item["displayName"]), prescriptionId: try prescription(item["prescriptionId"]))
        if version == 1 {
          record.legacyRecordedStock = item["stock"] is NSNull ? nil : Double(try count(item["stock"]))
          return record
        }
        guard item["stockUnit"] as? String == "count", let additions = item["stockAdditions"] as? [[String: Any]] else {
          throw MedicationStorageError.invalidRecord
        }
        record.legacyRecordedStock = try optionalQuantity(item["legacyRecordedStock"])
        record.lowStockThreshold = try optionalQuantity(item["lowStockThreshold"])
        if !(item["healthKitLink"] is NSNull) {
          guard let link = item["healthKitLink"] as? [String: Any], let ref = try reference(link["conceptReference"]) else {
            throw MedicationStorageError.invalidRecord
          }
          record.healthKitConceptReference = ref
        }
        if !(item["stockBaseline"] is NSNull) {
          guard let base = item["stockBaseline"] as? [String: Any], record.legacyRecordedStock == nil else {
            throw MedicationStorageError.invalidRecord
          }
          record.stockBaseline = StockBaseline(id: try identifier(base["id"]), quantity: try quantity(base["quantity"]),
            recordedAt: try instant(base["recordedAt"]), healthKitConceptReference: try reference(base["healthKitConceptReference"]))
        }
        var total = record.stockBaseline?.quantity ?? 0
        record.stockAdditions = try additions.map { addition in
          guard let baseline = record.stockBaseline else { throw MedicationStorageError.invalidRecord }
          let entry = StockAddition(id: try identifier(addition["id"]), baselineId: try identifier(addition["baselineId"]),
            quantity: try quantity(addition["quantity"]), recordedAt: try instant(addition["recordedAt"]))
          guard entry.id != baseline.id, entry.baselineId == baseline.id, entry.quantity > 0,
                entry.recordedAt >= baseline.recordedAt, total + entry.quantity > total else { throw MedicationStorageError.invalidRecord }
          total = try quantity(total + entry.quantity)
          return entry
        }
        guard Set(record.stockAdditions.map { $0.id }).count == record.stockAdditions.count else { throw MedicationStorageError.invalidRecord }
        return record
      }
      guard Set(records.map { $0.id }).count == records.count else { throw MedicationStorageError.invalidRecord }
      var pending: PendingLegacyMedication?
      if !(object["pendingLegacy"] is NSNull) {
        guard records.isEmpty, let item = object["pendingLegacy"] as? [String: Any], item["prescriptionId"] is NSNull else {
          throw MedicationStorageError.invalidRecord
        }
        pending = PendingLegacyMedication(id: try identifier(item["id"]), stock: try count(item["stock"]))
      }
      return MedicationCollection(schemaVersion: version, revision: revision, records: records, pendingLegacy: pending)
    } catch { throw MedicationStorageError.invalidRecord }
  }

  private func stored() throws -> MedicationCollection? {
    guard let data = try keychain.read(service: Self.service, account: Self.account) else { return nil }
    return try Self.decode(data)
  }

  private func publish(_ state: MedicationCollection, inserting: Bool) throws -> MedicationCollection {
    let data = try JSONSerialization.data(withJSONObject: state.payload, options: [.sortedKeys])
    guard try Self.decode(data) == state else { throw MedicationStorageError.invalidInput }
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
    if var state = try stored() {
      if state.schemaVersion == 1 {
        guard state.revision < Self.maximumInteger else { throw MedicationStorageError.staleState }
        state.schemaVersion = 2
        state.revision += 1
        // One replacement publication preserves every legacy quantity. No count
        // is promoted to a timestamped physical baseline during migration.
        return try publish(state, inserting: false)
      }
      return state
    }
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
                                        prescriptionId: nil, legacyRecordedStock: stock.map(Double.init))]
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
      guard state.schemaVersion == 2, state.revision == revision, revision < Self.maximumInteger else {
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
            prescriptionId: try Self.prescription(command["prescriptionId"])))
        case "completeLegacy":
          guard let pending = state.pendingLegacy else { throw MedicationStorageError.notFound }
          state.records = [MedicationRecord(id: pending.id,
            displayName: try Self.name(command["displayName"]).trimmingCharacters(in: .whitespacesAndNewlines),
            prescriptionId: nil, legacyRecordedStock: Double(pending.stock))]
          state.pendingLegacy = nil
        case "edit", "establishBaseline", "addStock", "setLowStockThreshold", "remove", "linkHealth", "unlinkHealth":
          let id = try Self.identifier(command["id"])
          guard let index = state.records.firstIndex(where: { $0.id == id }) else {
            throw MedicationStorageError.notFound
          }
          if type == "linkHealth" {
            let reference = try Self.name(command["conceptReference"])
            try validateConcept(reference)
            for other in state.records where other.id != id {
              if let existing = other.healthKitConceptReference, try sameConcept(existing, reference) {
                throw MedicationStorageError.duplicateHealthLink
              }
            }
            // Preserve the stored token for an unchanged semantic identity. JS
            // provenance checks can then use that token without archive equality.
            if let existing = state.records[index].healthKitConceptReference, try sameConcept(existing, reference) {
              return state
            }
            guard command["quantity"] != nil, !(command["quantity"] is NSNull) else {
              throw MedicationStorageError.baselineRequired
            }
            let record = state.records[index]
            let baseline = StockBaseline(id: try Self.identifier(makeID()), quantity: try Self.quantity(command["quantity"]),
              recordedAt: try Self.instant(Self.formatter().string(from: now())), healthKitConceptReference: reference)
            guard baseline.id != record.stockBaseline?.id, !record.stockAdditions.contains(where: { $0.id == baseline.id }) else {
              throw MedicationStorageError.invalidInput
            }
            state.records[index].healthKitConceptReference = reference
            state.records[index].stockBaseline = baseline
            state.records[index].stockAdditions = []
            state.records[index].legacyRecordedStock = nil
          } else if type == "unlinkHealth" {
            guard state.records[index].healthKitConceptReference != nil else { return state }
            state.records[index].healthKitConceptReference = nil
            // Retain the old baseline/source as confirmation-required. Do not
            // decode it: unlink must work without Health access or on older OSes.
            // Defensive clearing prevents a malformed legacy+link combination
            // from reviving an undeducted manual total after unlink.
            state.records[index].legacyRecordedStock = nil
          } else if type == "edit" {
            state.records[index].displayName = try Self.name(command["displayName"]).trimmingCharacters(in: .whitespacesAndNewlines)
            state.records[index].prescriptionId = try Self.prescription(command["prescriptionId"])
          } else if type == "setLowStockThreshold" {
            state.records[index].lowStockThreshold = try Self.optionalQuantity(command["quantity"])
          } else if type == "establishBaseline" {
            let baseline = StockBaseline(id: try Self.identifier(makeID()), quantity: try Self.quantity(command["quantity"]),
              recordedAt: try Self.instant(Self.formatter().string(from: now())),
              healthKitConceptReference: state.records[index].healthKitConceptReference)
            guard baseline.id != state.records[index].stockBaseline?.id,
                  !state.records[index].stockAdditions.contains(where: { $0.id == baseline.id }) else {
              throw MedicationStorageError.invalidInput
            }
            state.records[index].stockBaseline = baseline
            state.records[index].stockAdditions = []
            // Only the complete snapshot is published. Failed writes keep the old
            // legacy value; lost acknowledgements require a durable read-back.
            state.records[index].legacyRecordedStock = nil
          } else if type == "addStock" {
            let amount = try Self.quantity(command["quantity"])
            guard amount > 0 else { throw MedicationStorageError.invalidInput }
            let record = state.records[index]
            if let baseline = record.stockBaseline {
              let sourceMatches: Bool
              if let baselineSource = baseline.healthKitConceptReference, let source = record.healthKitConceptReference {
                sourceMatches = try sameConcept(baselineSource, source)
              } else { sourceMatches = baseline.healthKitConceptReference == nil && record.healthKitConceptReference == nil }
              guard sourceMatches else {
                throw MedicationStorageError.invalidInput
              }
              let total = record.stockAdditions.reduce(baseline.quantity) { $0 + $1.quantity }
              guard total + amount > total else { throw MedicationStorageError.invalidInput }
              _ = try Self.quantity(total + amount)
              let entry = StockAddition(id: try Self.identifier(makeID()), baselineId: baseline.id,
                quantity: amount, recordedAt: try Self.instant(Self.formatter().string(from: now())))
              guard entry.id != baseline.id, !record.stockAdditions.contains(where: { $0.id == entry.id }),
                    entry.recordedAt >= baseline.recordedAt else { throw MedicationStorageError.invalidInput }
              state.records[index].stockAdditions.append(entry)
            } else if let legacy = record.legacyRecordedStock, record.healthKitConceptReference == nil {
              guard legacy + amount > legacy else { throw MedicationStorageError.invalidInput }
              state.records[index].legacyRecordedStock = try Self.addLegacyCount(legacy, amount)
            } else { throw MedicationStorageError.invalidInput }
          } else { state.records.remove(at: index) }
        default: throw MedicationStorageError.invalidInput
        }
      } catch MedicationStorageError.invalidRecord { throw MedicationStorageError.invalidInput }
      state.revision += 1
      return try publish(state, inserting: false)
    }
  }
}
