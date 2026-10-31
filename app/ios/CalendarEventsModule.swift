import React
import UIKit

@objc(CalendarEvents)
final class CalendarEventsModule: NSObject {
  // One coordinator/store gate across bridge/module lifetimes. Creation is lazy
  // and does not create an EKEventStore or inspect events.
  private static let reader = CalendarReader(
    store: EventKitCalendarStore(),
    isActive: { UIApplication.shared.applicationState == .active })

  @objc static func requiresMainQueueSetup() -> Bool { false }
  @objc var methodQueue: DispatchQueue { DispatchQueue.main }

  private func finish<T>(_ result: Result<T, CalendarFailure>,
                         _ resolve: RCTPromiseResolveBlock, _ reject: RCTPromiseRejectBlock) {
    switch result {
    case .success(let value): resolve(value)
    case .failure(let error): reject(error.rawValue, "The Calendar operation could not be completed.", nil)
    }
  }

  @objc(getAuthorizationStatus:rejecter:)
  func getAuthorizationStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(Self.reader.getAuthorizationStatus().rawValue)
  }

  @objc(requestAccess:rejecter:)
  func requestAccess(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
    Self.reader.requestAccess { self.finish($0.map { $0.rawValue }, resolve, reject) }
  }

  @objc(fetchToday:rejecter:)
  func fetchToday(_ resolve: @escaping RCTPromiseResolveBlock,
                  rejecter reject: @escaping RCTPromiseRejectBlock) {
    Self.reader.fetchToday { self.finish($0, resolve, reject) }
  }
}
