import Foundation
import React

@objc(MedicationHealth)
final class MedicationHealthModule: NSObject {
  private let reader = MedicationHealthReader()
  @objc static func requiresMainQueueSetup() -> Bool { false }
  private func finish<T>(_ result: Result<T, MedicationHealthError>,
                         _ resolve: RCTPromiseResolveBlock, _ reject: RCTPromiseRejectBlock) {
    switch result {
    case .success(let value): resolve(value)
    case .failure(let error): reject(error.rawValue, "The Health medication operation could not be completed.", nil)
    }
  }
  @objc(availability:rejecter:)
  func availability(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(reader.availability())
  }
  @objc(requestMedicationAccess:rejecter:)
  func requestMedicationAccess(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      MedicationHealthAuthorization.shared.requestAccess { result in
        self.finish(result.map { NSNull() }, resolve, reject)
      }
    }
  }
  @objc(listMedications:rejecter:)
  func listMedications(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    reader.list { self.finish($0, resolve, reject) }
  }
  @objc(readDoseSnapshot:resolver:rejecter:)
  func readDoseSnapshot(_ request: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let baselineID = request["baselineId"] as? String,
          let uuid = UUID(uuidString: baselineID), uuid.uuidString.lowercased() == baselineID,
          let reference = request["conceptReference"] as? String,
          let from = request["from"] as? String, let through = request["through"] as? String else {
      reject("invalid-input", "The Health medication request is invalid.", nil); return
    }
    reader.snapshot(baselineID: baselineID, reference: reference, from: from, through: through) {
      self.finish($0, resolve, reject)
    }
  }
  @objc(validateConceptReference:resolver:rejecter:)
  func validateConceptReference(_ reference: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    identityOperation(resolve, reject) { try HealthMedicationIdentity.validate(reference); return true }
  }
  @objc(compareConceptReferences:right:resolver:rejecter:)
  func compareConceptReferences(_ left: String, right: String, resolver resolve: RCTPromiseResolveBlock,
                                rejecter reject: RCTPromiseRejectBlock) {
    identityOperation(resolve, reject) { try HealthMedicationIdentity.equal(left, right) }
  }
  private func identityOperation(_ resolve: RCTPromiseResolveBlock, _ reject: RCTPromiseRejectBlock,
                                 operation: () throws -> Bool) {
    do { resolve(try operation()) }
    catch let error as MedicationHealthError { finish(Result<Bool, MedicationHealthError>.failure(error), resolve, reject) }
    catch { reject("malformed-identity", "The Health medication reference is invalid.", nil) }
  }
}
