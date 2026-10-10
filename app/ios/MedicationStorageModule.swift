import Foundation
import React

@objc(MedicationStorage)
final class MedicationStorageModule: NSObject {
  private let storage = MedicationCollectionStorage(keychain: MedicationKeychain())
  private let queue = DispatchQueue(label: "com.personalos.medication-storage")

  @objc static func requiresMainQueueSetup() -> Bool { false }

  private func perform(_ resolve: @escaping RCTPromiseResolveBlock,
                       _ reject: @escaping RCTPromiseRejectBlock,
                       operation: @escaping () throws -> MedicationCollection) {
    queue.async {
      do { resolve(try operation().payload) }
      catch let error as MedicationStorageError {
        reject(error.rawValue, "The medication operation could not be completed.", nil)
      } catch {
        reject("operation-failed", "The medication operation could not be completed.", nil)
      }
    }
  }

  @objc(read:rejecter:)
  func read(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    perform(resolve, reject) { try self.storage.read() }
  }

  @objc(mutate:command:resolver:rejecter:)
  func mutate(_ revision: NSNumber, command: NSDictionary,
              resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    perform(resolve, reject) {
      guard let command = command as? [String: Any] else { throw MedicationStorageError.invalidInput }
      return try self.storage.mutate(revision: MedicationCollectionStorage.count(revision), command: command)
    }
  }
}
