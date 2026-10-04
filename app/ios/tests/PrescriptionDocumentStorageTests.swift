// Standalone native storage tests using synthetic files only.
// macOS: xcrun swiftc app/ios/PrescriptionDocumentStorage.swift \
//   app/ios/tests/PrescriptionDocumentStorageTests.swift -o /tmp/personal-os-storage-tests
// Then run /tmp/personal-os-storage-tests.
// macOS exercises transactions/recovery, not iOS Data Protection or Face ID.
import Foundation

private enum TestFailure: Error { case assertion(String), injected }

private func check(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
  guard try condition() else { throw TestFailure.assertion(message) }
}

private func fails(_ operation: () throws -> Void) throws {
  var rejected = false
  do { try operation() } catch { rejected = true }
  try check(rejected, "Expected operation to reject")
}

private func conflicts(_ operation: () throws -> Void) throws {
  do {
    try operation()
  } catch PrescriptionDocumentStorageError.staleRecord {
    return
  }
  throw TestFailure.assertion("Expected stale/conflicting state")
}

private final class FailingFileManager: FileManager, @unchecked Sendable {
  var blockedRemoval: String?
  override func removeItem(at URL: URL) throws {
    if URL.lastPathComponent == blockedRemoval { throw TestFailure.injected }
    try super.removeItem(at: URL)
  }
}

private final class Fixture {
  let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  let manager = FailingFileManager()
  var root: URL { base.appendingPathComponent("wallet") }
  var source: URL { base.appendingPathComponent("synthetic.pdf") }
  var failCommit = false
  var failPublishSync = false
  lazy var store = PrescriptionDocumentStorage(fileManager: manager, root: root,
    beforeCommit: { [unowned self] in
      if self.failCommit { throw TestFailure.injected }
    }, afterPublish: { [unowned self] in
      if self.failPublishSync { throw TestFailure.injected }
    })
  let metadata = PrescriptionMetadata(kind: "standard", medicationIds: [], expiresOn: "2028-02-29",
                                      issuedOn: nil, startsOn: nil)
  let legacy = "00000000-0000-4000-8000-000000000001"
  let retired = "00000000-0000-4000-8000-000000000002"

  init() throws {
    try manager.createDirectory(at: base, withIntermediateDirectories: true)
    try Data("%PDF-1.4\nSynthetic fixture only\n%%EOF".utf8).write(to: source)
  }
  deinit { try? FileManager.default.removeItem(at: base) }

  func restart() -> PrescriptionDocumentStorage { PrescriptionDocumentStorage(fileManager: manager, root: root) }
  func document(_ id: String) -> URL {
    root.appendingPathComponent("documents").appendingPathComponent(id).appendingPathComponent("document.pdf")
  }
  func seedDocument(_ id: String) throws {
    let url = document(id)
    try manager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try manager.copyItem(at: source, to: url)
  }
  func seedLegacy(pending: Bool = false) throws {
    try seedDocument(legacy)
    if pending { try seedDocument(retired) }
    var state: [String: Any] = ["current": legacy]
    if pending { state["pendingCleanup"] = retired }
    try JSONSerialization.data(withJSONObject: state).write(to: root.appendingPathComponent("state.json"))
  }
  func candidate() throws -> String { try store.importCandidate(from: source) }
  func create() throws -> PrescriptionRecord { try store.create(candidate(), metadata: metadata) }
  func exists(_ url: URL) -> Bool { manager.fileExists(atPath: url.path) }
  func bytes(_ url: URL) throws -> Data { try Data(contentsOf: url) }
}

@main
private struct PrescriptionDocumentStorageTests {
  static func main() throws {
    let tests: [(String, () throws -> Void)] = [
      ("multiple independent records and unique document IDs", multiple),
      ("replacement preserves metadata and rejects stale document IDs", replacement),
      ("deletion removes only the selected stored copy", deletion),
      ("failed replacement preserves old document and source", failedReplacement),
      ("failed deletion preserves retained state", failedDeletion),
      ("pending cleanup survives restart and blocks mutations", pendingCleanup),
      ("cleanup failure is retryable", cleanupFailure),
      ("cleanup journal commit failure is retryable after removal", cleanupCommitFailure),
      ("candidate release is isolated and idempotent", candidateRelease),
      ("invalid metadata rejected before document mutation", invalidMetadata),
      ("metadata update compares the entire expected record", staleMetadata),
      ("legacy needs explicit metadata and remains viewable", legacyPending),
      ("identical migration retry returns the same persisted record", identicalMigrationRetry),
      ("different migration retry conflicts without modifying persisted data", conflictingMigrationRetry),
      ("lost-response migration retry uses durable state after restart", lostResponse),
      ("failed migration preserves legacy state and document", failedMigration),
      ("leftover state.next cannot supersede legacy state or trigger cleanup", leftoverStage),
      ("interrupted replacement keeps retained and journalled copies", interruptedReplacement),
      ("orphan cleanup preserves legacy and legacy cleanup journal", legacyOrphans),
      ("corrupt state fails closed before orphan deletion", corruptState),
      ("expired records remain retained and accessible", expired),
      ("uncertain publication preserves new and superseded copies", uncertainReplacement),
      ("migration with uncertain acknowledgement recovers without duplication", uncertainMigration),
      ("a leftover stage after commit cannot recreate the legacy item", leftoverCommittedStage),
    ]
    for (name, test) in tests {
      try test()
      print("PASS: " + name)
    }
    print("Passed \(tests.count) native storage tests.")
  }

  static func multiple() throws {
    let f = try Fixture()
    let one = try f.create()
    let two = try f.create()
    try check(one.id != two.id && one.documentId != two.documentId, "IDs must be independent")
    try check(one.id != one.documentId, "Record and document IDs must differ")
    try check(try f.restart().readState().records == [one, two], "Both records must survive restart")
  }

  static func replacement() throws {
    let f = try Fixture()
    let one = try f.create()
    let two = try f.create()
    let next = try f.store.replace(f.candidate(), expected: one)
    try check(next.id == one.id && next.metadata == one.metadata, "Replacement must preserve identity/metadata")
    try check(next.documentId != one.documentId, "Replacement needs a fresh document ID")
    try check(f.exists(f.document(one.documentId)), "Old copy must await cleanup")
    try fails { _ = try f.store.retainedDocumentURL(for: one.documentId) }
    try f.store.cleanup()
    try check(!f.exists(f.document(one.documentId)), "Only superseded copy should be removed")
    try check(try f.store.readState().records == [next, two], "Unrelated record must survive")
    try conflicts { _ = try f.store.replace(f.candidate(), expected: one) }
    try check(f.exists(f.source), "External source must survive")
  }

  static func deletion() throws {
    let f = try Fixture()
    let one = try f.create()
    let two = try f.create()
    try f.store.remove(one)
    try fails { _ = try f.store.retainedDocumentURL(for: one.documentId) }
    try f.store.cleanup()
    try check(try f.store.readState().records == [two], "Delete must preserve other records")
    try check(f.exists(f.document(two.documentId)) && f.exists(f.source), "Other document and source must survive")
    try f.store.remove(two)
    let state = try f.restart().readState()
    try check(state.records.isEmpty && state.pendingCleanup == [two.documentId], "Last deletion must retain journal")
    try f.restart().recoverOrphans()
    try check(f.exists(f.document(two.documentId)), "Journalled last copy must await cleanup")
    try f.store.cleanup()
    try check(try f.store.readState().pendingCleanup.isEmpty, "Cleanup must support empty collection")
  }

  static func failedReplacement() throws {
    let f = try Fixture()
    let old = try f.create()
    let candidate = try f.candidate()
    f.failCommit = true
    try fails { _ = try f.store.replace(candidate, expected: old) }
    try check(try f.store.readState().records == [old], "Failed commit must preserve old record")
    try check(f.exists(f.document(old.documentId)) && f.exists(f.source), "Retained and external files must survive")
    let copies = try f.manager.contentsOfDirectory(at: f.root.appendingPathComponent("documents"), includingPropertiesForKeys: nil)
    try check(copies.count == 1, "Failed import must not leave a partial document")
  }

  static func failedDeletion() throws {
    let f = try Fixture()
    let old = try f.create()
    f.failCommit = true
    try fails { try f.store.remove(old) }
    try check(try f.store.readState().records == [old], "Failed delete must preserve metadata")
    try check(try f.exists(f.store.retainedDocumentURL(for: old.documentId)), "Failed delete must preserve viewing")
  }

  static func pendingCleanup() throws {
    let f = try Fixture()
    let old = try f.create()
    let next = try f.store.replace(f.candidate(), expected: old)
    let restarted = f.restart()
    let candidate = try f.candidate()
    try fails { _ = try restarted.create(candidate, metadata: f.metadata) }
    try fails { _ = try restarted.replace(candidate, expected: next) }
    try fails { try restarted.remove(next) }
    try fails { _ = try restarted.updateMetadata(next, metadata: f.metadata) }
    try check(try f.exists(restarted.retainedDocumentURL(for: next.documentId)), "Viewing must survive pending cleanup")
    try restarted.cleanup()
    try restarted.cleanup()
    try check(try restarted.readState().pendingCleanup.isEmpty, "Cleanup retry must be idempotent")
  }

  static func cleanupFailure() throws {
    let f = try Fixture()
    let old = try f.create()
    let next = try f.store.replace(f.candidate(), expected: old)
    f.manager.blockedRemoval = old.documentId
    try fails { try f.store.cleanup() }
    try check(try f.store.readState().pendingCleanup == [old.documentId], "Failed cleanup must retain journal")
    try check(f.exists(f.document(next.documentId)), "Cleanup must preserve retained copy")
    f.manager.blockedRemoval = nil
    try f.restart().cleanup()
    try check(try f.store.readState().pendingCleanup.isEmpty, "Retry must clear journal")
  }

  static func cleanupCommitFailure() throws {
    let f = try Fixture()
    let old = try f.create()
    _ = try f.store.replace(f.candidate(), expected: old)
    f.failCommit = true
    try fails { try f.store.cleanup() }
    try check(!f.exists(f.document(old.documentId)), "Removal precedes clearing journal")
    try check(try f.store.readState().pendingCleanup == [old.documentId], "Failed journal update must remain retryable")
    try f.restart().cleanup()
    try check(try f.store.readState().pendingCleanup.isEmpty, "Already removed file must be tolerated")
  }

  static func candidateRelease() throws {
    let f = try Fixture()
    let candidate = try f.candidate()
    let record = try f.store.create(candidate, metadata: f.metadata)
    try f.store.release(candidate)
    try f.store.release(candidate)
    try f.store.release(record.documentId) // candidate and document namespaces are separate
    try check(f.exists(f.document(record.documentId)) && f.exists(f.source), "Release must not delete document/source")
  }

  static func invalidMetadata() throws {
    let f = try Fixture()
    let candidate = try f.candidate()
    for input in [
      PrescriptionMetadata(kind: "standard", medicationIds: [], expiresOn: "", issuedOn: nil, startsOn: nil),
      PrescriptionMetadata(kind: "standard", medicationIds: [], expiresOn: "2027-02-29", issuedOn: nil, startsOn: nil),
      PrescriptionMetadata(kind: "standard", medicationIds: [], expiresOn: "2028-02-29", issuedOn: nil, startsOn: "2028-01-01"),
      PrescriptionMetadata(kind: "temporary", medicationIds: ["a", "a"], expiresOn: "2028-02-29", issuedOn: nil, startsOn: nil),
      PrescriptionMetadata(kind: "temporary", medicationIds: [], expiresOn: "2028-02-29", issuedOn: "2029-01-01", startsOn: nil),
    ] {
      try fails { _ = try f.store.create(candidate, metadata: input) }
    }
    try check(try f.store.readState().records.isEmpty, "Invalid metadata must never create records")
    try check(PrescriptionMetadata.isDate("2000-02-29") && !PrescriptionMetadata.isDate("1900-02-29"), "Leap-year parity")
  }

  static func staleMetadata() throws {
    let f = try Fixture()
    let old = try f.create()
    let metadata = PrescriptionMetadata(kind: "temporary", medicationIds: ["synthetic-a", "synthetic-b"],
      expiresOn: "2029-01-01", issuedOn: "2027-01-01", startsOn: "2028-01-01")
    let next = try f.store.updateMetadata(old, metadata: metadata)
    try check(next.id == old.id && next.documentId == old.documentId, "Metadata must preserve both IDs")
    try conflicts { _ = try f.store.updateMetadata(old, metadata: f.metadata) }
    try conflicts { try f.store.remove(old) }
    try conflicts { _ = try f.store.replace(f.candidate(), expected: old) }
    try check(try f.store.readState().records == [next], "Stale snapshots must not overwrite changes")
  }

  static func legacyPending() throws {
    let f = try Fixture()
    try f.seedLegacy()
    let state = try f.store.readState()
    try check(state.records.isEmpty && state.legacyDocumentId == f.legacy, "Legacy must not fabricate metadata")
    try check(try f.exists(f.store.retainedDocumentURL(for: f.legacy)), "Legacy must stay viewable")
    try fails { _ = try f.create() }
    let bad = PrescriptionMetadata(kind: "standard", medicationIds: [], expiresOn: "", issuedOn: nil, startsOn: nil)
    try fails { _ = try f.store.migrateLegacy(f.legacy, metadata: bad) }
    try check(try f.store.readState() == state, "Missing expiry must preserve legacy state")
  }

  static func identicalMigrationRetry() throws {
    let f = try Fixture()
    try f.seedLegacy()
    let document = try f.bytes(f.document(f.legacy))
    let first = try f.store.migrateLegacy(f.legacy, metadata: f.metadata)
    let committed = try f.bytes(f.root.appendingPathComponent("state.json"))
    let retry = try f.restart().migrateLegacy(f.legacy, metadata: f.metadata)
    try check(first == retry, "Identical retry must return the same persisted record")
    try check(try f.store.readState().records == [first], "Retry must not duplicate")
    try check(try f.bytes(f.root.appendingPathComponent("state.json")) == committed, "Retry must not rewrite state")
    try check(try f.bytes(f.document(f.legacy)) == document, "Migration must not touch document bytes")
  }

  static func conflictingMigrationRetry() throws {
    let f = try Fixture()
    try f.seedLegacy()
    let migrated = try f.store.migrateLegacy(f.legacy, metadata: f.metadata)
    let committed = try f.bytes(f.root.appendingPathComponent("state.json"))
    let changed = PrescriptionMetadata(kind: "temporary", medicationIds: [], expiresOn: "2029-01-01",
      issuedOn: nil, startsOn: nil)
    try conflicts { _ = try f.restart().migrateLegacy(f.legacy, metadata: changed) }
    try check(try f.store.readState().records == [migrated], "Conflicting retry must leave original metadata intact")
    try check(try f.bytes(f.root.appendingPathComponent("state.json")) == committed, "Conflict must not write state")
    try check(f.exists(f.document(f.legacy)), "Conflict must not alter document")
  }

  static func lostResponse() throws {
    let f = try Fixture()
    try f.seedLegacy()
    _ = try f.store.migrateLegacy(f.legacy, metadata: f.metadata) // caller never receives/uses response
    let committed = try f.restart().readState()
    let recovered = try f.restart().migrateLegacy(f.legacy, metadata: f.metadata)
    try check(committed.records == [recovered], "Lost response must recover from disk without a duplicate")
    try check(committed.legacyDocumentId == nil, "Completion must be durable")
  }

  static func failedMigration() throws {
    let f = try Fixture()
    try f.seedLegacy()
    let originalState = try f.bytes(f.root.appendingPathComponent("state.json"))
    let originalDocument = try f.bytes(f.document(f.legacy))
    f.failCommit = true
    try fails { _ = try f.store.migrateLegacy(f.legacy, metadata: f.metadata) }
    try check(try f.bytes(f.root.appendingPathComponent("state.json")) == originalState, "Failed commit must leave legacy format intact")
    try f.restart().recoverOrphans()
    try check(try f.bytes(f.restart().retainedDocumentURL(for: f.legacy)) == originalDocument, "Failed migration must preserve legacy access")
    let record = try f.restart().migrateLegacy(f.legacy, metadata: f.metadata)
    try check(record.documentId == f.legacy, "Retry must retain the original stored document")
  }

  static func leftoverStage() throws {
    let f = try Fixture()
    try f.seedLegacy()
    let stagedRecord = PrescriptionRecord(id: UUID().uuidString.lowercased(), documentId: f.legacy, metadata: f.metadata)
    let stage = PrescriptionDocumentState(records: [stagedRecord])
    try JSONEncoder().encode(stage).write(to: f.root.appendingPathComponent("state.next"))
    try f.restart().recoverOrphans()
    try check(try f.restart().readState().legacyDocumentId == f.legacy, "Uncommitted stage must be ignored")
    try check(try f.exists(f.restart().retainedDocumentURL(for: f.legacy)), "Stage must never orphan legacy")
    let committed = try f.restart().migrateLegacy(f.legacy, metadata: f.metadata)
    try check(try f.restart().readState().records == [committed], "Retry must create exactly one valid record")
  }

  static func interruptedReplacement() throws {
    let f = try Fixture()
    let old = try f.create()
    let candidate = try f.candidate()
    let next = try f.store.replace(candidate, expected: old) // crash before release/cleanup
    let orphan = UUID().uuidString.lowercased()
    try f.seedDocument(orphan) // interrupted import before metadata commit
    let restarted = f.restart()
    try restarted.recoverOrphans()
    try check(f.exists(f.document(old.documentId)) && f.exists(f.document(next.documentId)), "Recovery must preserve journal and retained copy")
    try check(!f.exists(f.document(orphan)), "Unreferenced partial import should be recovered")
    try check(!f.exists(f.root.appendingPathComponent("candidates").appendingPathComponent(candidate)), "Orphan candidates should be released")
    try restarted.cleanup()
    try check(try restarted.readState().records == [next], "Cleanup must preserve committed replacement")
  }

  static func legacyOrphans() throws {
    let f = try Fixture()
    try f.seedLegacy(pending: true)
    let orphan = UUID().uuidString.lowercased()
    try f.seedDocument(orphan)
    try f.store.recoverOrphans()
    try check(f.exists(f.document(f.legacy)) && f.exists(f.document(f.retired)), "Legacy references and journal must be protected")
    try check(!f.exists(f.document(orphan)), "Only orphan copy should be removed")
    try fails { _ = try f.store.migrateLegacy(f.legacy, metadata: f.metadata) }
    try f.store.cleanup()
    try check(try f.store.readState().legacyDocumentId == f.legacy, "Legacy cleanup must preserve migration reference")
    try check(try f.exists(f.store.retainedDocumentURL(for: f.legacy)), "Legacy remains viewable after cleanup")
    _ = try f.store.migrateLegacy(f.legacy, metadata: f.metadata)
  }

  static func corruptState() throws {
    let f = try Fixture()
    try f.seedLegacy()
    for bytes in [Data("invalid".utf8), Data(#"{"version":99,"records":[],"pendingCleanup":[]}"#.utf8)] {
      try bytes.write(to: f.root.appendingPathComponent("state.json"))
      try fails { try f.store.recoverOrphans() }
      try fails { _ = try f.store.readState() }
      try check(f.exists(f.document(f.legacy)), "Corrupt state must never authorize cleanup")
    }
  }

  static func expired() throws {
    let f = try Fixture()
    let metadata = PrescriptionMetadata(kind: "temporary", medicationIds: [],
      expiresOn: "2000-01-01", issuedOn: nil, startsOn: nil)
    let record = try f.store.create(f.candidate(), metadata: metadata)
    try f.restart().recoverOrphans()
    try check(try f.restart().readState().records == [record], "Expiry must not delete or change lifecycle")
    try check(try f.exists(f.restart().retainedDocumentURL(for: record.documentId)), "Expired documents remain accessible")
  }

  static func uncertainReplacement() throws {
    let f = try Fixture()
    let old = try f.create()
    f.failPublishSync = true
    try fails { _ = try f.store.replace(f.candidate(), expected: old) }
    let state = try f.restart().readState()
    try check(state.records.count == 1 && state.records[0].id == old.id, "Published replacement must remain referenced")
    try check(state.records[0].documentId != old.documentId, "New document must remain published")
    try check(f.exists(f.document(old.documentId)) && f.exists(f.document(state.records[0].documentId)),
              "An uncertain commit must never delete either document")
    try f.restart().recoverOrphans()
    try f.restart().cleanup()
    try check(try f.restart().readState().records == state.records, "Durable cleanup must preserve replacement")
  }

  static func uncertainMigration() throws {
    let f = try Fixture()
    try f.seedLegacy()
    let original = try f.bytes(f.document(f.legacy))
    f.failPublishSync = true
    try fails { _ = try f.store.migrateLegacy(f.legacy, metadata: f.metadata) }
    let published = try f.restart().readState()
    let retried = try f.restart().migrateLegacy(f.legacy, metadata: f.metadata)
    try check(published.records == [retried], "Retry must recognize published migration")
    try check(try f.bytes(f.restart().retainedDocumentURL(for: f.legacy)) == original,
              "Uncertain migration must preserve the original document and access")
  }

  static func leftoverCommittedStage() throws {
    let f = try Fixture()
    try f.seedLegacy()
    let record = try f.store.migrateLegacy(f.legacy, metadata: f.metadata)
    let legacyStage = PrescriptionDocumentState(legacyDocumentId: f.legacy)
    try JSONEncoder().encode(legacyStage).write(to: f.root.appendingPathComponent("state.next"))
    try f.restart().recoverOrphans()
    try check(try f.restart().readState().records == [record], "Stale stage must not replace committed state")
    try check(try f.restart().migrateLegacy(f.legacy, metadata: f.metadata) == record,
              "Stale stage must not cause duplicate migration")
  }
}
