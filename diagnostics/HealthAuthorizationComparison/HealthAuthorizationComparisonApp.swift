// The S authorization pattern is adapted from Apple's MedsSymptomsLoggingApp.
// See APPLE_SAMPLE_LICENSE.txt and README.md for attribution and all reductions.
import HealthKit
import HealthKitUI
import SwiftUI

@main
@MainActor
struct HealthAuthorizationComparisonApp: App {
  // Shared for the process, as in Apple's sample; never used for queries.
  private static let rootStore = HKHealthStore()
  @State private var trigger = false
  @StateObject private var observation = ComparisonObservation()
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      Group {
        if observation.path == .persistentRoot {
          ComparisonContent(observation: observation)
            .onAppear {
              DiagnosticTrace.event("root.appear")
              if observation.beginRootRequest() {
                trigger.toggle()
                DiagnosticTrace.event("root.trigger.true")
              }
            }
            .healthDataAccessRequest(
              store: Self.rootStore,
              objectType: .userAnnotatedMedicationType(),
              trigger: trigger,
              completion: { @Sendable result in
                DiagnosticTrace.callback(result)
                // Preserve the sample's main-actor handoff and persistent root.
                Task { @MainActor in
                  observation.receivedCallback(AuthorizationOutcome(result))
                }
              }
            )
        } else {
          // Inert and M roots have no Health modifier attached.
          ComparisonContent(observation: observation)
            .onAppear {
              DiagnosticTrace.event("root.appear")
              observation.beginModalRequest()
            }
        }
      }
      .onDisappear { DiagnosticTrace.event("root.disappear") }
      .onChange(of: scenePhase) { _, phase in observation.sceneChanged(phase) }
    }
  }
}

@MainActor
private struct ComparisonContent: View {
  @ObservedObject var observation: ComparisonObservation
  @State private var interactionCount = 0

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text("Health Presentation Diagnostic").font(.title).accessibilityAddTraits(.isHeader)
        Text(observation.path.map { "Path \($0.rawValue)" } ?? "Inert — no path opt-in")
          .font(.headline)
        #if DEBUG
        if observation.path == .direct {
          Text("D — direct per-object API. No request until you tap the button.")
          Button("D: Request Apple medication-selection sheet once") {
            observation.beginDirectRequest()
          }
          .buttonStyle(.borderedProminent)
          .frame(minHeight: 44)
          .disabled(observation.directAttempted)
          .accessibilityHint("Starts one direct authorization request. Cancel without changing selections.")
          Text("Direct callback: \(observation.directCallbackDetails)")
        }
        #endif
        Text(observation.status)
        Text("Sheet visibility: not verified by this app. Record your observation separately.")
        Text("Manual cancellation: not verified by this app. Record the actual cancellation tap separately.")
        Text("Callback: \(observation.callbackStatus)")
        Text("Cleanup: \(observation.cleanupStatus)")
        Text("Callback success does not verify presentation or read access.")
          .font(.headline)
        Text("Cancel any Apple sheet without changing selections. No Health records are queried or saved.")
        Button("Check interaction: \(interactionCount)") {
          interactionCount += 1
          DiagnosticTrace.event("interaction.tap")
        }
        .buttonStyle(.bordered)
        .frame(minHeight: 44)
        .accessibilityHint("Increments an in-memory counter. Does not request Health access.")
        Text("One attempt per process. Start a fresh Run for another attempt.")
          .font(.footnote)
      }
      .padding()
    }
  }
}
