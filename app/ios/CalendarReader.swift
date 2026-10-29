import Foundation

enum CalendarFailure: String, Error {
  case unavailable, denied, restricted, busy
  case notAuthorized = "not-authorized", writeOnly = "write-only"
  case authorizationFailed = "authorization-failed", readFailed = "read-failed"
}

enum CalendarAccess: String, CaseIterable {
  case notDetermined, authorized, writeOnly, denied, restricted, unavailable
  var readFailure: CalendarFailure? {
    switch self {
    case .authorized: return nil
    case .notDetermined: return .notAuthorized
    case .writeOnly: return .writeOnly
    case .denied: return .denied
    case .restricted: return .restricted
    case .unavailable: return .unavailable
    }
  }
}

struct CalendarDay: Equatable {
  let date: String
  let timeZone: TimeZone
  let start: Date
  let end: Date

  var calendar: Calendar {
    var value = Calendar(identifier: .gregorian)
    value.timeZone = timeZone
    return value
  }

  init(now: Date, timeZone: TimeZone) throws {
    _ = try Self.milliseconds(now)
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let start = calendar.startOfDay(for: now)
    guard let next = calendar.date(byAdding: .day, value: 1, to: start) else {
      throw CalendarFailure.readFailed
    }
    let end = calendar.startOfDay(for: next)
    guard end > start else { throw CalendarFailure.readFailed }
    _ = try Self.milliseconds(start)
    _ = try Self.milliseconds(end)
    self.date = try Self.civilDate(start, calendar: calendar)
    self.timeZone = timeZone
    self.start = start
    self.end = end
  }

  static func milliseconds(_ date: Date) throws -> Double {
    let value = date.timeIntervalSince1970 * 1000
    guard value.isFinite, abs(value) <= 8_640_000_000_000_000 else {
      throw CalendarFailure.readFailed
    }
    // Date has sub-millisecond precision; the wire contract does not.
    return value.rounded()
  }

  static func civilDate(_ date: Date, calendar: Calendar) throws -> String {
    _ = try milliseconds(date)
    let parts = calendar.dateComponents([.era, .year, .month, .day], from: date)
    guard parts.era == 1, let year = parts.year, (1...9999).contains(year),
          let month = parts.month, let day = parts.day, (1...12).contains(month) else {
      throw CalendarFailure.readFailed
    }
    // Foundation's historical Gregorian calendar can emit Julian leap dates
    // before the cutover (e.g. 1500-02-29). The wire contract/JS validator uses
    // Gregorian leap rules for every year; fail closed rather than shift dates.
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
    let lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    guard (1...lengths[month - 1]).contains(day) else { throw CalendarFailure.readFailed }
    return String(format: "%04d-%02d-%02d", year, month, day)
  }

  var payload: [String: Any] {
    ["date": date, "timeZone": timeZone.identifier,
     "startsAt": (start.timeIntervalSince1970 * 1000).rounded(),
     "endsAt": (end.timeIntervalSince1970 * 1000).rounded()]
  }
}

// Value-only projection. No EventKit objects cross the adapter's worker boundary.
struct CalendarEventInput {
  let calendarID: String?
  let eventID: String?
  let occurrence: Date?
  let recurring: Bool
  let title: String?
  let start: Date?
  let end: Date?
  let allDay: Bool
  let canceled: Bool
}

enum CalendarEventTime: Equatable {
  case allDay(String, String)
  case timed(Double, Double)
  var payload: [String: Any] {
    switch self {
    case let .allDay(start, end): return ["kind": "all-day", "startsOn": start, "endsBefore": end]
    case let .timed(start, end): return ["kind": "timed", "startsAt": start, "endsAt": end]
    }
  }
}

struct CalendarEventRow: Equatable {
  let id: String
  let title: String
  let time: CalendarEventTime
  static func == (lhs: CalendarEventRow, rhs: CalendarEventRow) -> Bool {
    // Swift String equality normalizes Unicode; JS wire equality does not.
    lhs.id.utf16.elementsEqual(rhs.id.utf16) && lhs.title.utf16.elementsEqual(rhs.title.utf16)
      && lhs.time == rhs.time
  }
  var payload: [String: Any] { ["occurrenceId": id, "title": title, "time": time.payload] }
}

enum CalendarProjection {
  // UTF-16 code-unit ordering matches JS ordinal comparison, not locale collation.
  static func ordinal(_ lhs: String, _ rhs: String) -> Bool {
    lhs.utf16.lexicographicallyPrecedes(rhs.utf16)
  }

  static func rows(_ inputs: [CalendarEventInput], day: CalendarDay) throws -> [CalendarEventRow] {
    var unique: [Data: CalendarEventRow] = [:]
    for input in inputs where !input.canceled {
      guard let start = input.start, let end = input.end, end >= start else {
        throw CalendarFailure.readFailed
      }
      let startMS = try CalendarDay.milliseconds(start)
      let endMS = try CalendarDay.milliseconds(end)
      let time: CalendarEventTime
      if input.allDay {
        let first = try CalendarDay.civilDate(start, calendar: day.calendar)
        let after = try CalendarDay.civilDate(end, calendar: day.calendar)
        guard first < after else { throw CalendarFailure.readFailed }
        guard first <= day.date && day.date < after else { continue }
        time = .allDay(first, after)
      } else {
        let overlaps = end == start ? (start >= day.start && start < day.end)
          : (start < day.end && end > day.start)
        guard overlaps else { continue }
        time = .timed(startMS, endMS)
      }
      guard let calendarID = input.calendarID, let eventID = input.eventID,
            !calendarID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            !eventID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            !input.recurring || input.occurrence != nil else { throw CalendarFailure.readFailed }
      let occurrence: Any = try input.occurrence.map { try CalendarDay.milliseconds($0) } ?? NSNull()
      let encoded = try JSONSerialization.data(withJSONObject: [calendarID, eventID, occurrence],
                                               options: [.withoutEscapingSlashes])
      guard let id = String(data: encoded, encoding: .utf8) else { throw CalendarFailure.readFailed }
      let row = CalendarEventRow(id: id, title: input.title ?? "", time: time)
      if let previous = unique[encoded], previous != row { throw CalendarFailure.readFailed }
      unique[encoded] = row
    }
    return unique.values.sorted { lhs, rhs in
      switch (lhs.time, rhs.time) {
      case let (.allDay(a, b), .allDay(c, d)):
        if a != c { return ordinal(a, c) }
        if b != d { return ordinal(b, d) }
      case (.allDay, .timed): return true
      case (.timed, .allDay): return false
      case let (.timed(a, b), .timed(c, d)):
        if a != c { return a < c }
        if b != d { return b < d }
      }
      return ordinal(lhs.id, rhs.id)
    }
  }
}

// Entry points and callbacks are confined to main. The adapter performs all
// expensive querying/projection off-main and never prompts from fetch.
protocol CalendarEventStore {
  func authorization() -> CalendarAccess
  func requestAccess(_ completion: @escaping (Bool) -> Void)
  func fetch(day: CalendarDay, completion: @escaping (Result<[CalendarEventRow], CalendarFailure>) -> Void)
}

final class CalendarReader {
  typealias Schedule = (TimeInterval, @escaping () -> Void) -> () -> Void
  private let store: CalendarEventStore
  private let isActive: () -> Bool
  private let currentDay: () throws -> CalendarDay
  private let schedule: Schedule
  private var operation: UUID?

  init(store: CalendarEventStore, isActive: @escaping () -> Bool,
       currentDay: @escaping () throws -> CalendarDay = {
         try CalendarDay(now: Date(), timeZone: .current)
       }, schedule: @escaping Schedule = { delay, callback in
         let work = DispatchWorkItem(block: callback)
         DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
         return { work.cancel() }
       }) {
    self.store = store
    self.isActive = isActive
    self.currentDay = currentDay
    self.schedule = schedule
  }

  func getAuthorizationStatus() -> CalendarAccess { store.authorization() }

  func requestAccess(_ completion: @escaping (Result<CalendarAccess, CalendarFailure>) -> Void) {
    guard operation == nil else { completion(.failure(.busy)); return }
    let status = store.authorization()
    guard status == .notDetermined || status == .writeOnly else { completion(.success(status)); return }
    guard isActive() else { completion(.failure(.busy)); return }
    let token = UUID()
    operation = token
    var settled = false
    let cancelDeadline = schedule(30) {
      guard self.operation == token, !settled else { return }
      settled = true
      completion(.failure(.authorizationFailed))
      // Do not release the gate until the OS request actually finishes.
    }
    store.requestAccess { failed in
      guard self.operation == token else { return }
      self.operation = nil
      cancelDeadline()
      guard !settled else { return }
      settled = true
      let status = self.store.authorization()
      if failed || status == .notDetermined { completion(.failure(.authorizationFailed)) }
      else { completion(.success(status)) }
    }
  }

  func fetchToday(_ completion: @escaping (Result<[String: Any], CalendarFailure>) -> Void) {
    guard operation == nil else { completion(.failure(.busy)); return }
    if let error = store.authorization().readFailure { completion(.failure(error)); return }
    let day: CalendarDay
    do { day = try currentDay() }
    catch { completion(.failure(.readFailed)); return }
    let token = UUID()
    operation = token
    var settled = false
    let cancelDeadline = schedule(30) {
      guard self.operation == token, !settled else { return }
      settled = true
      completion(.failure(.readFailed))
      // A synchronous EventKit read cannot be canceled. Keep its gate held.
    }
    store.fetch(day: day) { result in
      guard self.operation == token else { return }
      self.operation = nil
      cancelDeadline()
      guard !settled else { return }
      settled = true
      if let error = self.store.authorization().readFailure { completion(.failure(error)); return }
      do {
        guard try self.currentDay() == day else { throw CalendarFailure.readFailed }
        let rows = try result.get()
        let payload: [String: Any] = ["day": day.payload, "events": rows.map { $0.payload }]
        if let error = self.store.authorization().readFailure { completion(.failure(error)); return }
        guard try self.currentDay() == day else { throw CalendarFailure.readFailed }
        completion(.success(payload))
      } catch { completion(.failure(.readFailed)) }
    }
  }
}
