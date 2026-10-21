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
    let view = MedicationAuthorizationView(readiness: readiness) { result in
      DispatchQueue.main.async {
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
    guard let controller = host, !finishing else { return }
    finishing = true
    controller.dismiss(animated: false) {
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
    var line = "[MedicationAuthorizationOriginalDiagnostic] \(event) main=\(Thread.isMainThread)"
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
