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
    #if DEBUG
    Self.trace("presenter.request hostRetained=\(host != nil) finishing=\(finishing)")
    #endif
    guard #available(iOS 26.0, *), HKHealthStore.isHealthDataAvailable() else {
      #if DEBUG
      Self.trace("presenter.unavailable")
      #endif
      completion(.failure(.unavailable)); return
    }
    // Never queue a prompt to appear later without the initiating user action.
    guard host == nil, let presenter = Self.foregroundPresenter(),
          presenter.viewIfLoaded?.window != nil,
          !presenter.isBeingPresented, !presenter.isBeingDismissed,
          presenter.transitionCoordinator == nil else {
      #if DEBUG
      Self.trace("presenter.contextRejected")
      #endif
      completion(.failure(.authorizationFailed)); return
    }
    let readiness = AuthorizationReadiness()
    let view = MedicationAuthorizationView(readiness: readiness) { result in
      #if DEBUG
      switch result {
      case .success(let completed): Self.trace("swiftui.completion success=\(completed)")
      case .failure: Self.trace("swiftui.completion failure")
      }
      #endif
      DispatchQueue.main.async {
        #if DEBUG
        Self.traceContext("completion.main", self.host)
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
    // UIKit's presentation callback can still expose a transition coordinator.
    #if DEBUG
    Self.traceContext("presenter.selected", presenter)
    Self.traceContext("host.retained", controller)
    #endif
    presenter.present(controller, animated: false) {
      #if DEBUG
      Self.traceContext("host.presentationCompleted", controller)
      #endif
      Self.waitForPresentation(controller) { ready in
        guard self.host === controller, !self.finishing else { return }
        #if DEBUG
        Self.traceContext(ready ? "host.ready" : "host.readinessRejected", controller)
        #endif
        guard ready else {
          self.finish(.failure(.authorizationFailed), completion: completion)
          return
        }
        readiness.ready = true
      }
    }
  }

  // Called from present's completion (after viewDidAppear). Leave UIKit's
  // callback stack before inspecting state or publishing to SwiftUI. A queue
  // turn is not evidence of readiness: the live hierarchy must also be settled.
  // No timer, polling, or deferred prompt after returning to the foreground.
  static func waitForPresentation(_ controller: UIViewController,
                                  completion: @escaping (Bool) -> Void) {
    var delivered = false
    func checkAfterUnwinding(cancelled: Bool) {
      DispatchQueue.main.async {
        guard !delivered else { return }
        delivered = true
        completion(!cancelled && Self.isReadyForAuthorization(controller))
      }
    }
    if let coordinator = controller.transitionCoordinator {
      let registered = coordinator.animate(alongsideTransition: nil) { context in
        checkAfterUnwinding(cancelled: context.isCancelled)
      }
      // Registration may be too late in UIKit's completion phase. Apple notes
      // that its callback may still run after returning false; deliver once.
      if !registered { checkAfterUnwinding(cancelled: coordinator.isCancelled) }
    } else {
      checkAfterUnwinding(cancelled: false)
    }
  }

  static func isReadyForAuthorization(_ controller: UIViewController) -> Bool {
    guard let window = controller.viewIfLoaded?.window,
          window.isKeyWindow,
          window.windowScene?.activationState == .foregroundActive,
          let presenter = controller.presentingViewController else { return false }
    return presenter.presentedViewController === controller
      && controller.presentedViewController == nil
      && !controller.isBeingPresented && !controller.isBeingDismissed
      && !presenter.isBeingPresented && !presenter.isBeingDismissed
      && controller.transitionCoordinator == nil && presenter.transitionCoordinator == nil
  }

  nonisolated static func sanitized(_ result: Result<Bool, Error>) -> Result<Void, MedicationHealthError> {
    switch result {
    case .success(true): return .success(()) // Flow completed, NOT read permission.
    case .success(false): return .failure(.authorizationFailed)
    case .failure(let error):
      if let healthError = error as? HKError, healthError.code == .errorUserCanceled {
        return .failure(.authorizationCancelled)
      }
      return .failure(.authorizationFailed)
    }
  }

  private func finish(_ result: Result<Void, MedicationHealthError>,
                      completion: @escaping (Result<Void, MedicationHealthError>) -> Void) {
    #if DEBUG
    Self.trace("finish.enter hostRetained=\(host != nil) finishing=\(finishing)")
    #endif
    guard let controller = host, !finishing else { return }
    finishing = true
    #if DEBUG
    Self.traceContext("host.dismissRequested", controller)
    #endif
    controller.dismiss(animated: false) {
      self.host = nil
      self.finishing = false
      #if DEBUG
      Self.traceContext("host.dismissCompleted", controller)
      Self.trace("host.released completion.delivered")
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
    #if DEBUG
    Self.trace("presenter.foregroundKeyWindows=\(windows.count)")
    #endif
    // Do not select an arbitrary scene if more than one is active.
    guard windows.count == 1, var controller = windows.first?.rootViewController else { return nil }
    while let presented = controller.presentedViewController { controller = presented }
    return controller
  }

  #if DEBUG
  // Only lifecycle flags and monotonic timing. Never pass objects, error text,
  // Health values, window/scene identifiers, or controller descriptions here.
  nonisolated static func trace(_ event: String) {
    print("[MedicationAuthorization] uptime=\(ProcessInfo.processInfo.systemUptime) main=\(Thread.isMainThread) \(event)")
  }

  private static func traceContext(_ event: String, _ controller: UIViewController?) {
    let window = controller?.viewIfLoaded?.window
    trace("\(event) attached=\(window != nil) key=\(window?.isKeyWindow == true)"
      + " foreground=\(window?.windowScene?.activationState == .foregroundActive)"
      + " root=\(controller != nil && controller === window?.rootViewController)"
      + " presenting=\(controller?.presentingViewController != nil) presented=\(controller?.presentedViewController != nil)"
      + " transition=\(controller?.transitionCoordinator != nil)"
      + " appearing=\(controller?.isBeingPresented == true) dismissing=\(controller?.isBeingDismissed == true)")
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
      #if DEBUG
      .onAppear { MedicationHealthAuthorization.trace("swiftui.appear") }
      .onDisappear { MedicationHealthAuthorization.trace("swiftui.disappear") }
      #endif
      .onReceive(readiness.$ready) { ready in
        #if DEBUG
        MedicationHealthAuthorization.trace("swiftui.readiness ready=\(ready) trigger=\(trigger)")
        #endif
        if ready && !trigger { trigger = true }
        #if DEBUG
        MedicationHealthAuthorization.trace("swiftui.trigger=\(trigger)")
        #endif
      }
  }
}
