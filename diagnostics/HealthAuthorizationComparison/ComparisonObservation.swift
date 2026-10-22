import Combine
import HealthKit
import SwiftUI
import UIKit

enum ComparisonPath: String {
  case persistentRoot = "S"
  case retainedModal = "M"

  static let selected: ComparisonPath? = {
    #if DEBUG
    return ProcessInfo.processInfo.environment["PERSONALOS_NATIVE_HEALTH_PATH"]
      .flatMap(ComparisonPath.init(rawValue:))
    #else
    return nil
    #endif
  }()
}

enum AuthorizationOutcome: String {
  case successTrue, successFalse, cancellationError, otherError

  init(_ result: Result<Bool, Error>) {
    switch result {
    case .success(true): self = .successTrue
    case .success(false): self = .successFalse
    case .failure(let error):
      self = (error as? HKError)?.code == .errorUserCanceled ? .cancellationError : .otherError
    }
  }
}

enum DiagnosticTrace {
  // Fixed labels, enum values and lifecycle flags only. Never print an Error,
  // Health object, identifier, device detail or user-supplied environment text.
  static func event(_ label: StaticString, outcome: AuthorizationOutcome? = nil) {
    #if DEBUG
    let result = outcome.map { " outcome=\($0.rawValue)" } ?? ""
    print("[NativeHealthComparison] path=\(ComparisonPath.selected?.rawValue ?? "inert")"
      + " uptime=\(ProcessInfo.processInfo.systemUptime) main=\(Thread.isMainThread) \(label)\(result)")
    #endif
  }

  static func callback(_ result: Result<Bool, Error>) {
    event("callback.raw", outcome: AuthorizationOutcome(result))
  }
}

// Observes one attempt. It does not determine whether Apple's sheet was visible.
@MainActor
final class ComparisonObservation: ObservableObject {
  let path = ComparisonPath.selected
  @Published private(set) var status = "No request started."
  @Published private(set) var callbackStatus = "No accepted callback."
  @Published private(set) var cleanupStatus = "Not needed yet."

  private enum Phase { case idle, context, requesting, observing, cleaning, finished }
  private var phase = Phase.idle
  private var started = false
  private var outcome: AuthorizationOutcome?
  private let modal = RetainedModalAuthorization()
  private var contextDeadline: TimeInterval = 0
  private var callbackDeadline: TimeInterval = 0
  private var contextCheck: DispatchWorkItem?
  private var callbackTimeout: DispatchWorkItem?
  private var observationEnd: DispatchWorkItem?

  private func begin(_ expected: ComparisonPath) -> Bool {
    guard !started, path == expected else { return false }
    started = true // Never cleared by failure, cleanup, appearance or foregrounding.
    guard HKHealthStore.isHealthDataAvailable() else {
      phase = .finished
      status = "Health unavailable; no request issued."
      cleanupStatus = "No modal created."
      DiagnosticTrace.event("request.unavailable")
      return false
    }
    return true
  }

  func beginRootRequest() -> Bool {
    guard begin(.persistentRoot) else { return false }
    beginCallbackWait()
    return true
  }

  func beginModalRequest() {
    guard begin(.retainedModal) else { return }
    phase = .context
    status = "Waiting for a settled foreground presenter (at most 10 seconds)."
    contextDeadline = ProcessInfo.processInfo.systemUptime + 10
    DiagnosticTrace.event("context.wait.begin")
    checkContext()
  }

  private func checkContext() {
    guard phase == .context else { return }
    guard ProcessInfo.processInfo.systemUptime < contextDeadline else {
      finish("Context prerequisite failed; no request issued.", deliver: false)
      DiagnosticTrace.event("context.timeout")
      return
    }
    if RetainedModalAuthorization.contextIsReady() {
      // No suspension between the final check and the one presenter call.
      DiagnosticTrace.event("context.ready")
      beginCallbackWait()
      if let failure = modal.requestAccess(callback: { [weak self] result in
        self?.receivedCallback(result)
      }) {
        DiagnosticTrace.event("request.rejected")
        finish(failure, deliver: false)
      }
      return
    }
    let check = DispatchWorkItem { [weak self] in self?.checkContext() }
    contextCheck = check
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: check)
  }

  private func beginCallbackWait() {
    phase = .requesting
    callbackDeadline = ProcessInfo.processInfo.systemUptime + 120
    status = "Request initiated; waiting for callback (at most 120 seconds)."
    DiagnosticTrace.event("request.begin")
    let timeout = DispatchWorkItem { [weak self] in
      guard let self, self.phase == .requesting else { return }
      DiagnosticTrace.event("callback.timeout")
      self.finish("Callback timed out. Cancel any visible sheet, then stop Run.", deliver: false)
    }
    callbackTimeout = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 120, execute: timeout)
  }

  func receivedCallback(_ result: AuthorizationOutcome) {
    let deadline = DispatchTime.now() + 10
    DiagnosticTrace.event("callback.main", outcome: result)
    guard phase == .requesting else {
      DiagnosticTrace.event("callback.additionalOrLate.ignored", outcome: result)
      return
    }
    guard ProcessInfo.processInfo.systemUptime < callbackDeadline else {
      DiagnosticTrace.event("callback.afterDeadline.ignored", outcome: result)
      finish("Callback arrived after the 120-second bound. Stop Run.", deliver: false)
      return
    }
    callbackTimeout?.cancel()
    callbackTimeout = nil
    outcome = result
    callbackStatus = "\(result.rawValue) — sheet visibility and read access unverified."
    phase = .observing
    status = "Observing for 10 seconds after callback main handoff."
    DiagnosticTrace.event("observation.begin")
    let end = DispatchWorkItem { [weak self] in
      guard let self, self.phase == .observing else { return }
      if self.path == .retainedModal {
        DiagnosticTrace.event(self.modal.hasHost ? "observation.end.hostRetained" : "observation.end.hostMissing")
      } else {
        DiagnosticTrace.event("observation.end.rootRetained")
      }
      self.finish("Observation ended. Record visibility and cancellation separately.", deliver: true)
    }
    observationEnd = end
    DispatchQueue.main.asyncAfter(deadline: deadline, execute: end)
  }

  func sceneChanged(_ scene: ScenePhase) {
    switch scene {
    case .active: DiagnosticTrace.event("scene.active")
    case .inactive:
      // System UI may itself make the scene inactive. Record it, but do not
      // dismiss a possible Health sheet merely because it took focus.
      DiagnosticTrace.event("scene.inactive")
    case .background:
      DiagnosticTrace.event("scene.background")
      if phase == .context || phase == .requesting || phase == .observing {
        finish("Run interrupted by backgrounding. Stop Run; no automatic retry.", deliver: false)
      }
    @unknown default: DiagnosticTrace.event("scene.unknown")
    }
  }

  private func finish(_ message: String, deliver: Bool) {
    guard phase != .finished, phase != .cleaning else { return }
    contextCheck?.cancel()
    callbackTimeout?.cancel()
    observationEnd?.cancel()
    contextCheck = nil
    callbackTimeout = nil
    observationEnd = nil
    phase = .cleaning
    status = message
    if path == .retainedModal {
      cleanupStatus = "Dismissing modal; at most 5 seconds."
      modal.cleanup { [weak self] cleaned in
        guard let self, self.phase == .cleaning else { return }
        self.phase = .finished
        self.cleanupStatus = cleaned
          ? "No retained modal remains. Apple-sheet disappearance requires observation."
          : "Cleanup timed out; host detachment unverified. Stop Run."
        if cleaned && deliver, let outcome = self.outcome {
          DiagnosticTrace.event("caller.deliver.afterDismissal", outcome: outcome)
        }
        DiagnosticTrace.event(cleaned ? "run.ended" : "run.cleanupFailed")
      }
    } else {
      phase = .finished
      cleanupStatus = "Root retained by design; no modal to remove. Cancel any visible sheet before stopping Run."
      DiagnosticTrace.event("cleanup.rootRetained")
      DiagnosticTrace.event("run.ended")
    }
  }
}
