import Foundation
import UniformTypeIdentifiers
import Darwin

struct PrescriptionMetadata: Codable, Equatable {
  let kind: String
  let medicationIds: [String]
  let expiresOn: String
  let issuedOn: String?
  let startsOn: String?

  static func isDate(_ value: String) -> Bool {
    guard value.range(of: #"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"#, options: .regularExpression) != nil else {
      return false
    }
    let parts = value.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return false }
    let (year, month, day) = (parts[0], parts[1], parts[2])
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
    let days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
  }

  func validate() throws {
    guard ["standard", "temporary"].contains(kind),
          Set(medicationIds).count == medicationIds.count,
          medicationIds.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }),
          Self.isDate(expiresOn),
          issuedOn.map({ Self.isDate($0) && $0 <= expiresOn }) ?? true,
          startsOn.map({ kind == "temporary" && Self.isDate($0) && $0 <= expiresOn }) ?? true else {
      throw PrescriptionDocumentStorageError.invalidState
    }
  }
}

struct PrescriptionRecord: Codable, Equatable {
  let id: String
  let documentId: String
  let kind: String
  let medicationIds: [String]
  let expiresOn: String
  let issuedOn: String?
  let startsOn: String?

  var metadata: PrescriptionMetadata {
    PrescriptionMetadata(kind: kind, medicationIds: medicationIds, expiresOn: expiresOn,
                         issuedOn: issuedOn, startsOn: startsOn)
  }

  init(id: String, documentId: String, metadata: PrescriptionMetadata) {
    self.id = id
    self.documentId = documentId
    kind = metadata.kind
    medicationIds = metadata.medicationIds
    expiresOn = metadata.expiresOn
    issuedOn = metadata.issuedOn
    startsOn = metadata.startsOn
  }

  func validate() throws {
    guard PrescriptionDocumentStorage.isValidIdentifier(id),
          PrescriptionDocumentStorage.isValidIdentifier(documentId), id != documentId else {
      throw PrescriptionDocumentStorageError.invalidState
    }
    try metadata.validate()
  }
}

struct PrescriptionDocumentState: Codable, Equatable {
  var version = 2
  var records: [PrescriptionRecord] = []
  var pendingCleanup: [String] = []
  // Only a protected document reference: no fabricated prescription metadata.
  var legacyDocumentId: String?

  func validate() throws {
    let documents = records.map { $0.documentId }
    let retained = documents + (legacyDocumentId.map { [$0] } ?? [])
    guard version == 2,
          Set(records.map { $0.id }).count == records.count,
          Set(retained).count == retained.count,
          Set(pendingCleanup).count == pendingCleanup.count,
          retained.allSatisfy(PrescriptionDocumentStorage.isValidIdentifier),
          pendingCleanup.allSatisfy(PrescriptionDocumentStorage.isValidIdentifier),
          Set(retained).isDisjoint(with: pendingCleanup),
          legacyDocumentId == nil || records.isEmpty else {
      throw PrescriptionDocumentStorageError.invalidState
    }
    try records.forEach { try $0.validate() }
  }

  func retains(_ document: String) -> Bool {
    legacyDocumentId == document || records.contains { $0.documentId == document }
  }
}

private struct LegacyPrescriptionState: Decodable {
  let current: String?
  let pendingCleanup: String?
}

enum PrescriptionDocumentStorageError: Error {
  case invalidState, invalidIdentifier, candidateMissing, documentMissing
  case cleanupPending, migrationRequired, staleRecord, unsupportedDocument, commitFailed, commitUncertain
}

final class PrescriptionDocumentStorage {
  // All instances in this process use one transaction lock. No extensions write this store.
  private static let lock = NSRecursiveLock()
  private let fileManager: FileManager
  private let rootOverride: URL?
  private let beforeCommit: (() throws -> Void)?
  private let afterPublish: (() throws -> Void)?

  // Root and transaction fault injection allow isolated native storage tests.
  init(fileManager: FileManager = .default, root: URL? = nil,
       beforeCommit: (() throws -> Void)? = nil, afterPublish: (() throws -> Void)? = nil) {
    self.fileManager = fileManager
    self.rootOverride = root
    self.beforeCommit = beforeCommit
    self.afterPublish = afterPublish
  }

  static func isValidIdentifier(_ value: String) -> Bool {
    UUID(uuidString: value) != nil && value == value.lowercased()
  }

  private func locked<T>(_ operation: () throws -> T) rethrows -> T {
    Self.lock.lock()
    defer { Self.lock.unlock() }
    return try operation()
  }

  func readState() throws -> PrescriptionDocumentState {
    try locked {
      let url = try stateFileURL()
      guard fileManager.fileExists(atPath: url.path) else {
        return PrescriptionDocumentState()
      }
      let data = try Data(contentsOf: url)
      guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        throw PrescriptionDocumentStorageError.invalidState
      }
      let state: PrescriptionDocumentState
      if object["version"] != nil {
        // Never fall back to legacy decoding for corrupt/unknown versioned state.
        state = try JSONDecoder().decode(PrescriptionDocumentState.self, from: data)
      } else {
        guard Set(object.keys).isSubset(of: ["current", "pendingCleanup"]) else {
          throw PrescriptionDocumentStorageError.invalidState
        }
        let legacy = try JSONDecoder().decode(LegacyPrescriptionState.self, from: data)
        guard legacy.current != nil || legacy.pendingCleanup == nil else {
          throw PrescriptionDocumentStorageError.invalidState
        }
        state = PrescriptionDocumentState(
          pendingCleanup: legacy.pendingCleanup.map { [$0] } ?? [],
          legacyDocumentId: legacy.current
        )
      }
      try state.validate()
      return state
    }
  }

  private func writeState(_ state: PrescriptionDocumentState) throws {
    try state.validate()
    let target = try stateFileURL()
    let staged = target.deletingLastPathComponent().appendingPathComponent("state.next")
    // Never modify the committed state or legacy document while preparing metadata.
    // A leftover stage after termination is ignored; only state.json is authoritative.
    do {
      let data = try JSONEncoder().encode(state)
      #if os(iOS)
      try data.write(to: staged, options: [.atomic, .completeFileProtection])
      #else
      try data.write(to: staged, options: [.atomic])
      #endif
      try protect(staged)
      let handle = try FileHandle(forWritingTo: staged)
      defer { try? handle.close() }
      try handle.synchronize()
      try beforeCommit?()
      // Same-directory rename publishes the whole transaction atomically.
      guard Darwin.rename(staged.path, target.path) == 0 else {
        throw PrescriptionDocumentStorageError.commitFailed
      }
      do {
        try afterPublish?()
        try synchronizeDirectory(target.deletingLastPathComponent())
      } catch {
        // Publication happened: never claim rollback or delete the newly referenced copy.
        throw PrescriptionDocumentStorageError.commitUncertain
      }
    } catch {
      try? fileManager.removeItem(at: staged)
      throw error
    }
  }

  func migrateLegacy(_ document: String, metadata: PrescriptionMetadata) throws -> PrescriptionRecord {
    try locked {
      try metadata.validate()
      var state = try readState()
      // A lost response/restart is resolved from persisted state, never an in-memory flag.
      if state.legacyDocumentId == nil {
        guard let migrated = state.records.first(where: { $0.documentId == document }),
              migrated.metadata == metadata else {
          throw PrescriptionDocumentStorageError.staleRecord
        }
        try synchronizeDirectory(documentsDirectory())
        return migrated
      }
      guard state.legacyDocumentId == document else {
        throw PrescriptionDocumentStorageError.staleRecord
      }
      guard state.pendingCleanup.isEmpty else {
        throw PrescriptionDocumentStorageError.cleanupPending
      }
      _ = try documentURL(for: document)
      let record = PrescriptionRecord(id: freshId(), documentId: document, metadata: metadata)
      state.records = [record]
      state.legacyDocumentId = nil
      try writeState(state)
      // The document is neither copied, moved, modified nor removed by migration.
      return record
    }
  }

  private func writableState(expected: PrescriptionRecord? = nil) throws -> PrescriptionDocumentState {
    let state = try readState()
    guard state.legacyDocumentId == nil else {
      throw PrescriptionDocumentStorageError.migrationRequired
    }
    guard state.pendingCleanup.isEmpty else {
      throw PrescriptionDocumentStorageError.cleanupPending
    }
    if let expected {
      try expected.validate()
      guard state.records.contains(expected) else {
        throw PrescriptionDocumentStorageError.staleRecord
      }
    }
    return state
  }

  func create(_ candidate: String, metadata: PrescriptionMetadata) throws -> PrescriptionRecord {
    try locked {
      try metadata.validate()
      var state = try writableState()
      return try commitCandidate(candidate) { document in
        let record = PrescriptionRecord(id: freshId(), documentId: document, metadata: metadata)
        state.records.append(record)
        try writeState(state)
        return record
      }
    }
  }

  func replace(_ candidate: String, expected: PrescriptionRecord) throws -> PrescriptionRecord {
    try locked {
      var state = try writableState(expected: expected)
      return try commitCandidate(candidate) { document in
        let record = PrescriptionRecord(id: expected.id, documentId: document, metadata: expected.metadata)
        state.records = state.records.map { $0.id == expected.id ? record : $0 }
        state.pendingCleanup.append(expected.documentId)
        try writeState(state)
        return record
      }
    }
  }

  func updateMetadata(_ expected: PrescriptionRecord, metadata: PrescriptionMetadata) throws -> PrescriptionRecord {
    try locked {
      try metadata.validate()
      var state = try writableState(expected: expected)
      let record = PrescriptionRecord(id: expected.id, documentId: expected.documentId, metadata: metadata)
      state.records = state.records.map { $0.id == expected.id ? record : $0 }
      try writeState(state)
      return record
    }
  }

  func remove(_ expected: PrescriptionRecord) throws {
    try locked {
      var state = try writableState(expected: expected)
      state.records.removeAll { $0.id == expected.id }
      state.pendingCleanup.append(expected.documentId)
      try writeState(state)
    }
  }

  func cleanup() throws {
    try locked {
      var state = try readState()
      // Make the committed rename durable before removing any journalled copy.
      try synchronizeDirectory(documentsDirectory())
      // Remove only journalled, unreferenced app-owned copies. Persist each success.
      for document in state.pendingCleanup {
        guard !state.retains(document) else {
          throw PrescriptionDocumentStorageError.invalidState
        }
        try removeIfPresent(documentContainerURL(for: document))
        state.pendingCleanup.removeAll { $0 == document }
        try writeState(state)
      }
    }
  }

  func retainedDocumentURL(for identifier: String) throws -> URL {
    try locked {
      guard try readState().retains(identifier) else {
        throw PrescriptionDocumentStorageError.documentMissing
      }
      return try documentURL(for: identifier)
    }
  }

  func importCandidate(from sourceURL: URL) throws -> String {
    try locked {
      let values = try sourceURL.resourceValues(forKeys: [.isRegularFileKey, .contentTypeKey])
      guard values.isRegularFile == true, let type = values.contentType else {
        throw PrescriptionDocumentStorageError.unsupportedDocument
      }
      let ext: String
      if type.conforms(to: .pdf) { ext = "pdf" }
      else if type.conforms(to: .jpeg) { ext = "jpg" }
      else if type.conforms(to: .png) { ext = "png" }
      else { throw PrescriptionDocumentStorageError.unsupportedDocument }
      let identifier = freshId()
      let container = try candidateContainerURL(for: identifier)
      do {
        try createDirectory(container)
        let destination = container.appendingPathComponent("document." + ext)
        try fileManager.copyItem(at: sourceURL, to: destination)
        try protect(destination)
        return identifier
      } catch {
        try? removeIfPresent(container)
        throw error
      }
    }
  }

  private func commitCandidate(_ candidate: String,
                               commit: (String) throws -> PrescriptionRecord) throws -> PrescriptionRecord {
    let source = try candidateContainerURL(for: candidate)
    var isDirectory: ObjCBool = false
    guard fileManager.fileExists(atPath: source.path, isDirectory: &isDirectory), isDirectory.boolValue else {
      throw PrescriptionDocumentStorageError.candidateMissing
    }
    let identifier = freshId()
    let destination = try documentContainerURL(for: identifier)
    do {
      try fileManager.copyItem(at: source, to: destination)
      let document = try documentURL(for: identifier)
      try protect(destination)
      try protect(document)
      let handle = try FileHandle(forWritingTo: document)
      defer { try? handle.close() }
      try handle.synchronize()
      try synchronizeDirectory(destination)
      try synchronizeDirectory(destination.deletingLastPathComponent())
      return try commit(identifier)
    } catch {
      // An uncertain publication or unreadable state must preserve the new copy.
      // Recovery can remove it later only if committed state proves it unreferenced.
      if let state = try? readState(),
         !state.retains(identifier), !state.pendingCleanup.contains(identifier) {
        try? removeIfPresent(destination)
      }
      throw error
    }
  }

  func release(_ candidate: String) throws {
    try locked { try removeIfPresent(candidateContainerURL(for: candidate)) }
  }

  func recoverOrphans() throws {
    try locked {
      let state = try readState() // Corrupt/locked state must prevent document cleanup.
      try synchronizeDirectory(documentsDirectory())
      let retained = Set(state.records.map { $0.documentId }
        + state.pendingCleanup + (state.legacyDocumentId.map { [$0] } ?? []))
      for directory in [try containers("documents"), try containers("candidates")] {
        for item in try fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
          let identifier = item.lastPathComponent
          guard Self.isValidIdentifier(identifier) else { continue }
          if directory.lastPathComponent == "documents" && retained.contains(identifier) { continue }
          try fileManager.removeItem(at: item)
        }
      }
    }
  }

  private func freshId() -> String { UUID().uuidString.lowercased() }

  private func synchronizeDirectory(_ url: URL) throws {
    let descriptor = Darwin.open(url.path, O_RDONLY)
    guard descriptor >= 0 else { throw PrescriptionDocumentStorageError.commitFailed }
    defer { _ = Darwin.close(descriptor) }
    guard Darwin.fsync(descriptor) == 0 else {
      throw PrescriptionDocumentStorageError.commitFailed
    }
  }

  private func documentsDirectory() throws -> URL {
    let directory: URL
    if let rootOverride { directory = rootOverride }
    else {
      directory = try fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                      appropriateFor: nil, create: true)
        .appendingPathComponent("PrescriptionDocuments", isDirectory: true)
    }
    try createDirectory(directory)
    return directory
  }

  private func containers(_ name: String) throws -> URL {
    let directory = try documentsDirectory().appendingPathComponent(name, isDirectory: true)
    try createDirectory(directory)
    return directory
  }

  private func documentContainerURL(for identifier: String) throws -> URL {
    guard Self.isValidIdentifier(identifier) else { throw PrescriptionDocumentStorageError.invalidIdentifier }
    return try containers("documents").appendingPathComponent(identifier, isDirectory: true)
  }

  private func candidateContainerURL(for identifier: String) throws -> URL {
    guard Self.isValidIdentifier(identifier) else { throw PrescriptionDocumentStorageError.invalidIdentifier }
    return try containers("candidates").appendingPathComponent(identifier, isDirectory: true)
  }

  private func documentURL(for identifier: String) throws -> URL {
    let container = try documentContainerURL(for: identifier)
    for ext in ["pdf", "jpg", "png"] {
      let document = container.appendingPathComponent("document." + ext)
      if fileManager.fileExists(atPath: document.path) { return document }
    }
    throw PrescriptionDocumentStorageError.documentMissing
  }

  private func stateFileURL() throws -> URL {
    try documentsDirectory().appendingPathComponent("state.json")
  }

  private func removeIfPresent(_ url: URL) throws {
    if fileManager.fileExists(atPath: url.path) { try fileManager.removeItem(at: url) }
  }

  private func createDirectory(_ url: URL) throws {
    if !fileManager.fileExists(atPath: url.path) {
      #if os(iOS)
      try fileManager.createDirectory(at: url, withIntermediateDirectories: true,
                                      attributes: [.protectionKey: FileProtectionType.complete])
      #else
      try fileManager.createDirectory(at: url, withIntermediateDirectories: true)
      #endif
    }
    try protect(url)
  }

  private func protect(_ url: URL) throws {
    #if os(iOS)
    try fileManager.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
    #endif
    var url = url
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try url.setResourceValues(values)
  }
}
