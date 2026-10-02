import Foundation
import UniformTypeIdentifiers
struct PrescriptionDocumentState: Codable, Equatable {
  let current: String?
  let pendingCleanup: String?

  static let empty = PrescriptionDocumentState(
    current: nil,
    pendingCleanup: nil
  )

  func validate() throws {
    if current == nil && pendingCleanup != nil {
      throw PrescriptionDocumentStorageError.invalidState
    }

    if let current, !PrescriptionDocumentStorage.isValidIdentifier(current) {
      throw PrescriptionDocumentStorageError.invalidState
    }

    if let pendingCleanup,
       !PrescriptionDocumentStorage.isValidIdentifier(pendingCleanup) {
      throw PrescriptionDocumentStorageError.invalidState
    }
  }
}

enum PrescriptionDocumentStorageError: Error {
    case invalidState
    case invalidIdentifier
    case candidateMissing
    case documentMissing
    case cleanupPending
    case unsupportedDocument
}

final class PrescriptionDocumentStorage {

  private static let directoryName = "PrescriptionDocuments"
  private static let stateFileName = "state.json"
  private static let documentContainersDirectoryName = "documents"
  private static let candidateContainersDirectoryName = "candidates"
  private let fileManager: FileManager

  init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
  }

  static func isValidIdentifier(_ value: String) -> Bool {
    value.rangeOfCharacter(from: .whitespacesAndNewlines.inverted) != nil
  }

  func readState() throws -> PrescriptionDocumentState {
    let stateURL = try stateFileURL()

    guard fileManager.fileExists(atPath: stateURL.path) else {
      return .empty
    }

    let data = try Data(contentsOf: stateURL)
    let state = try JSONDecoder().decode(
      PrescriptionDocumentState.self,
      from: data
    )

    try state.validate()
    return state
  }

  func writeState(_ state: PrescriptionDocumentState) throws {
    try state.validate()

    let stateURL = try stateFileURL()
    let data = try JSONEncoder().encode(state)

    try data.write(to: stateURL, options: [.atomic])
    try applyFileProtection(to: stateURL)
    try excludeFromBackup(stateURL)
  }

  func documentsDirectory() throws -> URL {
    let applicationSupport = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )

    let directory = applicationSupport
      .appendingPathComponent(Self.directoryName, isDirectory: true)

    if !fileManager.fileExists(atPath: directory.path) {
      try fileManager.createDirectory(
        at: directory,
        withIntermediateDirectories: true,
        attributes: [
          .protectionKey: FileProtectionType.complete,
        ]
      )
    }

    try applyFileProtection(to: directory)
    try excludeFromBackup(directory)

    return directory
  }
  func documentContainerURL(for identifier: String) throws -> URL {
    guard UUID(uuidString: identifier) != nil else {
      throw PrescriptionDocumentStorageError.invalidIdentifier
    }

    return try documentContainersDirectory()
      .appendingPathComponent(identifier, isDirectory: true)
  }
  func documentURL(for identifier: String) throws -> URL {
    let container = try documentContainerURL(for: identifier)

    let supportedFiles = [
      container.appendingPathComponent("document.pdf"),
      container.appendingPathComponent("document.jpg"),
      container.appendingPathComponent("document.png"),
    ]

    guard let document = supportedFiles.first(
      where: { fileManager.fileExists(atPath: $0.path) }
    ) else {
      throw PrescriptionDocumentStorageError.documentMissing
    }

    return document
  }
  func removeDocumentContainer(for identifier: String) throws {
    let container = try documentContainerURL(for: identifier)

    guard fileManager.fileExists(atPath: container.path) else {
      return
    }

    try fileManager.removeItem(at: container)
  }

  func candidateContainerURL(for identifier: String) throws -> URL {
    guard UUID(uuidString: identifier) != nil else {
      throw PrescriptionDocumentStorageError.invalidIdentifier
    }

    return try candidateContainersDirectory()
      .appendingPathComponent(identifier, isDirectory: true)
  }

  func removeCandidateContainer(for identifier: String) throws {
    let container = try candidateContainerURL(for: identifier)

    guard fileManager.fileExists(atPath: container.path) else {
      return
    }

    try fileManager.removeItem(at: container)
  }

  func importCandidate(from sourceURL: URL) throws -> String {
    let resourceValues = try sourceURL.resourceValues(
      forKeys: [.isRegularFileKey, .contentTypeKey]
    )

    guard resourceValues.isRegularFile == true,
          let contentType = resourceValues.contentType else {
      throw PrescriptionDocumentStorageError.unsupportedDocument
    }

    let fileExtension: String

    if contentType.conforms(to: .pdf) {
      fileExtension = "pdf"
    } else if contentType.conforms(to: .jpeg) {
      fileExtension = "jpg"
    } else if contentType.conforms(to: .png) {
      fileExtension = "png"
    } else {
      throw PrescriptionDocumentStorageError.unsupportedDocument
    }

    let candidateIdentifier = UUID().uuidString.lowercased()
    let container = try candidateContainerURL(for: candidateIdentifier)

    do {
      try fileManager.createDirectory(
        at: container,
        withIntermediateDirectories: false,
        attributes: [
          .protectionKey: FileProtectionType.complete,
        ]
      )

      let destination = container
        .appendingPathComponent("document", isDirectory: false)
        .appendingPathExtension(fileExtension)

      try fileManager.copyItem(
        at: sourceURL,
        to: destination
      )

      try applyFileProtection(to: container)
      try applyFileProtection(to: destination)
      try excludeFromBackup(container)
      try excludeFromBackup(destination)

      return candidateIdentifier
    } catch {
      if fileManager.fileExists(atPath: container.path) {
        try? fileManager.removeItem(at: container)
      }

      throw error
    }
  }
  func commitCandidate(_ candidateIdentifier: String) throws -> String {
    let state = try readState()

    guard state.pendingCleanup == nil else {
      throw PrescriptionDocumentStorageError.cleanupPending
    }

    let candidate = try candidateContainerURL(for: candidateIdentifier)

    var isDirectory: ObjCBool = false
    guard fileManager.fileExists(
      atPath: candidate.path,
      isDirectory: &isDirectory
    ),
    isDirectory.boolValue else {
      throw PrescriptionDocumentStorageError.candidateMissing
    }

    let newIdentifier = UUID().uuidString.lowercased()
    let destination = try documentContainerURL(for: newIdentifier)

    do {
      try fileManager.copyItem(at: candidate, to: destination)
      try applyFileProtection(to: destination)
      try excludeFromBackup(destination)

      let committedState = PrescriptionDocumentState(
        current: newIdentifier,
        pendingCleanup: state.current
      )

      try writeState(committedState)

      return newIdentifier
    } catch {
      if fileManager.fileExists(atPath: destination.path) {
        try? fileManager.removeItem(at: destination)
      }

      throw error
    }
  }

  private func documentContainersDirectory() throws -> URL {
    let directory = try documentsDirectory()
      .appendingPathComponent(
        Self.documentContainersDirectoryName,
        isDirectory: true
      )

    if !fileManager.fileExists(atPath: directory.path) {
      try fileManager.createDirectory(
        at: directory,
        withIntermediateDirectories: true,
        attributes: [
          .protectionKey: FileProtectionType.complete,
        ]
      )
    }

    try applyFileProtection(to: directory)
    try excludeFromBackup(directory)

    return directory
  }

  private func candidateContainersDirectory() throws -> URL {
    let directory = try documentsDirectory()
      .appendingPathComponent(
        Self.candidateContainersDirectoryName,
        isDirectory: true
      )

    if !fileManager.fileExists(atPath: directory.path) {
      try fileManager.createDirectory(
        at: directory,
        withIntermediateDirectories: true,
        attributes: [
          .protectionKey: FileProtectionType.complete,
        ]
      )
    }

    try applyFileProtection(to: directory)
    try excludeFromBackup(directory)

    return directory
  }
  private func stateFileURL() throws -> URL {
    try documentsDirectory()
      .appendingPathComponent(Self.stateFileName, isDirectory: false)
  }

  private func applyFileProtection(to url: URL) throws {
    try fileManager.setAttributes(
      [.protectionKey: FileProtectionType.complete],
      ofItemAtPath: url.path
    )
  }

  private func excludeFromBackup(_ url: URL) throws {
    var url = url
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try url.setResourceValues(values)
  }
}
