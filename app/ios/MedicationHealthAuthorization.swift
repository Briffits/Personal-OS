import Combine
import HealthKit
import HealthKitUI
import SwiftUI
import UIKit

// Presentation only. Queries and inventory mutations remain separate.
@MainActor
final class MedicationHealthAuthorization {
  static let shared = MedicationHealthAuthorization()
  private var host: UIViewController?
  private var finishing = false

  #if DEBUG && NATIVE_XCTEST
  enum HostRetentionArm: String { case immediate = "A", retained = "B" }

  private final class HostRetentionDiagnostic {
    let arm: HostRetentionArm
    let onCallback: (Result<Void, MedicationHealthError>) -> Void
    let onObservationEnded: (Bool) -> Void
    var callbackReceived = false
    var cleanupAllowed = false
    var observation: DispatchWorkItem?

    init(arm: HostRetentionArm,
         onCallback: @escaping (Result<Void, MedicationHealthError>) -> Void,
         onObservationEnded: @escaping (Bool) -> Void) {
      self.arm = arm
      self.onCallback = onCallback
      self.onObservationEnded = onObservationEnded
    }
  }
  private var hostRetentionDiagnostic: HostRetentionDiagnostic?
  var hasHostForDiagnostic: Bool { host != nil }

  // Only the explicitly opted-in native test can install this per-run hook.
  func beginHostRetentionDiagnostic(arm: HostRetentionArm,
                                    onCallback: @escaping (Result<Void, MedicationHealthError>) -> Void,
                                    onObservationEnded: @escaping (Bool) -> Void) -> Bool {
    let environment = ProcessInfo.processInfo.environment
    guard environment["PERSONALOS_AUTHORIZATION_SMOKE_TEST"] == "1",
          environment["PERSONALOS_AUTHORIZATION_HOST_RETENTION"] == arm.rawValue,
          host == nil, !finishing, hostRetentionDiagnostic == nil else { return false }
    hostRetentionDiagnostic = HostRetentionDiagnostic(arm: arm, onCallback: onCallback,
      onObservationEnded: onObservationEnded)
    Self.trace(arm == .immediate ? "comparison.armA" : "comparison.armB")
    return true
  }

  // XCTest teardown also uses this on timeout/failure. Invalidate late callbacks
  // and the timer before dismissing; never manufacture a Health callback result.
  func endHostRetentionDiagnostic(completion: @escaping () -> Void) {
    guard let diagnostic = hostRetentionDiagnostic else { completion(); return }
    diagnostic.observation?.cancel()
    hostRetentionDiagnostic = nil
    guard let controller = host else {
      Self.trace("comparison.cleanup.complete")
      completion()
      return
    }
    Self.trace("comparison.cleanup.fallback")
    let release = {
      if self.host === controller {
        self.host = nil
        self.finishing = false
      }
      Self.trace("comparison.cleanup.complete")
      completion()
    }
    if controller.presentingViewController == nil && !controller.isBeingPresented {
      release() // A detached host has nothing left for UIKit to dismiss.
    } else {
      controller.dismiss(animated: false, completion: release)
    }
  }

  private func deferDiagnosticCleanup(_ result: Result<Void, MedicationHealthError>,
                                      completion: @escaping (Result<Void, MedicationHealthError>) -> Void) -> Bool {
    guard let diagnostic = hostRetentionDiagnostic, !diagnostic.cleanupAllowed else { return false }
    guard !diagnostic.callbackReceived else {
      Self.trace("comparison.additionalCallback.ignored")
      return true // Log every result, but never restart the window or deliver twice.
    }
    guard let controller = host, !finishing else { return false }
    diagnostic.callbackReceived = true
    diagnostic.onCallback(result)
    let deadline = DispatchTime.now() + 10
    Self.trace("comparison.observation.begin")
    // A must not retain the controller through this timer's capture either.
    let observation = DispatchWorkItem { [weak self, weak diagnostic, weak controller] in
      guard let self, let diagnostic, self.hostRetentionDiagnostic === diagnostic else { return }
      let retained = controller != nil && self.host === controller
      Self.trace(retained ? "comparison.observation.end.hostRetained" : "comparison.observation.end.hostReleased")
      diagnostic.onObservationEnded(retained)
      if diagnostic.arm == .retained {
        diagnostic.cleanupAllowed = true
        self.finish(result, completion: completion)
      }
    }
    diagnostic.observation = observation
    DispatchQueue.main.asyncAfter(deadline: deadline, execute: observation)
    return diagnostic.arm == .retained
  }
  #endif

  func requestAccess(completion: @escaping (Result<Void, MedicationHealthError>) -> Void) {
    #if DEBUG && NATIVE_XCTEST
    Self.trace("request.enter")
    #endif
    guard #available(iOS 26.0, *), HKHealthStore.isHealthDataAvailable() else {
      #if DEBUG && NATIVE_XCTEST
      Self.trace("caller.deliver.unavailable")
      #endif
      completion(.failure(.unavailable)); return
    }
    // Never queue a prompt to appear later without the initiating user action.
    #if DEBUG && NATIVE_XCTEST
    // Each argument is evaluated once, in the original guard's short-circuit order.
    guard Self.traceCondition(host == nil, failure: "context.hostRetained"),
          let presenter = Self.foregroundPresenter(),
          Self.traceCondition(presenter.viewIfLoaded?.window != nil, failure: "context.presenterDetached"),
          Self.traceCondition(!presenter.isBeingPresented, failure: "context.presenterBeingPresented"),
          Self.traceCondition(!presenter.isBeingDismissed, failure: "context.presenterBeingDismissed"),
          Self.traceCondition(presenter.transitionCoordinator == nil, failure: "context.presenterTransition") else {
      Self.trace("caller.deliver.contextRejected")
      completion(.failure(.authorizationFailed)); return
    }
    #else
    guard host == nil, let presenter = Self.foregroundPresenter(),
          presenter.viewIfLoaded?.window != nil,
          !presenter.isBeingPresented, !presenter.isBeingDismissed,
          presenter.transitionCoordinator == nil else {
      completion(.failure(.authorizationFailed)); return
    }
    #endif
    let readiness = AuthorizationReadiness()
    #if DEBUG && NATIVE_XCTEST
    let requestDiagnostic = hostRetentionDiagnostic
    #endif
    let view = MedicationAuthorizationView(readiness: readiness) { result in
      DispatchQueue.main.async {
        #if DEBUG && NATIVE_XCTEST
        if let requestDiagnostic, self.hostRetentionDiagnostic !== requestDiagnostic {
          _ = Self.sanitized(result)
          Self.trace("comparison.lateCallback.ignored")
          return
        }
        #endif
        self.finish(Self.sanitized(result), completion: completion)
      }
    }
    let controller = UIHostingController(rootView: view)
    controller.view.backgroundColor = .clear
    controller.modalPresentationStyle = .overFullScreen
    controller.isModalInPresentation = true
    host = controller
    finishing = false
    // Change SwiftUI's State trigger only after UIKit finishes presentation.
    presenter.present(controller, animated: false) { readiness.ready = true }
  }

  nonisolated static func sanitized(_ result: Result<Bool, Error>) -> Result<Void, MedicationHealthError> {
    switch result {
    case .success(true):
      #if DEBUG && NATIVE_XCTEST
      Self.trace("result.successTrue")
      #endif
      return .success(()) // Flow completed, NOT read permission.
    case .success(false):
      #if DEBUG && NATIVE_XCTEST
      Self.trace("result.successFalse")
      #endif
      return .failure(.authorizationFailed)
    case .failure(let error):
      #if DEBUG && NATIVE_XCTEST
      if let healthError = error as? HKError {
        let code = healthError.code
        if code == .errorUserCanceled {
          Self.trace("result.cancelled", healthErrorCode: code.rawValue)
          return .failure(.authorizationCancelled)
        }
        Self.trace("result.healthKitError", healthErrorCode: code.rawValue)
      } else {
        Self.trace("result.nonHealthKitError")
      }
      #else
      if let healthError = error as? HKError, healthError.code == .errorUserCanceled {
        return .failure(.authorizationCancelled)
      }
      #endif
      return .failure(.authorizationFailed)
    }
  }

  private func finish(_ result: Result<Void, MedicationHealthError>,
                      completion: @escaping (Result<Void, MedicationHealthError>) -> Void) {
    #if DEBUG && NATIVE_XCTEST
    if deferDiagnosticCleanup(result, completion: completion) { return }
    #endif
    guard let controller = host, !finishing else { return }
    finishing = true
    #if DEBUG && NATIVE_XCTEST
    let finishingDiagnostic = hostRetentionDiagnostic
    #endif
    controller.dismiss(animated: false) {
      #if DEBUG && NATIVE_XCTEST
      if let finishingDiagnostic, self.hostRetentionDiagnostic !== finishingDiagnostic {
        Self.trace("comparison.lateDelivery.ignored")
        return
      }
      #endif
      self.host = nil
      self.finishing = false
      #if DEBUG && NATIVE_XCTEST
      Self.trace("caller.deliver.afterDismissal")
      #endif
      completion(result)
    }
  }

  private static func foregroundPresenter() -> UIViewController? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }
      .flatMap { $0.windows }
      .filter { $0.isKeyWindow }
    // Do not select an arbitrary scene if more than one is active.
    #if DEBUG && NATIVE_XCTEST
    let windowCount = windows.count
    guard windowCount == 1 else {
      Self.trace("context.foregroundKeyWindowCount", windowCount: windowCount)
      return nil
    }
    guard var controller = windows.first?.rootViewController else {
      Self.trace("context.rootMissing")
      return nil
    }
    #else
    guard windows.count == 1, var controller = windows.first?.rootViewController else { return nil }
    #endif
    while let presented = controller.presentedViewController { controller = presented }
    return controller
  }

  #if DEBUG && NATIVE_XCTEST
  private static func traceCondition(_ condition: Bool, failure: StaticString) -> Bool {
    if !condition { trace(failure) }
    return condition
  }

  // Fixed labels and numeric/Boolean fields only; never accept errors or objects.
  private nonisolated static func trace(_ event: StaticString,
                                        windowCount: Int? = nil,
                                        healthErrorCode: Int? = nil) {
    var line = "[MedicationAuthorizationOriginalDiagnostic] \(event) main=\(Thread.isMainThread) uptime=\(ProcessInfo.processInfo.systemUptime)"
    if let windowCount { line += " windowCount=\(windowCount)" }
    if let healthErrorCode { line += " healthErrorCode=\(healthErrorCode)" }
    print(line)
  }
  #endif
}

@MainActor
private final class AuthorizationReadiness: ObservableObject {
  @Published var ready = false
}

@available(iOS 26.0, *)
@MainActor
private struct MedicationAuthorizationView: View {
  @ObservedObject var readiness: AuthorizationReadiness
  let completion: (Result<Bool, Error>) -> Void
  @State private var store = HKHealthStore()
  @State private var trigger = false

  var body: some View {
    Color.clear
      .accessibilityHidden(true)
      .healthDataAccessRequest(
        store: store,
        objectType: HKObjectType.userAnnotatedMedicationType(),
        predicate: nil,
        trigger: trigger,
        completion: completion
      )
      .onReceive(readiness.$ready) { ready in
        if ready && !trigger { trigger = true }
      }
  }
}
