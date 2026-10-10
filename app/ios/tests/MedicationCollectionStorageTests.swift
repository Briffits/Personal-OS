// Standalone native tests; no real medication data or production Keychain access.
// swiftc app/ios/MedicationCollectionStorage.swift app/ios/tests/MedicationCollectionStorageTests.swift -o /tmp/medication-tests
import Foundation

private let firstID = "11111111-1111-4111-8111-111111111111"
private let prescriptionID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
private let otherPrescriptionID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

private func check(_ condition: @autoclosure () -> Bool, _ message: String) throws {
  if !condition() { throw NSError(domain: "MedicationTest", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
private func rejects(_ expected: MedicationStorageError, _ operation: () throws -> Void) throws {
  do { try operation() }
  catch let error as MedicationStorageError {
    try check(error == expected, "Unexpected error: \(error)")
    return
  }
  throw NSError(domain: "MedicationTest", code: 2, userInfo: [NSLocalizedDescriptionKey: "Expected rejection"])
}

private final class FakeKeychain: MedicationKeychainAccess {
  var entries: [String: Data] = [:]
  var readFailure: String?
  var failWrites = false
  var loseAcknowledgement = false
  var failVerification = false
  var writes: [String] = []

  func read(service: String, account: String) throws -> Data? {
    if service == readFailure { throw MedicationStorageError.readFailed }
    return entries[service]
  }
  func insert(_ data: Data, service: String, account: String) throws {
    guard entries[service] == nil else { throw MedicationStorageError.writeFailed }
    try write(data, service: service)
  }
  func update(_ data: Data, service: String, account: String) throws {
    guard entries[service] != nil else { throw MedicationStorageError.writeFailed }
    try write(data, service: service)
  }
  private func write(_ data: Data, service: String) throws {
    if failWrites { throw MedicationStorageError.writeFailed }
    entries[service] = data
    writes.append(service)
    if failVerification { readFailure = service }
    if loseAcknowledgement { throw MedicationStorageError.commitUncertain }
  }
  func legacy(name: String?, stock: String?) {
    entries[MedicationCollectionStorage.legacyNameService] = name.map { Data($0.utf8) }
    entries[MedicationCollectionStorage.legacyStockService] = stock.map { Data($0.utf8) }
  }
}

@main
struct MedicationCollectionStorageTests {
  static func main() throws {
    let tests: [(String, () throws -> Void)] = [
      ("migration matrix and legacy byte preservation", migration),
      ("absent, invalid and inaccessible legacy data are distinct", invalidLegacy),
      ("interrupted initialization and lost response", interruptedInitialization),
      ("pending migration completes once with same ID and null link", pending),
      ("identity, stock, single relationship and deletion isolation", collection),
      ("failed update preserves collection and legacy data", failedUpdate),
      ("lost update response and stale revision", lostUpdate),
      ("empty collection does not resurrect legacy data", emptyCollection),
      ("malformed collection never falls back or overwrites", malformedCollection),
      ("invalid commands and missing IDs never write", invalidCommands),
      ("concurrent writes serialize revision check and publication", concurrentWrites),
      ("concurrent initialization retains one identity", concurrentInitialization),
      ("unlink preserves every medication and survives a fresh storage instance", unlinkPrescription),
      ("failed or uncertain unlink is safe to retry", unlinkFailure),
    ]
    for (name, test) in tests { try test(); print("PASS: \(name)") }
    print("Passed \(tests.count) medication storage tests.")
  }

  private static func store(_ keychain: FakeKeychain) -> MedicationCollectionStorage {
    MedicationCollectionStorage(keychain: keychain, makeID: { firstID })
  }

  static func migration() throws {
    for name in [nil, "Saved synthetic name", "Medication A"] as [String?] {
      for stock in [nil, 0, 12, MedicationCollectionStorage.maximumInteger] as [Int?] {
        let keychain = FakeKeychain()
        keychain.legacy(name: name, stock: stock.map { "{\"estimatedStock\":\($0)}" })
        let old = keychain.entries
        let state = try store(keychain).read()
        if let name = name {
          try check(state.records == [MedicationRecord(id: firstID, displayName: name, stock: stock, prescriptionId: nil)], "Migration changed actual values")
          try check(state.pendingLegacy == nil, "Named medication must be ready")
        } else if let stock = stock {
          try check(state.records.isEmpty && state.pendingLegacy == PendingLegacyMedication(id: firstID, stock: stock), "Stock-only data needs a name")
          try check(state.pendingLegacy!.payload["prescriptionId"] is NSNull, "Pending link must be null")
        } else {
          try check(state.records.isEmpty && state.pendingLegacy == nil, "No fabricated medication")
        }
        for (service, bytes) in old { try check(keychain.entries[service] == bytes, "Legacy bytes changed") }
        let again = try store(keychain).read()
        try check(again == state && keychain.writes.count == 1, "Repeated migration must not duplicate or rewrite")
        let payload = try JSONSerialization.jsonObject(with: keychain.entries[MedicationCollectionStorage.service]!) as! [String: Any]
        try check(payload["pendingLegacy"] != nil, "Explicit null pending key required")
        if let record = (payload["records"] as? [[String: Any]])?.first {
          try check(record["prescriptionId"] is NSNull, "Migration cannot infer a link")
          try check(record["stock"] != nil, "Explicit null stock key required")
        }
      }
    }
  }

  static func invalidLegacy() throws {
    for bad in ["broken", "null", "[]", "12", "\"12\"", "{}", "{\"estimatedStock\":1e400}", "{\"estimatedStock\":true}", "{\"estimatedStock\":-1}",
                "{\"estimatedStock\":1.5}", "{\"estimatedStock\":null}", "{\"estimatedStock\":\"12\"}",
                "{\"estimatedStock\":9007199254740992}"] {
      let keychain = FakeKeychain(); keychain.legacy(name: "Example", stock: bad)
      let old = keychain.entries
      try rejects(.invalidRecord) { _ = try store(keychain).read() }
      try check(old == keychain.entries && keychain.writes.isEmpty, "Invalid source must be untouched")
    }
    for badName in ["", " \n "] {
      let keychain = FakeKeychain(); keychain.legacy(name: badName, stock: "{\"estimatedStock\":12}")
      try rejects(.invalidRecord) { _ = try store(keychain).read() }
      try check(keychain.writes.isEmpty, "Invalid name must not become a default")
    }
    for service in [MedicationCollectionStorage.service, MedicationCollectionStorage.legacyNameService, MedicationCollectionStorage.legacyStockService] {
      let keychain = FakeKeychain(); keychain.readFailure = service
      try rejects(.readFailed) { _ = try store(keychain).read() }
      try check(keychain.writes.isEmpty, "Read failure is not absence")
    }
  }

  static func interruptedInitialization() throws {
    let keychain = FakeKeychain(); keychain.legacy(name: "Example", stock: "{\"estimatedStock\":0}")
    let original = keychain.entries
    keychain.failWrites = true
    try rejects(.writeFailed) { _ = try store(keychain).read() }
    try check(keychain.entries == original, "Interrupted migration must keep source")
    keychain.failWrites = false; keychain.loseAcknowledgement = true
    try rejects(.commitUncertain) { _ = try store(keychain).read() }
    keychain.loseAcknowledgement = false
    let state = try store(keychain).read()
    try check(state.records.count == 1 && state.records[0].id == firstID && keychain.writes.count == 1, "Lost migration response duplicated record")
    let verification = FakeKeychain(); verification.failVerification = true
    try rejects(.commitUncertain) { _ = try store(verification).read() }
    verification.readFailure = nil
    let recovered = try store(verification).read()
    try check(recovered.records.isEmpty && verification.writes.count == 1, "Verification retry rewrote initialized store")
  }

  static func pending() throws {
    let keychain = FakeKeychain(); keychain.legacy(name: nil, stock: "{\"estimatedStock\":7}")
    let storage = store(keychain); let state = try storage.read()
    try rejects(.migrationRequired) {
      _ = try storage.mutate(revision: 0, command: ["type": "create", "displayName": "Other", "prescriptionId": NSNull()])
    }
    let restarted = try store(keychain).read()
    try check(restarted == state, "Pending identity lost on restart")
    let next = try storage.mutate(revision: 0, command: ["type": "completeLegacy", "displayName": " Named example "])
    try check(next.records == [MedicationRecord(id: firstID, displayName: "Named example", stock: 7, prescriptionId: nil)], "Completion changed preserved data")
    try check(next.pendingLegacy == nil, "Pending not cleared")
    try rejects(.staleState) { _ = try storage.mutate(revision: 0, command: ["type": "completeLegacy", "displayName": "Duplicate"]) }
  }

  static func collection() throws {
    let keychain = FakeKeychain(); keychain.legacy(name: "First", stock: "{\"estimatedStock\":12}")
    let storage = MedicationCollectionStorage(keychain: keychain)
    var state = try storage.read(); let id = state.records[0].id
    state = try storage.mutate(revision: state.revision, command: ["type": "edit", "id": id, "displayName": "Renamed", "prescriptionId": prescriptionID])
    state = try storage.mutate(revision: state.revision, command: ["type": "create", "displayName": "Renamed", "prescriptionId": prescriptionID])
    let second = state.records[1]
    try check(second.id != id && second.stock == nil && second.prescriptionId == prescriptionID, "New record identity/defaults incorrect")
    state = try storage.mutate(revision: state.revision, command: ["type": "setStock", "id": id, "stock": 15])
    try check(state.records[0].prescriptionId == prescriptionID && state.records[0].id == id, "Stock changed identity/link")
    state = try storage.mutate(revision: state.revision, command: ["type": "edit", "id": id, "displayName": "Renamed", "prescriptionId": otherPrescriptionID])
    try check(state.records[0].stock == 15 && state.records[0].prescriptionId == otherPrescriptionID, "Relinking changed stock")
    state = try storage.mutate(revision: state.revision, command: ["type": "edit", "id": id, "displayName": "Renamed", "prescriptionId": NSNull()])
    try check(state.records[0].id == id && state.records[0].prescriptionId == nil, "Unlink changed identity")
    state = try storage.mutate(revision: state.revision, command: ["type": "remove", "id": id])
    try check(state.records == [second], "Deletion affected another record")
    try check(keychain.writes.allSatisfy { $0 == MedicationCollectionStorage.service }, "Mutation wrote outside medication collection")
  }

  static func failedUpdate() throws {
    let keychain = FakeKeychain(); keychain.legacy(name: "Example", stock: "{\"estimatedStock\":12}")
    let storage = store(keychain); let state = try storage.read(); let old = keychain.entries
    keychain.failWrites = true
    try rejects(.writeFailed) { _ = try storage.mutate(revision: state.revision, command: ["type": "remove", "id": firstID]) }
    try check(keychain.entries == old, "Failed update deleted existing entry")
    keychain.failWrites = false
    let restarted = try store(keychain).read()
    try check(restarted == state, "Failed update changed durable state")
  }

  static func lostUpdate() throws {
    let keychain = FakeKeychain(); keychain.legacy(name: "Example", stock: "{\"estimatedStock\":12}")
    let storage = store(keychain); _ = try storage.read()
    keychain.failVerification = true
    try rejects(.commitUncertain) { _ = try storage.mutate(revision: 0, command: ["type": "setStock", "id": firstID, "stock": 15]) }
    keychain.readFailure = nil; keychain.failVerification = false
    let state = try store(keychain).read()
    try check(state.revision == 1 && state.records[0].stock == 15, "Lost acknowledgement rolled back")
    try rejects(.staleState) { _ = try storage.mutate(revision: 0, command: ["type": "setStock", "id": firstID, "stock": 15]) }
    try check(keychain.writes.count == 2, "Stale retry wrote again")
  }

  static func emptyCollection() throws {
    let keychain = FakeKeychain(); keychain.legacy(name: "Example", stock: "{\"estimatedStock\":12}")
    let storage = store(keychain); _ = try storage.read()
    _ = try storage.mutate(revision: 0, command: ["type": "remove", "id": firstID])
    keychain.readFailure = MedicationCollectionStorage.legacyNameService
    let state = try store(keychain).read()
    try check(state.records.isEmpty && state.revision == 1, "Legacy data resurrected")
  }

  static func malformedCollection() throws {
    let base: [String: Any] = ["schemaVersion": 1, "revision": 0, "records": [], "pendingLegacy": NSNull()]
    let record = MedicationRecord(id: firstID, displayName: "Example", stock: 0, prescriptionId: nil).payload
    var cases = [base.merging(["schemaVersion": 2]) { _, new in new },
                 base.merging(["revision": true]) { _, new in new },
                 base.merging(["records": [record, record]]) { _, new in new },
                 base.merging(["pendingLegacy": ["id": firstID, "stock": 0, "prescriptionId": prescriptionID]]) { _, new in new }]
    var missing = base; missing.removeValue(forKey: "pendingLegacy"); cases.append(missing)
    for field in ["stock", "prescriptionId"] {
      var invalid = record; invalid.removeValue(forKey: field)
      cases.append(base.merging(["records": [invalid]]) { _, new in new })
    }
    let invalidRelationship = record.merging(["prescriptionId": [prescriptionID, otherPrescriptionID]]) { _, new in new }
    cases.append(base.merging(["records": [invalidRelationship]]) { _, new in new })
    for object in cases {
      let keychain = FakeKeychain(); keychain.legacy(name: "Old example", stock: "{\"estimatedStock\":1}")
      keychain.entries[MedicationCollectionStorage.service] = try JSONSerialization.data(withJSONObject: object)
      let old = keychain.entries
      try rejects(.invalidRecord) { _ = try store(keychain).read() }
      try check(keychain.entries == old && keychain.writes.isEmpty, "Invalid collection was replaced from stale legacy")
    }
  }

  static func invalidCommands() throws {
    let keychain = FakeKeychain(); keychain.legacy(name: "Example", stock: nil)
    let storage = store(keychain); _ = try storage.read()
    let old = keychain.entries
    for stock in [true, -1, 1.5, Double.nan, Double.infinity, -Double.infinity, "2", NSNull(), 9_007_199_254_740_992] as [Any] {
      try rejects(.invalidInput) { _ = try storage.mutate(revision: 0, command: ["type": "setStock", "id": firstID, "stock": stock]) }
    }
    try rejects(.invalidInput) { _ = try storage.mutate(revision: 0, command: ["type": "edit", "id": firstID, "displayName": " ", "prescriptionId": NSNull()]) }
    try rejects(.invalidInput) { _ = try storage.mutate(revision: 0, command: ["type": "edit", "id": firstID, "displayName": "Example", "prescriptionId": [prescriptionID]]) }
    try rejects(.notFound) { _ = try storage.mutate(revision: 0, command: ["type": "remove", "id": prescriptionID]) }
    try check(keychain.entries == old, "Invalid command changed durable data")
    keychain.entries.removeValue(forKey: MedicationCollectionStorage.service)
    try rejects(.notFound) { _ = try storage.mutate(revision: 0, command: ["type": "setStock", "id": firstID, "stock": 0]) }
    try check(keychain.entries[MedicationCollectionStorage.service] == nil, "Mutation recreated missing collection")
  }

  static func concurrentWrites() throws {
    let keychain = FakeKeychain(); keychain.legacy(name: "Example", stock: nil)
    _ = try store(keychain).read()
    let resultLock = NSLock(); var successes = 0; var failures = 0
    DispatchQueue.concurrentPerform(iterations: 12) { _ in
      do {
        _ = try store(keychain).mutate(revision: 0, command: ["type": "setStock", "id": firstID, "stock": 4])
        resultLock.lock(); successes += 1; resultLock.unlock()
      } catch {
        resultLock.lock(); failures += 1; resultLock.unlock()
      }
    }
    try check(successes == 1 && failures == 11 && keychain.writes.count == 2, "Revision check was not serialized")
  }

  static func concurrentInitialization() throws {
    let keychain = FakeKeychain(); keychain.legacy(name: "Example", stock: nil)
    let resultLock = NSLock(); var ids: [String] = []; var failed = false
    DispatchQueue.concurrentPerform(iterations: 12) { _ in
      do {
        let state = try MedicationCollectionStorage(keychain: keychain).read()
        resultLock.lock(); ids.append(state.records[0].id); resultLock.unlock()
      } catch { resultLock.lock(); failed = true; resultLock.unlock() }
    }
    try check(!failed && Set(ids).count == 1 && keychain.writes.count == 1, "Concurrent migration allocated multiple identities")
  }

  static func unlinkPrescription() throws {
    for count in [1, 3] {
      let keychain = FakeKeychain()
      let storage = MedicationCollectionStorage(keychain: keychain)
      var state = try storage.read()
      for index in 0..<count {
        state = try storage.mutate(revision: state.revision, command: ["type": "create", "displayName": "Synthetic \(index)", "prescriptionId": prescriptionID])
        if index > 0 {
          state = try storage.mutate(revision: state.revision, command: ["type": "setStock", "id": state.records[index].id, "stock": index - 1])
        }
      }
      state = try storage.mutate(revision: state.revision, command: ["type": "create", "displayName": "Other", "prescriptionId": otherPrescriptionID])
      state = try storage.mutate(revision: state.revision, command: ["type": "create", "displayName": "Unlinked", "prescriptionId": NSNull()])
      let original = state
      let writes = keychain.writes.count
      state = try storage.mutate(revision: state.revision, command: ["type": "unlinkPrescription", "prescriptionId": prescriptionID])
      let expected = original.records.map { record -> MedicationRecord in
        var result = record
        if result.prescriptionId == prescriptionID { result.prescriptionId = nil }
        return result
      }
      try check(state.records == expected && keychain.writes.count == writes + 1, "Unlink must clear all matching links in one write, preserving all other data")
      let restarted = MedicationCollectionStorage(keychain: keychain)
      let restored = try restarted.read()
      try check(restored == state, "Unlinked state must persist across storage restart")
      let noOp = try restarted.mutate(revision: restored.revision, command: ["type": "unlinkPrescription", "prescriptionId": prescriptionID])
      try check(noOp == restored && keychain.writes.count == writes + 1, "Unlink retry must be an idempotent no-op")
      try rejects(.staleState) {
        _ = try restarted.mutate(revision: original.revision, command: ["type": "unlinkPrescription", "prescriptionId": otherPrescriptionID])
      }
    }
  }

  static func unlinkFailure() throws {
    let keychain = FakeKeychain()
    let storage = MedicationCollectionStorage(keychain: keychain)
    var state = try storage.read()
    for name in ["Synthetic one", "Synthetic two"] {
      state = try storage.mutate(revision: state.revision, command: ["type": "create", "displayName": name, "prescriptionId": prescriptionID])
    }
    let before = state
    keychain.failWrites = true
    try rejects(.writeFailed) {
      _ = try storage.mutate(revision: state.revision, command: ["type": "unlinkPrescription", "prescriptionId": prescriptionID])
    }
    let unchanged = try MedicationCollectionStorage(keychain: keychain).read()
    try check(unchanged == before, "Failed unlink must leave every relationship and record intact")
    keychain.failWrites = false; keychain.failVerification = true
    try rejects(.commitUncertain) {
      _ = try storage.mutate(revision: state.revision, command: ["type": "unlinkPrescription", "prescriptionId": prescriptionID])
    }
    keychain.readFailure = nil; keychain.failVerification = false
    let restored = try MedicationCollectionStorage(keychain: keychain).read()
    try check(restored.records == before.records.map { MedicationRecord(id: $0.id, displayName: $0.displayName, stock: $0.stock, prescriptionId: nil) }, "Uncertain unlink must retain a whole committed snapshot")
  }
}
