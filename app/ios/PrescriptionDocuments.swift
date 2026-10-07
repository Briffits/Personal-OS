import Foundation
import React
import UIKit
import UniformTypeIdentifiers
import QuickLook
import LocalAuthentication

@objc(PrescriptionDocuments)
final class PrescriptionDocuments: NSObject, UIDocumentPickerDelegate, QLPreviewControllerDataSource {

  private let storage = PrescriptionDocumentStorage()
  private var previewURL: URL?
  private var pendingSelectResolve: RCTPromiseResolveBlock?
  private var pendingSelectReject: RCTPromiseRejectBlock?
  override init() {
    super.init()

    do {
      try storage.recoverOrphans()
    } catch {
      // Fail closed: unreadable state must not cause retained documents to be removed.
      // Recovery is retried on the next module initialization.
    }
  }
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(select:rejecter:)
  func select(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        reject(
          "prescription_documents_select_failed",
          "Unable to open the prescription document picker.",
          nil
        )
        return
      }

      guard self.pendingSelectResolve == nil else {
        reject(
          "prescription_documents_selection_busy",
          "A prescription document selection is already in progress.",
          nil
        )
        return
      }

      guard let presenter = self.presentingViewController() else {
        reject(
          "prescription_documents_select_failed",
          "Unable to open the prescription document picker.",
          nil
        )
        return
      }

      self.pendingSelectResolve = resolve
      self.pendingSelectReject = reject

      let picker = UIDocumentPickerViewController(
        forOpeningContentTypes: [.pdf, .jpeg, .png],
        asCopy: true
      )

      picker.delegate = self
      picker.allowsMultipleSelection = false

      presenter.present(picker, animated: true)
    }
  }

  private func decode<T: Decodable>(_ value: NSDictionary, as type: T.Type) throws -> T {
    try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: value))
  }

  private func perform(_ resolve: RCTPromiseResolveBlock, _ reject: RCTPromiseRejectBlock,
                       operation: () throws -> Any?) {
    do { resolve(try operation()) }
    catch PrescriptionDocumentStorageError.cleanupPending {
      reject("prescription_documents_cleanup_pending", "Prescription cleanup must finish first.", nil)
    } catch PrescriptionDocumentStorageError.migrationRequired {
      reject("prescription_documents_migration_required", "Complete the saved prescription details first.", nil)
    } catch PrescriptionDocumentStorageError.staleRecord {
      reject("prescription_documents_stale_record", "This prescription has changed. Reload and try again.", nil)
    } catch PrescriptionDocumentStorageError.commitUncertain {
      reject("prescription_documents_commit_uncertain", "The prescription change needs to be checked. Reload the wallet.", nil)
    } catch {
      reject("prescription_documents_operation_failed", "The prescription operation could not be completed.", nil)
    }
  }

  @objc(read:rejecter:)
  func read(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) {
      let state = try storage.readState()
      return [
        "records": try state.records.map { try $0.bridgePayload() },
        "pendingCleanup": state.pendingCleanup,
        "legacyDocumentId": state.legacyDocumentId.map { $0 as Any } ?? NSNull(),
      ] as [String: Any]
    }
  }

  @objc(create:metadata:resolver:rejecter:)
  func create(_ candidate: String, metadata: NSDictionary,
              resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) {
      try storage.create(candidate, metadata: decode(metadata, as: PrescriptionMetadata.self)).bridgePayload()
    }
  }

  @objc(replace:expected:resolver:rejecter:)
  func replace(_ candidate: String, expected: NSDictionary,
               resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) {
      try storage.replace(candidate, expected: decode(expected, as: PrescriptionRecord.self)).bridgePayload()
    }
  }

  @objc(updateMetadata:metadata:resolver:rejecter:)
  func updateMetadata(_ expected: NSDictionary, metadata: NSDictionary,
                      resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) {
      try storage.updateMetadata(decode(expected, as: PrescriptionRecord.self),
                                 metadata: decode(metadata, as: PrescriptionMetadata.self)).bridgePayload()
    }
  }

  @objc(remove:resolver:rejecter:)
  func remove(_ expected: NSDictionary, resolver resolve: RCTPromiseResolveBlock,
              rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) {
      try storage.remove(decode(expected, as: PrescriptionRecord.self))
      return nil
    }
  }

  @objc(migrateLegacy:metadata:resolver:rejecter:)
  func migrateLegacy(_ document: String, metadata: NSDictionary,
                     resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) {
      try storage.migrateLegacy(document, metadata: decode(metadata, as: PrescriptionMetadata.self)).bridgePayload()
    }
  }

  @objc(cleanup:rejecter:)
  func cleanup(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) { try storage.cleanup(); return nil }
  }

  @objc(release:resolver:rejecter:)
  func release(_ candidate: String, resolver resolve: RCTPromiseResolveBlock,
               rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) { try storage.release(candidate); return nil }
  }
  private enum PrescriptionAuthenticationResult {
    case authenticated
    case cancelled
    case failed
  }
  private func authenticateForPrescription(
    completion: @escaping (PrescriptionAuthenticationResult) -> Void
  ) {
    let context = LAContext()
    context.localizedCancelTitle = "Cancel"

    var authenticationError: NSError?

    guard context.canEvaluatePolicy(
      .deviceOwnerAuthentication,
      error: &authenticationError
    ) else {
      completion(.failed)
      return
    }

    context.evaluatePolicy(
      .deviceOwnerAuthentication,
      localizedReason: "Unlock your stored prescription."
    ) { success, error in
      if success {
        completion(.authenticated)
        return
      }

      if let localAuthenticationError = error as? LAError {
        switch localAuthenticationError.code {
        case .userCancel, .appCancel, .systemCancel:
          completion(.cancelled)
        default:
          completion(.failed)
        }
        return
      }

      completion(.failed)
    }
  }
  @objc(open:resolver:rejecter:)
  func open(
    _ current: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else {
        DispatchQueue.main.async {
          reject(
            "prescription_documents_open_failed",
            "Unable to open the prescription document.",
            nil
          )
        }
        return
      }

      do {
        _ = try self.storage.retainedDocumentURL(for: current)

        self.authenticateForPrescription { authenticationResult in
          switch authenticationResult {
          case .cancelled:
            DispatchQueue.main.async {
              reject(
                "prescription_documents_authentication_cancelled",
                "Prescription authentication was cancelled.",
                nil
              )
            }

          case .failed:
            DispatchQueue.main.async {
              reject(
                "prescription_documents_authentication_failed",
                "Authentication is required to view the prescription document.",
                nil
              )
            }

          case .authenticated:
            DispatchQueue.main.async {
              guard let presenter = self.presentingViewController() else {
                reject(
                  "prescription_documents_open_failed",
                  "Unable to open the prescription document.",
                  nil
                )
                return
              }

              // Authentication may outlive a replacement/deletion. Recheck membership
              // before presenting; the same gate also protects the pending legacy item.
              do {
                self.previewURL = try self.storage.retainedDocumentURL(for: current)
              } catch {
                reject("prescription_documents_open_failed", "Unable to open the prescription document.", nil)
                return
              }

              let previewController = QLPreviewController()
              previewController.dataSource = self

              presenter.present(previewController, animated: true) {
                resolve(nil)
              }
            }
          }
        }
      } catch {
        DispatchQueue.main.async {
          reject(
            "prescription_documents_open_failed",
            "Unable to open the prescription document.",
            nil
          )
        }
      }
    }
  }
  func numberOfPreviewItems(
    in controller: QLPreviewController
  ) -> Int {
    previewURL == nil ? 0 : 1
  }

  func previewController(
    _ controller: QLPreviewController,
    previewItemAt index: Int
  ) -> QLPreviewItem {
    guard index == 0, let previewURL else {
      preconditionFailure("Quick Look requested an unavailable prescription document.")
    }

    return previewURL as NSURL
  }
  func documentPicker(
    _ controller: UIDocumentPickerViewController,
    didPickDocumentsAt urls: [URL]
  ) {
    guard let sourceURL = urls.first else {
      finishSelection(with: nil)
      return
    }

    let accessed = sourceURL.startAccessingSecurityScopedResource()

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      defer {
        if accessed {
          sourceURL.stopAccessingSecurityScopedResource()
        }
      }

      guard let self else {
        return
      }

      do {
        let candidate = try self.storage.importCandidate(from: sourceURL)

        DispatchQueue.main.async {
          self.finishSelection(with: candidate)
        }
      } catch PrescriptionDocumentStorageError.unsupportedDocument {
        DispatchQueue.main.async {
          self.failSelection(
            code: "prescription_documents_unsupported_document",
            message: "Only PDF, JPEG and PNG prescription documents are supported."
          )
        }
      } catch {
        DispatchQueue.main.async {
          self.failSelection(
            code: "prescription_documents_select_failed",
            message: "Unable to import the selected prescription document."
          )
        }
      }
    }
  }

  func documentPickerWasCancelled(
    _ controller: UIDocumentPickerViewController
  ) {
    finishSelection(with: nil)
  }

  private func finishSelection(with candidate: String?) {
    let resolve = pendingSelectResolve

    pendingSelectResolve = nil
    pendingSelectReject = nil

    resolve?(candidate ?? NSNull())
  }

  private func failSelection(
    code: String,
    message: String
  ) {
    let reject = pendingSelectReject

    pendingSelectResolve = nil
    pendingSelectReject = nil

    reject?(code, message, nil)
  }

  private func presentingViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }

    guard let window = scenes
      .flatMap({ $0.windows })
      .first(where: { $0.isKeyWindow }) else {
      return nil
    }

    var presenter = window.rootViewController

    while let presented = presenter?.presentedViewController {
      presenter = presented
    }

    return presenter
  }
}
