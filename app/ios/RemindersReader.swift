import Foundation

enum RemindersFailure: String, Error {
  case unavailable, denied, restricted, busy
  case notAuthorized = "not-authorized"
  case authorizationFailed = "authorization-failed"
  case readFailed = "read-failed"
}

enum RemindersAccess: String {
  case notDetermined, authorized, denied, restricted, unavailable

  var readFailure: RemindersFailure? {
    switch self {
    case .authorized: return nil
    case .notDetermined: return .notAuthorized
    case .denied: return .denied
    case .restricted: return .restricted
    case .unavailable: return .unavailable
    }
  }
}

struct ReminderInput {
  let id: String
  let title: String
  let isCompleted: Bool
  let due: DateComponents?
}

struct RemindersDay: Equatable {
  let date: String
  let timeZone: TimeZone
  let start: Date
  let end: Date

  init(now: Date, timeZone: TimeZone) throws {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let start = calendar.startOfDay(for: now)
    guard let end = calendar.date(byAdding: .day, value: 1, to: start), end > start else {
      throw RemindersFailure.readFailed
    }
    self.date = Self.dateString(start, calendar: calendar)
    self.timeZone = timeZone
    self.start = start
    self.end = end
  }

  static func dateString(_ date: Date, calendar: Calendar) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
  }

  var payload: [String: Any] {
    ["date": date, "timeZone": timeZone.identifier,
     "startsAt": start.timeIntervalSince1970 * 1000,
     "endsAt": end.timeIntervalSince1970 * 1000]
  }
}

struct DueReminderRow {
  let id: String
  let title: String
  let date: String?
  let instant: Date?

  var payload: [String: Any] {
    let due: [String: Any]
    if let date = date { due = ["kind": "date-only", "date": date] }
    else { due = ["kind": "timed", "at": instant!.timeIntervalSince1970 * 1000] }
    return ["id": id, "title": title, "due": due]
  }
}

enum RemindersFilter {
  static func rows(_ inputs: [ReminderInput], day: RemindersDay) throws -> [DueReminderRow] {
    var rows: [DueReminderRow] = []
    var ids = Set<String>()
    for input in inputs where !input.isCompleted {
      guard var parts = input.due else { continue }
      guard parts.year != nil, parts.month != nil, parts.day != nil else {
        throw RemindersFailure.readFailed
      }
      let timed = parts.hour != nil || parts.minute != nil || parts.second != nil
      // Preserve the source calendar. Date-only values are civil dates: their
      // time zone must never move them to yesterday/tomorrow in the local zone.
      var calendar = parts.calendar ?? Calendar(identifier: .gregorian)
      calendar.timeZone = timed ? (parts.timeZone ?? day.timeZone) : day.timeZone
      parts.calendar = calendar
      parts.timeZone = calendar.timeZone
      guard parts.isValidDate(in: calendar), let instant = calendar.date(from: parts) else {
        throw RemindersFailure.readFailed
      }
      // Foundation normalizes nonexistent DST wall times. Reject those instead
      // of silently assigning the reminder a different due time.
      let components: [Calendar.Component] = [.era, .year, .month, .day, .hour, .minute, .second]
      guard components.allSatisfy({ component in
        guard let expected = parts.value(for: component) else { return true }
        return calendar.component(component, from: instant) == expected
      }) else { throw RemindersFailure.readFailed }
      var gregorian = Calendar(identifier: .gregorian)
      gregorian.timeZone = day.timeZone
      let date = RemindersDay.dateString(instant, calendar: gregorian)
      guard timed ? (instant >= day.start && instant < day.end) : date == day.date else { continue }
      guard !input.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            ids.insert(input.id).inserted else { throw RemindersFailure.readFailed }
      rows.append(DueReminderRow(id: input.id, title: input.title,
                                 date: timed ? nil : date, instant: timed ? instant : nil))
    }
    return rows.sorted { left, right in
      switch (left.instant, right.instant) {
      case (nil, nil): return left.id < right.id
      case (nil, _): return true
      case (_, nil): return false
      case let (a?, b?): return a == b ? left.id < right.id : a < b
      }
    }
  }
}

// The adapter delivers callbacks on the main queue. Tests use a controlled
// store; no EventKit store or OS permission is needed to test this coordinator.
protocol RemindersStore {
  func authorization() -> RemindersAccess
  func requestAccess(_ completion: @escaping (Bool) -> Void)
  func fetch(_ completion: @escaping ([ReminderInput]?) -> Void)
}

final class RemindersReader {
  private let store: RemindersStore
  private let isActive: () -> Bool
  private let currentDay: () throws -> RemindersDay
  private var busy = false

  init(store: RemindersStore, isActive: @escaping () -> Bool,
       currentDay: @escaping () throws -> RemindersDay = {
         try RemindersDay(now: Date(), timeZone: .current)
       }) {
    self.store = store
    self.isActive = isActive
    self.currentDay = currentDay
  }

  func getAuthorizationStatus() -> RemindersAccess { store.authorization() }

  func requestAccess(_ completion: @escaping (Result<RemindersAccess, RemindersFailure>) -> Void) {
    guard !busy, isActive() else { completion(.failure(.busy)); return }
    let access = store.authorization()
    guard access == .notDetermined else { completion(.success(access)); return }
    busy = true
    // No asynchronous hop between the foreground check and the actual request.
    store.requestAccess { failed in
      self.busy = false
      let access = self.store.authorization()
      if failed || access == .notDetermined { completion(.failure(.authorizationFailed)) }
      else { completion(.success(access)) }
    }
  }

  func fetchDueToday(_ completion: @escaping (Result<[String: Any], RemindersFailure>) -> Void) {
    guard !busy else { completion(.failure(.busy)); return }
    if let failure = store.authorization().readFailure { completion(.failure(failure)); return }
    let day: RemindersDay
    do { day = try currentDay() }
    catch { completion(.failure(.readFailed)); return }
    busy = true
    store.fetch { inputs in
      defer { self.busy = false }
      if let failure = self.store.authorization().readFailure { completion(.failure(failure)); return }
      do {
        guard let inputs = inputs, try self.currentDay() == day else { throw RemindersFailure.readFailed }
        let rows = try RemindersFilter.rows(inputs, day: day)
        // Check again after filtering, immediately before publishing content.
        if let failure = self.store.authorization().readFailure { completion(.failure(failure)); return }
        guard try self.currentDay() == day else { throw RemindersFailure.readFailed }
        completion(.success(["day": day.payload, "reminders": rows.map { $0.payload }]))
      } catch { completion(.failure(.readFailed)) }
    }
  }
}
