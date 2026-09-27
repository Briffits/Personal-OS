import Foundation
import React

@objc(PrescriptionDocuments)
final class PrescriptionDocuments: NSObject {

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
    rejectNotImplemented(reject)
  }

  @objc(read:rejecter:)
  func read(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    rejectNotImplemented(reject)
  }

  @objc(cleanup:rejecter:)
  func cleanup(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    rejectNotImplemented(reject)
  }

  @objc(release:resolver:rejecter:)
  func release(
    _ candidate: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    rejectNotImplemented(reject)
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
