import Foundation
import React

@objc(PrescriptionDocuments)
final class PrescriptionDocuments: NSObject {

  private let storage = PrescriptionDocumentStorage()

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
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    rejectNotImplemented(reject)
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
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    rejectNotImplemented(reject)
  }
}
