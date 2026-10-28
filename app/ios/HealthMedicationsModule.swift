import HealthKit
import React
import UIKit

// This bridge has no relationship to local medication storage or dose events.
// All operations and the process-wide busy gate are owned by the main queue.
@objc(HealthMedications)
final class HealthMedicationsModule: NSObject {
  private static let reader = HealthMedicationsReader()
  @objc static func requiresMainQueueSetup() -> Bool { false }
  @objc var methodQueue: DispatchQueue { DispatchQueue.main }
  @objc func constantsToExport() -> [AnyHashable: Any] {
    ["appDisplayName": Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
      ?? Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String
      ?? "this app (use its name from the Home Screen)"]
  }

  @objc(requestAccess:rejecter:)
  func requestAccess(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
    Self.reader.request(resolve, reject)
  }

  @objc(readMedications:rejecter:)
  func readMedications(_ resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
    Self.reader.read(resolve, reject)
  }
}

private final class HealthMedicationsReader {
  private lazy var store = HKHealthStore()
  private var busy = false

  private func fail(_ code: String, _ reject: RCTPromiseRejectBlock) {
    // Never send HealthKit errors, identifiers or content to logs / error reports.
    reject(code, "The Apple Health operation could not be completed.", nil)
  }

  private func begin(_ reject: RCTPromiseRejectBlock) -> Bool {
    guard #available(iOS 26.0, *), HKHealthStore.isHealthDataAvailable() else {
      fail("health-unavailable", reject); return false
    }
    guard !busy else { fail("health-busy", reject); return false }
    guard UIApplication.shared.applicationState == .active else {
      fail("health-inactive", reject); return false
    }
    busy = true
    return true
  }

  func request(_ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock) {
    guard begin(reject) else { return }
    guard #available(iOS 26.0, *) else { busy = false; return }
    let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }.flatMap { $0.windows }.filter { $0.isKeyWindow }
    guard windows.count == 1, let root = windows.first?.rootViewController,
          ready(root, in: windows[0]) else {
      busy = false; fail("health-context", reject); return
    }
    // Direct, documented per-object request. HealthKit infers its presenter.
    // Explicit presenter selection was NOT a proven remedy in the diagnostic.
    // No timeout releases this gate: a UI timeout cannot cancel HealthKit.
    store.requestPerObjectReadAuthorization(for: HKObjectType.userAnnotatedMedicationType(), predicate: nil) { success, error in
      DispatchQueue.main.async {
        self.busy = false
        if error != nil || !success { self.fail("health-request-failed", reject) }
        else { resolve(NSNull()) } // Completion is not consent or proof of read access.
      }
    }
  }

  private func ready(_ controller: UIViewController, in window: UIWindow) -> Bool {
    guard controller.viewIfLoaded?.window === window,
          !controller.isBeingPresented, !controller.isBeingDismissed,
          controller.transitionCoordinator == nil else { return false }
    if let presented = controller.presentedViewController { return ready(presented, in: window) }
    if let navigation = controller as? UINavigationController, let visible = navigation.visibleViewController {
      return ready(visible, in: window)
    }
    if let tabs = controller as? UITabBarController, let selected = tabs.selectedViewController {
      return ready(selected, in: window)
    }
    return true
  }

  func read(_ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock) {
    guard begin(reject) else { return }
    guard #available(iOS 26.0, *) else { busy = false; return }
    Task { @MainActor in
      defer { busy = false }
      do {
        let objects = try await HKUserAnnotatedMedicationQueryDescriptor(predicate: nil, limit: nil).result(for: store)
        // Only display fields cross the bridge; no concept references or local record IDs.
        resolve(objects.map { item -> [String: Any] in
          var row: [String: Any] = ["name": item.medication.displayText, "isArchived": item.isArchived]
          if let nickname = item.nickname { row["nickname"] = nickname }
          return row
        })
      } catch { fail("health-read-failed", reject) }
    }
  }
}
