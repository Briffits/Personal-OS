// Presentation pattern adapted from PersonalOS 59f9748 arm B (also at 24c746b).
// See README.md for the isolated harness, instrumentation and cleanup departures.
import Combine
import HealthKit
import HealthKitUI
import SwiftUI
import UIKit

@MainActor
final class RetainedModalAuthorization {
  private var host: UIViewController?
  private var readiness: AuthorizationReadiness?
  private var acceptingCallbacks = false
  private var presentationCompleted = false
  private var cleaning = false
  private var dismissalRequested = false
  private var cleanupTimedOut = false
  private var cleanupDeadline: TimeInterval = 0
  private var cleanupCheck: DispatchWorkItem?
  private var cleanupCompletion: ((Bool) -> Void)?

  var hasHost: Bool { host != nil }

  // Same bounded smoke prerequisite is called by ComparisonObservation. It
  // checks the entire presented chain, without changing the presenter's gate.
  static func contextIsReady() -> Bool {
    let windows = foregroundWindows()
    guard windows.count == 1, let window = windows.first,
          var controller = window.rootViewController else { return false }
    while true {
      guard !controller.isBeingPresented, !controller.isBeingDismissed,
            controller.transitionCoordinator == nil else { return false }
      guard let presented = controller.presentedViewController else {
        return controller.viewIfLoaded?.window === window
      }
      controller = presented
    }
  }

  func requestAccess(callback: @escaping (AuthorizationOutcome) -> Void) -> String? {
    guard HKHealthStore.isHealthDataAvailable() else { return "Health unavailable; no modal created." }
    guard host == nil, !cleaning, let presenter = Self.foregroundPresenter(),
          presenter.viewIfLoaded?.window != nil,
          !presenter.isBeingPresented, !presenter.isBeingDismissed,
          presenter.transitionCoordinator == nil else {
      return "Presenter rejected the context; no Health callback observed."
    }
    let readiness = AuthorizationReadiness()
    self.readiness = readiness
    acceptingCallbacks = true
    let view = MedicationAuthorizationView(readiness: readiness) { [weak self] result in
      DiagnosticTrace.callback(result)
      // Preserve the tested modal's DispatchQueue handoff and completion type.
      DispatchQueue.main.async {
        guard let self, self.acceptingCallbacks else {
          DiagnosticTrace.event("callback.afterCleanup.ignored", outcome: AuthorizationOutcome(result))
          return
        }
        callback(AuthorizationOutcome(result))
      }
    }
    let controller = UIHostingController(rootView: view)
    controller.view.backgroundColor = .clear
    controller.modalPresentationStyle = .overFullScreen
    controller.isModalInPresentation = true
    host = controller
    DiagnosticTrace.event("host.retained")
    presenter.present(controller, animated: false) { [weak self, weak controller] in
      guard let self, let controller, self.host === controller else { return }
      self.presentationCompleted = true
      DiagnosticTrace.event("host.presentationCompleted")
      if self.cleaning {
        self.checkCleanup() // A timeout/background must not initiate a late request.
      } else if self.acceptingCallbacks {
        readiness.ready = true // Original UIKit-completion readiness; no later gate.
      }
    }
    return nil
  }

  // Called only after the observer's ten-second interval, or on failure/timeout.
  // Wait for in-flight UIKit presentation/dismissal without blocking the main
  // queue. Report a failed bound honestly rather than claiming reference release
  // proves detachment. Late UIKit completions may still release a detached host.
  func cleanup(completion: @escaping (Bool) -> Void) {
    guard !cleaning else { return }
    acceptingCallbacks = false
    readiness?.cancelled = true
    cleaning = true
    cleanupCompletion = completion
    cleanupDeadline = ProcessInfo.processInfo.systemUptime + 5
    DiagnosticTrace.event("cleanup.begin")
    checkCleanup()
  }

  private func checkCleanup() {
    guard cleaning else { return }
    cleanupCheck?.cancel()
    cleanupCheck = nil
    if host == nil {
      DiagnosticTrace.event("cleanup.noHost")
      completeCleanup()
      return
    }
    guard let controller = host else { return }
    if !cleanupTimedOut && ProcessInfo.processInfo.systemUptime >= cleanupDeadline {
      cleanupTimedOut = true
      let completion = cleanupCompletion
      cleanupCompletion = nil
      DiagnosticTrace.event("cleanup.timeout.hostNotReleased")
      completion?(false)
    }
    if presentationCompleted && controller.presentingViewController == nil
        && controller.viewIfLoaded?.window == nil && !controller.isBeingPresented
        && !controller.isBeingDismissed && controller.presentedViewController == nil {
      host = nil
      readiness = nil
      completeCleanup()
      return
    }
    if presentationCompleted && !dismissalRequested && !controller.isBeingPresented
        && !controller.isBeingDismissed && controller.transitionCoordinator == nil {
      dismissalRequested = true
      DiagnosticTrace.event("host.dismissRequested")
      controller.dismiss(animated: false) { [weak self] in
        DiagnosticTrace.event("host.dismissCompleted")
        self?.checkCleanup()
      }
    }
    // A failed bound ends polling. Only an already outstanding UIKit completion
    // can perform a late release; it never changes the reported failed outcome.
    if cleaning && !cleanupTimedOut {
      let check = DispatchWorkItem { [weak self] in self?.checkCleanup() }
      cleanupCheck = check
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: check)
    }
  }

  private func completeCleanup() {
    cleaning = false
    cleanupCheck?.cancel()
    cleanupCheck = nil
    let completion = cleanupCompletion
    cleanupCompletion = nil
    DiagnosticTrace.event(cleanupTimedOut ? "cleanup.lateRelease" : "cleanup.complete.hostReleased")
    completion?(true)
  }

  private static func foregroundWindows() -> [UIWindow] {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }
      .flatMap { $0.windows }
      .filter { $0.isKeyWindow }
  }

  private static func foregroundPresenter() -> UIViewController? {
    let windows = foregroundWindows()
    guard windows.count == 1, var controller = windows.first?.rootViewController else { return nil }
    while let presented = controller.presentedViewController { controller = presented }
    return controller
  }
}

@MainActor
private final class AuthorizationReadiness: ObservableObject {
  @Published var ready = false
  var cancelled = false
}

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
      .onAppear { DiagnosticTrace.event("modal.swiftui.appear") }
      .onDisappear { DiagnosticTrace.event("modal.swiftui.disappear") }
      .onReceive(readiness.$ready) { ready in
        DiagnosticTrace.event(ready ? "modal.readiness.true" : "modal.readiness.false")
        if ready && !trigger && !readiness.cancelled {
          trigger = true
          DiagnosticTrace.event("modal.trigger.true")
        }
      }
  }
}
