import Foundation
import HealthKit

enum MedicationHealthError: String, Error {
  case unavailable = "health-unavailable"
  case authorizationCancelled = "authorization-cancelled"
  case authorizationFailed = "authorization-failed"
  case queryFailed = "query-failed"
  case malformedIdentity = "malformed-identity"
  case invalidInterval = "invalid-interval"
  case incompleteData = "incomplete-dose-data"
}

// Pure conversion/filtering helpers; no Health store or persistence dependency.
enum MedicationHealthMapping {
  static func formatter() -> ISO8601DateFormatter {
    let value = ISO8601DateFormatter()
    value.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    value.timeZone = TimeZone(secondsFromGMT: 0)
    return value
  }
  static func interval(from: String, through: String) throws -> (Date, Date) {
    let format = formatter()
    guard let start = format.date(from: from), let end = format.date(from: through),
          format.string(from: start) == from, format.string(from: end) == through,
          start <= end else { throw MedicationHealthError.invalidInterval }
    return (start, end)
  }
  static func includes(sameConcept: Bool, start: Date, from: Date, through: Date) -> Bool {
    sameConcept && start > from && start <= through
  }
  @available(iOS 26.0, *)
  static func status(_ status: HKMedicationDoseEvent.LogStatus) -> String {
    switch status {
    case .taken: return "taken"
    case .skipped: return "skipped"
    case .notLogged: return "notLogged"
    case .snoozed: return "snoozed"
    case .notInteracted: return "notInteracted"
    case .notificationNotSent: return "notificationNotSent"
    @unknown default: return "unknown"
    }
  }
  static func dose(id: UUID, reference: String, start: Date, quantity: Double?,
                   unit: HKUnit, status: String) -> (payload: [String: Any], supported: Bool) {
    // Exact native count unit only. Do not convert mass, volume or strength.
    let count = unit.isEqual(HKUnit.count())
    let validQuantity = quantity.map { $0.isFinite && $0 >= 0 && $0 <= 9_007_199_254_740_991 } ?? false
    let known = ["taken", "skipped", "notLogged", "snoozed", "notInteracted", "notificationNotSent"].contains(status)
    let supported = known && (status != "taken" || (count && validQuantity))
    return (["id": id.uuidString.lowercased(), "conceptReference": reference,
             "occurredAt": formatter().string(from: start),
             "quantity": quantity.flatMap { $0.isFinite ? $0 : nil }.map { $0 as Any } ?? NSNull(),
             "unit": count ? "count" : "unsupported", "logStatus": known ? status : "unknown"], supported)
  }
  static func medication(reference: String, displayName: String, nickname: String?,
                         form: String?, archived: Bool, hasSchedule: Bool) -> [String: Any] {
    ["conceptReference": reference, "displayName": displayName,
     "nickname": nickname.map { $0 as Any } ?? NSNull(),
     "form": form.map { $0 as Any } ?? NSNull(),
     "isArchived": archived, "hasSchedule": hasSchedule]
  }
}
