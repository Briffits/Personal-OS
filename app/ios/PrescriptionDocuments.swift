import Foundation
import React
import UIKit
import UniformTypeIdentifiers
import QuickLook

@objc(PrescriptionDocuments)
final class PrescriptionDocuments: NSObject, UIDocumentPickerDelegate, QLPreviewControllerDataSource {

  private let storage = PrescriptionDocumentStorage()
  private var previewURL: URL?
  private var pendingSelectResolve: RCTPromiseResolveBlock?
  private var pendingSelectReject: RCTPromiseRejectBlock?
  override init() {
    super.init()

    do {
      try storage.cleanupOrphanedCandidates()
    } catch {
      // Keep the module usable. A future module initialization will retry orphan cleanup.
    }

    do {
      try storage.cleanupOrphanedDocuments()
    } catch {
      // Keep the module usable. A future module initialization will retry orphan cleanup.
    }
  }
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  private func rejectNotImplemented(_ reject: RCTPromiseRejectBlock) {
    reject(
      "prescription_documents_not_implemented",
      "Prescription document handling is not implemented yet.",
      nil
    )
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

  @objc(commit:resolver:rejecter:)
  func commit(
    _ candidate: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    do {
      let current = try storage.commitCandidate(candidate)
      resolve(current)
    } catch PrescriptionDocumentStorageError.cleanupPending {
      reject(
        "prescription_documents_cleanup_pending",
        "Prescription document cleanup must complete before another import.",
        nil
      )
    } catch PrescriptionDocumentStorageError.candidateMissing {
      reject(
        "prescription_documents_candidate_missing",
        "The temporary prescription document is no longer available.",
        nil
      )
    } catch {
      reject(
        "prescription_documents_commit_failed",
        "Unable to save the prescription document.",
        nil
      )
    }
  }

  @objc(read:rejecter:)
  func read(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    do {
      let state = try storage.readState()

      let payload: [String: Any] = [
        "current": state.current.map { $0 as Any } ?? NSNull(),
        "pendingCleanup": state.pendingCleanup.map { $0 as Any } ?? NSNull(),
      ]

      resolve(payload)
    } catch {
      reject(
        "prescription_documents_read_failed",
        "Unable to read prescription document state.",
        nil
      )
    }
  }

  @objc(cleanup:rejecter:)
  func cleanup(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    do {
      let state = try storage.readState()

      guard let pendingCleanup = state.pendingCleanup else {
        resolve(nil)
        return
      }

      try storage.removeDocumentContainer(for: pendingCleanup)

      let cleanedState = PrescriptionDocumentState(
        current: state.current,
        pendingCleanup: nil
      )

      try storage.writeState(cleanedState)

      resolve(nil)
    } catch {
      reject(
        "prescription_documents_cleanup_failed",
        "Unable to clean up the superseded prescription document.",
        nil
      )
    }
  }

  @objc(release:resolver:rejecter:)
  func release(
    _ candidate: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    do {
      try storage.removeCandidateContainer(for: candidate)
      resolve(nil)
    } catch {
      reject(
        "prescription_documents_release_failed",
        "Unable to release the temporary prescription document.",
        nil
      )
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
        let state = try self.storage.readState()

        guard state.current == current else {
          throw PrescriptionDocumentStorageError.documentMissing
        }

        let documentURL = try self.storage.documentURL(for: current)

        DispatchQueue.main.async {
          guard let presenter = self.presentingViewController() else {
            reject(
              "prescription_documents_open_failed",
              "Unable to open the prescription document.",
              nil
            )
            return
          }

          self.previewURL = documentURL

          let previewController = QLPreviewController()
          previewController.dataSource = self

          presenter.present(previewController, animated: true) {
            resolve(nil)
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
