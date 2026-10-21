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
    guard #available(iOS 26.0, *), HKHealthStore.isHealthDataAvailable() else {
      completion(.failure(.unavailable)); return
    }
    // Never queue a prompt to appear later without the initiating user action.
    guard host == nil, let presenter = Self.foregroundPresenter(),
          presenter.viewIfLoaded?.window != nil,
          !presenter.isBeingPresented, !presenter.isBeingDismissed,
          presenter.transitionCoordinator == nil else {
      completion(.failure(.authorizationFailed)); return
    }
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
    guard let controller = host, !finishing else { return }
    finishing = true
    controller.dismiss(animated: false) {
      self.host = nil
      self.finishing = false
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
    guard windows.count == 1, var controller = windows.first?.rootViewController else { return nil }
    while let presented = controller.presentedViewController { controller = presented }
    return controller
  }
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
