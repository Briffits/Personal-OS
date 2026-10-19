import Foundation
import HealthKit

// Read-only and independent of inventory/Prescription Wallet persistence.
final class MedicationHealthReader {
  private let store = HKHealthStore()
  func availability() -> String {
    if #available(iOS 26.0, *), HKHealthStore.isHealthDataAvailable() { return "available" }
    return "unsupported"
  }
  func requestAccess(completion: @escaping (Result<Void, MedicationHealthError>) -> Void) {
    guard #available(iOS 26.0, *), availability() == "available" else {
      completion(.failure(.unavailable)); return
    }
    // Medication authorization covers the associated dose events. Never ask to share/write.
    store.requestAuthorization(toShare: [], read: [HKObjectType.userAnnotatedMedicationType()]) { success, error in
      if let error = error as? HKError, error.code == .errorUserCanceled {
        completion(.failure(.authorizationCancelled))
      } else if error != nil || !success { completion(.failure(.authorizationFailed)) }
      else { completion(.success(())) } // Not evidence that read permission was granted.
    }
  }
  func list(completion: @escaping (Result<[[String: Any]], MedicationHealthError>) -> Void) {
    guard #available(iOS 26.0, *), availability() == "available" else {
      completion(.failure(.unavailable)); return
    }
    // The descriptor collects the entire enumeration before returning.
    Task {
      do {
        let medications = try await HKUserAnnotatedMedicationQueryDescriptor(predicate: nil, limit: nil).result(for: store)
        let payload = try medications.map { item in
          MedicationHealthMapping.medication(reference: try HealthMedicationIdentity.encode(item.medication.identifier),
            displayName: item.medication.displayText, nickname: item.nickname,
            form: item.medication.generalForm == .unknown ? nil : item.medication.generalForm.rawValue,
            archived: item.isArchived, hasSchedule: item.hasSchedule)
        }
        completion(.success(payload))
      } catch { completion(.failure(.queryFailed)) }
    }
  }
  func snapshot(baselineID: String, reference: String, from: String, through: String,
                completion: @escaping (Result<[String: Any], MedicationHealthError>) -> Void) {
    guard #available(iOS 26.0, *), availability() == "available" else {
      completion(.failure(.unavailable)); return
    }
    do {
      let identifier = try HealthMedicationIdentity.decode(reference)
      let (start, end) = try MedicationHealthMapping.interval(from: from, through: through)
      // Query a safe superset at both boundaries; apply exact (from, through]
      // startDate filtering below. No status filter, pagination or stored anchor.
      let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
        HKQuery.predicateForMedicationDoseEvent(medicationConceptIdentifier: identifier),
        HKQuery.predicateForSamples(withStart: start, end: end.addingTimeInterval(1), options: .strictStartDate)
      ])
      let query = HKSampleQuery(sampleType: HKObjectType.medicationDoseEventType(), predicate: predicate,
                                limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
        guard error == nil, let samples = samples else { completion(.failure(.queryFailed)); return }
        var events: [[String: Any]] = []
        var complete = true
        for sample in samples {
          guard let event = sample as? HKMedicationDoseEvent else {
            completion(.failure(.incompleteData)); return
          }
          guard MedicationHealthMapping.includes(sameConcept: event.medicationConceptIdentifier.isEqual(identifier),
            start: event.startDate, from: start, through: end) else { continue }
          let mapped = MedicationHealthMapping.dose(id: event.uuid, reference: reference, start: event.startDate,
            quantity: event.doseQuantity, unit: event.unit, status: MedicationHealthMapping.status(event.logStatus))
          // Echo the validated request token after native semantic equality. JS
          // compares provenance tokens, never independently archived identities.
          events.append(mapped.payload)
          complete = complete && mapped.supported
        }
        completion(.success(["baselineId": baselineID, "conceptReference": reference,
          "from": from, "through": through, "coverage": complete ? "complete-query" : "limited", "events": events]))
      }
      store.execute(query)
    } catch let error as MedicationHealthError { completion(.failure(error)) }
    catch { completion(.failure(.queryFailed)) }
  }
}
