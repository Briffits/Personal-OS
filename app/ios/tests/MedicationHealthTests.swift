import XCTest
import HealthKit
import SwiftUI
import UIKit

private final class MemoryMedicationKeychain: MedicationKeychainAccess {
  var data: Data?
  var failWrite = false
  var failReadAfterWrite = false
  var unreadable = false
  func read(service: String, account: String) throws -> Data? {
    if unreadable { throw MedicationStorageError.readFailed }
    return service == MedicationCollectionStorage.service ? data : nil
  }
  func insert(_ data: Data, service: String, account: String) throws { try update(data, service: service, account: account) }
  func update(_ data: Data, service: String, account: String) throws {
    if failWrite { throw MedicationStorageError.writeFailed }
    self.data = data
    unreadable = failReadAfterWrite
  }
}

final class MedicationNativeTests: XCTestCase {
  func testAllPhaseOneStorageRegressions() throws { try MedicationCollectionStorageTests.main() }

  func testLinkTransactionsAndUnlinkWithoutHealth() throws {
    let keychain = MemoryMedicationKeychain()
    let store = MedicationCollectionStorage(keychain: keychain,
      validateConcept: { value in
        guard ["synthetic-a", "synthetic-a-alias", "synthetic-b"].contains(value) else {
          throw MedicationHealthError.malformedIdentity
        }
      }, sameConcept: { a, b in a.replacingOccurrences(of: "-alias", with: "") == b.replacingOccurrences(of: "-alias", with: "") })
    var state = try store.read()
    let prescription = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    for name in ["Synthetic inventory A", "Synthetic inventory B"] {
      state = try store.mutate(revision: state.revision, command: ["type": "create", "displayName": name, "prescriptionId": prescription])
    }
    let first = state.records[0].id; let second = state.records[1].id
    state = try store.mutate(revision: state.revision, command: ["type": "setLowStockThreshold", "id": first, "quantity": 1.5])
    func link(_ id: String, _ reference: String, _ quantity: Any = NSNull()) throws -> MedicationCollection {
      try store.mutate(revision: state.revision, command: ["type": "linkHealth", "id": id, "conceptReference": reference, "quantity": quantity])
    }
    XCTAssertThrowsError(try link(first, "bad", 4)) { XCTAssertEqual($0 as? MedicationHealthError, .malformedIdentity) }
    XCTAssertThrowsError(try link(first, "synthetic-a")) { XCTAssertEqual($0 as? MedicationStorageError, .baselineRequired) }
    state = try link(first, "synthetic-a", 4.5)
    XCTAssertEqual(state.records[0].stockBaseline?.quantity, 4.5)
    XCTAssertThrowsError(try link(second, "synthetic-a-alias", 5)) { XCTAssertEqual($0 as? MedicationStorageError, .duplicateHealthLink) }
    let unchanged = try link(first, "synthetic-a-alias")
    XCTAssertEqual(unchanged, state) // Same native identity, preserve original token.
    state = try store.mutate(revision: state.revision, command: ["type": "addStock", "id": first, "quantity": 0.5])
    let oldBaseline = state.records[0].stockBaseline
    XCTAssertThrowsError(try link(first, "synthetic-b")) { XCTAssertEqual($0 as? MedicationStorageError, .baselineRequired) }
    let bytes = keychain.data
    keychain.failWrite = true
    XCTAssertThrowsError(try link(first, "synthetic-b", 2))
    XCTAssertEqual(keychain.data, bytes)
    keychain.failWrite = false
    state = try link(first, "synthetic-b", 2.25)
    XCTAssertNotEqual(state.records[0].stockBaseline?.id, oldBaseline?.id)
    XCTAssertTrue(state.records[0].stockAdditions.isEmpty)
    XCTAssertNil(state.records[0].legacyRecordedStock)
    let before = state.records[0]
    // Defaults throw if any Health identity operation is attempted.
    let offlineStore = MedicationCollectionStorage(keychain: keychain)
    state = try offlineStore.mutate(revision: state.revision, command: ["type": "unlinkHealth", "id": first])
    var expected = before; expected.healthKitConceptReference = nil
    XCTAssertEqual(state.records[0], expected)
    XCTAssertEqual(state.records[0].prescriptionId, prescription)
    XCTAssertEqual(state.records[0].lowStockThreshold, 1.5)
    XCTAssertNotNil(state.records[0].stockBaseline?.healthKitConceptReference)
    XCTAssertThrowsError(try offlineStore.mutate(revision: state.revision, command: ["type": "addStock", "id": first, "quantity": 1]))
    keychain.failReadAfterWrite = true
    XCTAssertThrowsError(try link(first, "synthetic-a", 3)) { XCTAssertEqual($0 as? MedicationStorageError, .commitUncertain) }
    keychain.unreadable = false
    let committed = try store.read()
    XCTAssertEqual(committed.records[0].healthKitConceptReference, "synthetic-a")
    XCTAssertThrowsError(try link(first, "synthetic-b", 3)) { XCTAssertEqual($0 as? MedicationStorageError, .staleState) }
  }

  func testMappingAndBoundaries() throws {
    let (from, through) = try MedicationHealthMapping.interval(from: "2026-01-01T00:00:00.000Z", through: "2026-01-02T00:00:00.000Z")
    XCTAssertFalse(MedicationHealthMapping.includes(sameConcept: true, start: from, from: from, through: through))
    XCTAssertTrue(MedicationHealthMapping.includes(sameConcept: true, start: through, from: from, through: through))
    XCTAssertFalse(MedicationHealthMapping.includes(sameConcept: true, start: through.addingTimeInterval(0.001), from: from, through: through))
    XCTAssertFalse(MedicationHealthMapping.includes(sameConcept: false, start: through, from: from, through: through))
    XCTAssertThrowsError(try MedicationHealthMapping.interval(from: "bad", through: "bad"))
    XCTAssertThrowsError(try MedicationHealthMapping.interval(from: "2026-01-02T00:00:00.000Z", through: "2026-01-01T00:00:00.000Z"))
    let id = UUID()
    func dose(_ quantity: Double?, _ unit: HKUnit = .count(), _ status: String = "taken") -> (payload: [String: Any], supported: Bool) {
      MedicationHealthMapping.dose(id: id, reference: "synthetic", start: through, quantity: quantity, unit: unit, status: status)
    }
    let fractional = dose(0.125)
    XCTAssertTrue(fractional.supported)
    XCTAssertEqual(fractional.payload["quantity"] as? Double, 0.125)
    XCTAssertEqual(fractional.payload["id"] as? String, id.uuidString.lowercased())
    XCTAssertFalse(dose(nil).supported)
    XCTAssertTrue(dose(nil).payload["quantity"] is NSNull)
    XCTAssertFalse(dose(1, .gram()).supported)
    XCTAssertFalse(dose(1, .liter()).supported)
    XCTAssertFalse(dose(-1).supported)
    XCTAssertFalse(dose(.infinity).supported)
    XCTAssertFalse(dose(1, .count(), "future").supported)
    XCTAssertEqual(dose(1, .count(), "future").payload["logStatus"] as? String, "unknown")
    XCTAssertTrue(dose(nil, .gram(), "skipped").supported)
    let medication = MedicationHealthMapping.medication(reference: "synthetic", displayName: "Synthetic", nickname: nil, form: nil, archived: true, hasSchedule: false)
    XCTAssertEqual(Set(medication.keys), Set(["conceptReference", "displayName", "nickname", "form", "isArchived", "hasSchedule"]))
    XCTAssertTrue(medication["nickname"] is NSNull)
    XCTAssertTrue(medication["form"] is NSNull)
  }

  func testStatusAndMalformedIdentity() throws {
    guard #available(iOS 26.0, *) else { throw XCTSkip("Medications requires iOS 26") }
    let statuses: [(HKMedicationDoseEvent.LogStatus, String)] = [(.taken, "taken"), (.skipped, "skipped"), (.notLogged, "notLogged"), (.snoozed, "snoozed"), (.notInteracted, "notInteracted"), (.notificationNotSent, "notificationNotSent")]
    for (value, expected) in statuses { XCTAssertEqual(MedicationHealthMapping.status(value), expected) }
    if let future = HKMedicationDoseEvent.LogStatus(rawValue: 999) {
      XCTAssertEqual(MedicationHealthMapping.status(future), "unknown")
    }
    let wrongClass = try NSKeyedArchiver.archivedData(withRootObject: "synthetic" as NSString, requiringSecureCoding: true)
    for value in ["", "hkconcept:2:AAAA", "hkconcept:1:%%%", "hkconcept:1:AA==", "hkconcept:1:" + wrongClass.base64EncodedString(), String(repeating: "x", count: 65_537)] {
      XCTAssertThrowsError(try HealthMedicationIdentity.validate(value)) { XCTAssertEqual($0 as? MedicationHealthError, .malformedIdentity) }
    }
  }

  func testAuthorizationCompletionMapping() throws {
    XCTAssertNoThrow(try MedicationHealthAuthorization.sanitized(.success(true)).get())
    XCTAssertThrowsError(try MedicationHealthAuthorization.sanitized(.success(false)).get()) {
      XCTAssertEqual($0 as? MedicationHealthError, .authorizationFailed)
    }
    let cancelled = NSError(domain: HKErrorDomain, code: HKError.Code.errorUserCanceled.rawValue)
    XCTAssertThrowsError(try MedicationHealthAuthorization.sanitized(.failure(cancelled)).get()) {
      XCTAssertEqual($0 as? MedicationHealthError, .authorizationCancelled)
    }
    XCTAssertThrowsError(try MedicationHealthAuthorization.sanitized(.failure(NSError(domain: "synthetic", code: 1))).get()) {
      XCTAssertEqual($0 as? MedicationHealthError, .authorizationFailed)
    }
  }

  @MainActor
  func testAuthorizationReadinessRejectsDetachedHostAsynchronously() async {
    let host = UIViewController()
    XCTAssertFalse(MedicationHealthAuthorization.isReadyForAuthorization(host))
    let checked = expectation(description: "Detached host rejected once")
    checked.assertForOverFulfill = true
    var returned = false
    MedicationHealthAuthorization.waitForPresentation(host) { ready in
      XCTAssertTrue(returned)
      XCTAssertFalse(ready)
      checked.fulfill()
    }
    returned = true
    await fulfillment(of: [checked], timeout: 5)
  }

  // Exercises UIKit/SwiftUI host lifecycle without installing a Health modifier,
  // requesting access, reading Health, or touching application storage.
  @MainActor
  func testAuthorizationReadinessAfterHostingPresentation() async throws {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }
      .flatMap { $0.windows }.filter { $0.isKeyWindow }
    guard windows.count == 1, let root = windows.first?.rootViewController,
          root.presentedViewController == nil, root.transitionCoordinator == nil else {
      throw XCTSkip("Requires a settled foreground test host")
    }
    // Cover the production nonanimated presentation and a real animated transition.
    for animated in [false, true] {
      let host = UIHostingController(rootView: Color.clear)
      host.modalPresentationStyle = .overFullScreen
      let checked = expectation(description: "Attached host ready once")
      checked.assertForOverFulfill = true
      root.present(host, animated: animated) {
        var returned = false
        MedicationHealthAuthorization.waitForPresentation(host) { ready in
          XCTAssertTrue(returned)
          XCTAssertTrue(ready)
          XCTAssertNil(host.transitionCoordinator)
          XCTAssertTrue(host.presentingViewController === root)
          checked.fulfill()
        }
        returned = true
      }
      if animated {
        XCTAssertFalse(MedicationHealthAuthorization.isReadyForAuthorization(host))
      }
      await fulfillment(of: [checked], timeout: 5)
      let dismissed = expectation(description: "Host dismissed")
      host.dismiss(animated: false) { dismissed.fulfill() }
      await fulfillment(of: [dismissed], timeout: 5)
      XCTAssertFalse(MedicationHealthAuthorization.isReadyForAuthorization(host))
    }
  }

  // Physical-device UI smoke test only. It never reads Health data or writes
  // application data. No selection is required; completing selection may
  // change Health access permissions. Cancel for the cancellation smoke check.
  @MainActor
  func testAuthorizationPresenterSmoke() async throws {
    #if targetEnvironment(simulator)
    throw XCTSkip("Requires a physical iPhone")
    #else
    guard #available(iOS 26.0, *),
          ProcessInfo.processInfo.environment["PERSONALOS_AUTHORIZATION_SMOKE_TEST"] == "1" else {
      throw XCTSkip("Requires iOS 26+ and explicit authorization smoke-test opt-in")
    }

    let completed = expectation(description: "Authorization sheet dismissed")
    completed.assertForOverFulfill = true
    var result: Result<Void, MedicationHealthError>?
    MedicationHealthAuthorization.shared.requestAccess {
      result = $0
      completed.fulfill()
    }

    await fulfillment(of: [completed], timeout: 120)
    switch try XCTUnwrap(result) {
    case .success:
      // Flow completed and presenter dismissed. This does not establish access.
      XCTContext.runActivity(named: "Authorization flow completed; access not checked") { _ in }
    case .failure(.authorizationCancelled):
      // Cancellation is an expected smoke-test outcome.
      XCTContext.runActivity(named: "Authorization flow cancelled as expected") { _ in }
    case .failure(let error):
      XCTFail("Unexpected authorization presenter result: \(error.rawValue)")
    }
    #endif
  }

  // Opt in ONLY on a dedicated test device/store with two manually entered
  // synthetic medications. Apple provides no public identifier constructor.
  // No identifier, medication metadata or archive is printed or saved.
  @MainActor
  func testRealIdentifierSecureRoundTripAndSemanticEquality() async throws {
    guard #available(iOS 26.0, *), ProcessInfo.processInfo.environment["PERSONALOS_SYNTHETIC_HEALTH_TESTS"] == "1" else {
      throw XCTSkip("Requires explicit opt-in and two synthetic Health medications")
    }
    // Manually running this opted-in test initiates the same presenter as RN.
    let completed = expectation(description: "System medication selection completed")
    var authorization: Result<Void, MedicationHealthError>?
    MedicationHealthAuthorization.shared.requestAccess {
      authorization = $0
      completed.fulfill()
    }
    await fulfillment(of: [completed], timeout: 120)
    try XCTUnwrap(authorization).get()
    let reader = MedicationHealthReader()
    let readable = try await withCheckedThrowingContinuation { continuation in
      reader.list { continuation.resume(with: $0) }
    }
    XCTAssertGreaterThanOrEqual(readable.count, 2, "Select both synthetic medications in the system sheet")
    let store = HKHealthStore()
    let medications = try await HKUserAnnotatedMedicationQueryDescriptor(predicate: nil, limit: nil).result(for: store)
    XCTAssertGreaterThanOrEqual(medications.count, 2)
    guard medications.count >= 2 else { return }
    let id = medications[0].medication.identifier
    let reference = try HealthMedicationIdentity.encode(id)
    XCTAssertTrue(try HealthMedicationIdentity.decode(reference).isEqual(id))
    let archiver = NSKeyedArchiver(requiringSecureCoding: true)
    archiver.outputFormat = .xml
    archiver.encode(id, forKey: NSKeyedArchiveRootObjectKey)
    archiver.finishEncoding()
    let alternate = "hkconcept:1:" + archiver.encodedData.base64EncodedString()
    XCTAssertNotEqual(reference, alternate)
    XCTAssertTrue(try HealthMedicationIdentity.equal(reference, alternate))
    XCTAssertFalse(try HealthMedicationIdentity.equal(reference, HealthMedicationIdentity.encode(medications[1].medication.identifier)))
  }
}
