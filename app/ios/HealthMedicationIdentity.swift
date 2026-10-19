import Foundation
import HealthKit

// Versioned transport, never a display label or a canonical byte identity.
// Only the HealthKit identifier root is allowed; its NSSecureCoding decoder
// controls its own nested classes. No Health objects cross the JS boundary.
enum HealthMedicationIdentity {
  private static let prefix = "hkconcept:1:"
  static func validate(_ reference: String) throws {
    guard #available(iOS 26.0, *) else { throw MedicationHealthError.unavailable }
    _ = try decode(reference)
  }
  static func equal(_ lhs: String, _ rhs: String) throws -> Bool {
    guard #available(iOS 26.0, *) else { throw MedicationHealthError.unavailable }
    return try decode(lhs).isEqual(decode(rhs))
  }
  @available(iOS 26.0, *)
  static func encode(_ identifier: HKHealthConceptIdentifier) throws -> String {
    do {
      let bytes = try NSKeyedArchiver.archivedData(withRootObject: identifier, requiringSecureCoding: true)
      let reference = prefix + bytes.base64EncodedString()
      _ = try decode(reference)
      return reference
    } catch { throw MedicationHealthError.malformedIdentity }
  }
  @available(iOS 26.0, *)
  static func decode(_ reference: String) throws -> HKHealthConceptIdentifier {
    guard reference.hasPrefix(prefix), reference.utf8.count <= 65_536,
          let data = Data(base64Encoded: String(reference.dropFirst(prefix.count))), !data.isEmpty else {
      throw MedicationHealthError.malformedIdentity
    }
    do {
      let decoder = try NSKeyedUnarchiver(forReadingFrom: data)
      decoder.requiresSecureCoding = true
      decoder.decodingFailurePolicy = .setErrorAndReturn
      defer { decoder.finishDecoding() }
      guard let identifier = decoder.decodeObject(of: HKHealthConceptIdentifier.self,
                                                   forKey: NSKeyedArchiveRootObjectKey),
            decoder.error == nil, identifier.domain == .medication else { throw MedicationHealthError.malformedIdentity }
      return identifier
    } catch { throw MedicationHealthError.malformedIdentity }
  }
}
