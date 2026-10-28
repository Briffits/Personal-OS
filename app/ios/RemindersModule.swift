import React
import UIKit

@objc(Reminders)
final class RemindersModule: NSObject {
  private lazy var reader = RemindersReader(
    store: EventKitRemindersStore(),
    isActive: { UIApplication.shared.applicationState == .active })

  @objc static func requiresMainQueueSetup() -> Bool { false }
  @objc var methodQueue: DispatchQueue { DispatchQueue.main }

  private func finish<T>(_ result: Result<T, RemindersFailure>,
                         _ resolve: RCTPromiseResolveBlock, _ reject: RCTPromiseRejectBlock) {
    switch result {
    case .success(let value): resolve(value)
    case .failure(let error): reject(error.rawValue, "The Reminders operation could not be completed.", nil)
    }
  }

  @objc(getAuthorizationStatus:rejecter:)
  func getAuthorizationStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(reader.getAuthorizationStatus().rawValue)
  }

  @objc(requestAccess:rejecter:)
  func requestAccess(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
    reader.requestAccess { self.finish($0.map { $0.rawValue }, resolve, reject) }
  }

  @objc(fetchDueToday:rejecter:)
  func fetchDueToday(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
    reader.fetchDueToday { self.finish($0, resolve, reject) }
  }
}
