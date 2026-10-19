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
      ("v1 upgrade preserves all data and is retry-safe", upgradeV1),
      ("fractional baselines, additions, correction and threshold", stockV2),
      ("failed baseline replacement preserves legacy until publication", baselineFailure),
      ("v2 malformed stock state fails closed", malformedStockV2),
      ("prescription unlink preserves all v2 stock fields", unlinkV2),
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
          try check(state.records == [MedicationRecord(id: firstID, displayName: name, prescriptionId: nil, legacyRecordedStock: stock.map(Double.init))], "Migration changed actual values")
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
          try check(record["legacyRecordedStock"] != nil, "Explicit null stock key required")
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
    try check(next.records == [MedicationRecord(id: firstID, displayName: "Named example", prescriptionId: nil, legacyRecordedStock: 7)], "Completion changed preserved data")
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
    try check(second.id != id && second.stockBaseline == nil && second.legacyRecordedStock == nil && second.prescriptionId == prescriptionID, "New record identity/defaults incorrect")
    state = try storage.mutate(revision: state.revision, command: ["type": "establishBaseline", "id": id, "quantity": 15])
    try check(state.records[0].prescriptionId == prescriptionID && state.records[0].id == id, "Stock changed identity/link")
    state = try storage.mutate(revision: state.revision, command: ["type": "edit", "id": id, "displayName": "Renamed", "prescriptionId": otherPrescriptionID])
    try check(state.records[0].stockBaseline?.quantity == 15 && state.records[0].prescriptionId == otherPrescriptionID, "Relinking changed stock")
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
    try rejects(.commitUncertain) { _ = try storage.mutate(revision: 0, command: ["type": "establishBaseline", "id": firstID, "quantity": 15]) }
    keychain.readFailure = nil; keychain.failVerification = false
    let state = try store(keychain).read()
    try check(state.revision == 1 && state.records[0].stockBaseline?.quantity == 15, "Lost acknowledgement rolled back")
    try rejects(.staleState) { _ = try storage.mutate(revision: 0, command: ["type": "establishBaseline", "id": firstID, "quantity": 15]) }
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
    let base: [String: Any] = ["schemaVersion": 2, "revision": 0, "records": [], "pendingLegacy": NSNull()]
    let record = MedicationRecord(id: firstID, displayName: "Example", prescriptionId: nil, legacyRecordedStock: 0).payload
    var cases = [base.merging(["schemaVersion": 3]) { _, new in new },
                 base.merging(["revision": true]) { _, new in new },
                 base.merging(["records": [record, record]]) { _, new in new },
                 base.merging(["pendingLegacy": ["id": firstID, "stock": 0, "prescriptionId": prescriptionID]]) { _, new in new }]
    var missing = base; missing.removeValue(forKey: "pendingLegacy"); cases.append(missing)
    for field in ["legacyRecordedStock", "stockBaseline", "stockAdditions", "lowStockThreshold", "healthKitLink", "stockUnit", "prescriptionId"] {
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
    for stock in [true, -1, Double.nan, Double.infinity, -Double.infinity, "2", NSNull(), 9_007_199_254_740_992] as [Any] {
      try rejects(.invalidInput) { _ = try storage.mutate(revision: 0, command: ["type": "establishBaseline", "id": firstID, "quantity": stock]) }
    }
    try rejects(.invalidInput) { _ = try storage.mutate(revision: 0, command: ["type": "edit", "id": firstID, "displayName": " ", "prescriptionId": NSNull()]) }
    try rejects(.invalidInput) { _ = try storage.mutate(revision: 0, command: ["type": "edit", "id": firstID, "displayName": "Example", "prescriptionId": [prescriptionID]]) }
    try rejects(.notFound) { _ = try storage.mutate(revision: 0, command: ["type": "remove", "id": prescriptionID]) }
    try rejects(.invalidInput) { _ = try storage.mutate(revision: 0, command: ["type": "setStock", "id": firstID, "stock": 999]) }
    try check(keychain.entries == old, "Invalid command changed durable data")
    keychain.entries.removeValue(forKey: MedicationCollectionStorage.service)
    try rejects(.notFound) { _ = try storage.mutate(revision: 0, command: ["type": "establishBaseline", "id": firstID, "quantity": 0]) }
    try check(keychain.entries[MedicationCollectionStorage.service] == nil, "Mutation recreated missing collection")
  }

  static func concurrentWrites() throws {
    let keychain = FakeKeychain(); keychain.legacy(name: "Example", stock: nil)
    _ = try store(keychain).read()
    let resultLock = NSLock(); var successes = 0; var failures = 0
    DispatchQueue.concurrentPerform(iterations: 12) { _ in
      do {
        _ = try store(keychain).mutate(revision: 0, command: ["type": "establishBaseline", "id": firstID, "quantity": 4])
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
          state = try storage.mutate(revision: state.revision, command: ["type": "establishBaseline", "id": state.records[index].id, "quantity": index - 1])
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
    try check(restored.records == before.records.map { original in var result = original; result.prescriptionId = nil; return result }, "Uncertain unlink must retain a whole committed snapshot")
  }
  static func v1Bytes(stock: Any = 12, pending: Bool = false) throws -> Data {
    let records: [[String: Any]] = pending ? [] : [["id": firstID, "displayName": "Synthetic", "stock": stock, "prescriptionId": prescriptionID]]
    return try JSONSerialization.data(withJSONObject: ["schemaVersion": 1, "revision": 8, "records": records,
      "pendingLegacy": pending ? ["id": firstID, "stock": stock, "prescriptionId": NSNull()] as Any : NSNull()])
  }
  static func upgradeV1() throws {
    for value in [NSNull(), 0, 12, MedicationCollectionStorage.maximumInteger] as [Any] {
      let keychain = FakeKeychain()
      let source = try v1Bytes(stock: value)
      keychain.entries[MedicationCollectionStorage.service] = source
      keychain.failWrites = true
      try rejects(.writeFailed) { _ = try store(keychain).read() }
      try check(keychain.entries[MedicationCollectionStorage.service] == source, "Failed upgrade changed v1 bytes")
      keychain.failWrites = false; keychain.failVerification = true
      try rejects(.commitUncertain) { _ = try store(keychain).read() }
      keychain.failVerification = false; keychain.readFailure = nil
      let state = try store(keychain).read()
      try check(state.schemaVersion == 2 && state.revision == 9, "Upgrade must increment revision once")
      try check(state.records[0].id == firstID && state.records[0].prescriptionId == prescriptionID, "Identity/link lost")
      try check(state.records[0].stockBaseline == nil && state.records[0].stockAdditions.isEmpty, "Migration fabricated baseline")
      let expected = value is NSNull ? nil : (value as? NSNumber)?.doubleValue
      try check(state.records[0].legacyRecordedStock == expected, "Migration changed stock")
      _ = try store(keychain).read()
      try check(keychain.writes.count == 1, "Migration replayed")
      try rejects(.staleState) { _ = try store(keychain).mutate(revision: 8, command: ["type": "remove", "id": firstID]) }
    }
    let keychain = FakeKeychain()
    keychain.entries[MedicationCollectionStorage.service] = try v1Bytes(stock: 0, pending: true)
    let state = try store(keychain).read()
    try check(state.pendingLegacy?.stock == 0 && state.pendingLegacy?.id == firstID && state.records.isEmpty, "Pending legacy lost")
    keychain.entries[MedicationCollectionStorage.service] = try v1Bytes(stock: 0.5)
    try rejects(.invalidRecord) { _ = try store(keychain).read() }
  }
  static func stockV2() throws {
    let keychain = FakeKeychain(); keychain.legacy(name: "Synthetic", stock: "{\"estimatedStock\":12}")
    let decimals = FakeKeychain(); decimals.legacy(name: "Synthetic", stock: "{\"estimatedStock\":0}")
    let decimalStore = MedicationCollectionStorage(keychain: decimals)
    var decimalState = try decimalStore.read(); let decimalID = decimalState.records[0].id
    for amount in [0.1, 0.2] {
      decimalState = try decimalStore.mutate(revision: decimalState.revision,
        command: ["type": "addStock", "id": decimalID, "quantity": amount])
    }
    try check(decimalState.records[0].legacyRecordedStock == 0.3, "Legacy additions persisted rounding noise")
    let clock = Date(timeIntervalSince1970: 1_767_225_600)
    let storage = MedicationCollectionStorage(keychain: keychain, now: { clock })
    var state = try storage.read(); let id = state.records[0].id
    state = try storage.mutate(revision: state.revision, command: ["type": "addStock", "id": id, "quantity": 0.5])
    try check(state.records[0].legacyRecordedStock == 12.5 && state.records[0].stockBaseline == nil, "Legacy addition fabricated baseline")
    state = try storage.mutate(revision: state.revision, command: ["type": "establishBaseline", "id": id, "quantity": 4.5])
    let baseline = state.records[0].stockBaseline!
    let rolledBackClock = MedicationCollectionStorage(keychain: keychain, now: { clock.addingTimeInterval(-1) })
    try rejects(.invalidInput) { _ = try rolledBackClock.mutate(revision: state.revision, command: ["type": "addStock", "id": id, "quantity": 1]) }
    try check(state.records[0].legacyRecordedStock == nil && baseline.quantity == 4.5, "Baseline not authoritative")
    state = try storage.mutate(revision: state.revision, command: ["type": "addStock", "id": id, "quantity": 0.5])
    try check(state.records[0].stockBaseline == baseline && state.records[0].stockAdditions[0].baselineId == baseline.id, "Addition rewrote baseline")
    state = try storage.mutate(revision: state.revision, command: ["type": "setLowStockThreshold", "id": id, "quantity": 0.25])
    try check(state.records[0].lowStockThreshold == 0.25, "Fractional threshold lost")
    state = try storage.mutate(revision: state.revision, command: ["type": "establishBaseline", "id": id, "quantity": 0])
    try check(state.records[0].stockBaseline?.id != baseline.id && state.records[0].stockAdditions.isEmpty && state.records[0].lowStockThreshold == 0.25, "Correction scope incorrect")
    state = try storage.mutate(revision: state.revision, command: ["type": "setLowStockThreshold", "id": id, "quantity": NSNull()])
    try check(state.records[0].lowStockThreshold == nil, "Threshold not disabled")
    let restored = try MedicationCollectionStorage(keychain: keychain).read()
    try check(restored == state, "V2 round trip changed data")
    let bytes = keychain.entries[MedicationCollectionStorage.service]!
    let object = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
    let record = (object["records"] as! [[String: Any]])[0]
    try check(record["stock"] == nil && record["estimatedStock"] == nil, "Persisted derived balance")
  }
  static func baselineFailure() throws {
    let keychain = FakeKeychain(); keychain.legacy(name: "Synthetic", stock: "{\"estimatedStock\":12}")
    let storage = MedicationCollectionStorage(keychain: keychain)
    let state = try storage.read(); let before = keychain.entries
    let command: [String: Any] = ["type": "establishBaseline", "id": state.records[0].id, "quantity": 2.5]
    keychain.failWrites = true
    try rejects(.writeFailed) { _ = try storage.mutate(revision: state.revision, command: command) }
    try check(before == keychain.entries, "Failure cleared legacy stock")
    keychain.failWrites = false; keychain.failVerification = true
    try rejects(.commitUncertain) { _ = try storage.mutate(revision: state.revision, command: command) }
    keychain.failVerification = false; keychain.readFailure = nil
    let restored = try storage.read()
    try check(restored.records[0].stockBaseline?.quantity == 2.5 && restored.records[0].legacyRecordedStock == nil, "Uncertain publication not recovered")
    try rejects(.staleState) { _ = try storage.mutate(revision: state.revision, command: command) }
    for (key, value) in before where key != MedicationCollectionStorage.service { try check(keychain.entries[key] == value, "Singleton recovery bytes changed") }
  }
  static func malformedStockV2() throws {
    let record = MedicationRecord(id: firstID, displayName: "Synthetic", prescriptionId: nil).payload
    let baseline: [String: Any] = ["id": prescriptionID, "quantity": 1.5, "recordedAt": "2026-01-01T00:00:00.000Z", "healthKitConceptReference": NSNull()]
    let changes: [[String: Any]] = [
      ["stockUnit": "mg"], ["lowStockThreshold": true], ["legacyRecordedStock": -1],
      ["stockBaseline": baseline, "legacyRecordedStock": 1],
      ["stockBaseline": baseline.merging(["recordedAt": "2026-02-30T00:00:00.000Z"]) { _, new in new }],
      ["stockAdditions": [["id": prescriptionID, "baselineId": firstID, "quantity": 1, "recordedAt": "2026-01-01T00:00:00.000Z"]]]
    ]
    for change in changes {
      let keychain = FakeKeychain()
      let bytes = try JSONSerialization.data(withJSONObject: ["schemaVersion": 2, "revision": 0,
        "records": [record.merging(change) { _, new in new }], "pendingLegacy": NSNull()])
      keychain.entries[MedicationCollectionStorage.service] = bytes
      try rejects(.invalidRecord) { _ = try store(keychain).read() }
      try check(keychain.entries[MedicationCollectionStorage.service] == bytes && keychain.writes.isEmpty, "Malformed data overwritten")
    }
  }

  static func unlinkV2() throws {
    let keychain = FakeKeychain()
    let baseline = StockBaseline(id: otherPrescriptionID, quantity: 3.5,
      recordedAt: "2026-01-01T00:00:00.000Z", healthKitConceptReference: "synthetic-concept")
    let addition = StockAddition(id: prescriptionID, baselineId: baseline.id, quantity: 0.5,
      recordedAt: "2026-01-02T00:00:00.000Z")
    let record = MedicationRecord(id: firstID, displayName: "Synthetic", prescriptionId: prescriptionID,
      stockBaseline: baseline, stockAdditions: [addition], lowStockThreshold: 1.5,
      healthKitConceptReference: "synthetic-concept")
    let source = MedicationCollection(revision: 4, records: [record], pendingLegacy: nil)
    keychain.entries[MedicationCollectionStorage.service] = try JSONSerialization.data(withJSONObject: source.payload)
    let result = try store(keychain).mutate(revision: 4, command: ["type": "unlinkPrescription", "prescriptionId": prescriptionID])
    var expected = record; expected.prescriptionId = nil
    try check(result.records == [expected], "Unlink changed stock or Health fields")
    let restored = try store(keychain).read()
    try check(restored == result, "Unlink round trip changed fields")
  }

}
