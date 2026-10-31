import Foundation
import EventKit

private var checks = 0
private func check(_ value: Bool, _ message: String) {
  checks += 1
  if !value { fatalError("Calendar test failed: \(message)") }
}
private func date(_ value: String) -> Date { ISO8601DateFormatter().date(from: value)! }
private func day(_ value: String = "2026-10-29T12:00:00Z", _ zone: String = "UTC") throws -> CalendarDay {
  try CalendarDay(now: date(value), timeZone: TimeZone(identifier: zone)!)
}
private func input(_ id: String? = "event", _ start: String = "2026-10-29T12:00:00Z",
                   _ end: String = "2026-10-29T13:00:00Z", calendar: String? = "calendar",
                   title: String? = "Synthetic event", allDay: Bool = false,
                   recurring: Bool = false, occurrence: String? = nil,
                   canceled: Bool = false) -> CalendarEventInput {
  CalendarEventInput(calendarID: calendar, eventID: id, occurrence: occurrence.map(date),
    recurring: recurring, title: title, start: date(start), end: date(end), allDay: allDay, canceled: canceled)
}
private func fails(_ message: String, _ body: () throws -> Void) {
  do { try body(); check(false, message) } catch { check(true, message) }
}
private func error<T>(_ result: Result<T, CalendarFailure>?) -> CalendarFailure? {
  if case let .failure(value)? = result { return value }; return nil
}
private final class FakeStore: CalendarEventStore {
  var status: CalendarAccess = .authorized
  var requests = 0
  var reads = 0
  var readCallbacks: [(Result<[CalendarEventRow], CalendarFailure>) -> Void] = []
  var requestCallbacks: [(Bool) -> Void] = []
  func authorization() -> CalendarAccess { status }
  func requestAccess(_ completion: @escaping (Bool) -> Void) {
    requests += 1; requestCallbacks.append(completion)
  }
  func fetch(day: CalendarDay, completion: @escaping (Result<[CalendarEventRow], CalendarFailure>) -> Void) {
    reads += 1; readCallbacks.append(completion)
  }
}
private final class Harness {
  let store = FakeStore()
  var active = true
  var current = try! day()
  var dayFails = false
  var deadlines: [() -> Void] = []
  var results: [Result<[String: Any], CalendarFailure>] = []
  var accessResults: [Result<CalendarAccess, CalendarFailure>] = []
  lazy var reader = CalendarReader(store: store, isActive: { self.active }, currentDay: {
    if self.dayFails { throw CalendarFailure.readFailed }; return self.current
  }, schedule: { seconds, callback in
    check(seconds == 30, "bounded 30 second deadline")
    self.deadlines.append(callback)
    return {} // Deliberately allow canceled timers to fire to test token guards.
  })
  func fetch() { reader.fetchToday { self.results.append($0) } }
  func request() { reader.requestAccess { self.accessResults.append($0) } }
}

@main
enum CalendarTests {
  static func main() throws {
    let today = try day()
    for (instant, zone, hours) in [
      ("2026-03-08T12:00:00Z", "America/New_York", 23.0),
      ("2026-11-01T12:00:00Z", "America/New_York", 25.0),
      ("2026-03-29T12:00:00Z", "Europe/Malta", 23.0),
      ("2026-10-25T12:00:00Z", "Europe/Malta", 25.0),
      ("2026-10-04T12:00:00Z", "Australia/Lord_Howe", 23.5),
      ("2026-04-05T12:00:00Z", "Australia/Lord_Howe", 24.5),
      ("2026-10-29T12:00:00Z", "Asia/Kathmandu", 24.0)] {
      let local = try day(instant, zone)
      check(local.end.timeIntervalSince(local.start) == hours * 3600, "native DST day length")
      check(local.start <= date(instant) && date(instant) < local.end, "day contains now")
    }
    var historical = Calendar(identifier: .gregorian)
    historical.timeZone = TimeZone(secondsFromGMT: 0)!
    let julianLeap = historical.date(from: DateComponents(year: 1500, month: 2, day: 29))!
    fails("historical non-Gregorian leap date rejected") {
      _ = try CalendarDay.civilDate(julianLeap, calendar: historical)
    }
    let gregorianLeap = historical.date(from: DateComponents(year: 1600, month: 2, day: 29))!
    check(try CalendarDay.civilDate(gregorianLeap, calendar: historical) == "1600-02-29", "Gregorian century leap accepted")
    let west = try day("2026-10-29T00:30:00Z", "America/Los_Angeles")
    check(west.date == "2026-10-28", "local day is not UTC day")
    let leap = try day("2024-02-29T12:00:00Z")
    check(leap.date == "2024-02-29", "leap day")
    let skipped = try day("2011-12-29T12:00:00Z", "Pacific/Apia")
    check(try CalendarDay.civilDate(skipped.end, calendar: skipped.calendar) == "2011-12-31", "skipped civil day")
    let bounds = [input("ends-midnight", "2026-10-28T23:00:00Z", "2026-10-29T00:00:00Z"),
      input("tomorrow", "2026-10-30T00:00:00Z", "2026-10-30T01:00:00Z"),
      input("point", "2026-10-29T00:00:00Z", "2026-10-29T00:00:00Z"),
      input("tomorrow-point", "2026-10-30T00:00:00Z", "2026-10-30T00:00:00Z"),
      input("overnight", "2026-10-28T23:00:00Z", "2026-10-29T01:00:00Z"),
      input("past-today", "2026-10-29T01:00:00Z", "2026-10-29T02:00:00Z"),
      input("multi-day", "2026-10-28T01:00:00Z", "2026-10-31T02:00:00Z")]
    let rows = try CalendarProjection.rows(bounds, day: today)
    check(rows.count == 4, "half-open overlap and point membership")
    check(rows.first!.time == .timed(date("2026-10-28T01:00:00Z").timeIntervalSince1970 * 1000,
      date("2026-10-31T02:00:00Z").timeIntervalSince1970 * 1000), "full multi-day span retained")
    let all = input("all", "2026-10-28T07:00:00Z", "2026-10-30T07:00:00Z", allDay: true)
    let allRows = try CalendarProjection.rows([all, input("timed")], day: west)
    check(allRows.count == 1 && allRows[0].time == .allDay("2026-10-28", "2026-10-30"), "local all-day full civil span")
    let dstDay = try day("2026-03-08T12:00:00Z", "America/New_York")
    let dstAll = input("dst", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z", allDay: true)
    check(try CalendarProjection.rows([dstAll], day: dstDay)[0].time == .allDay("2026-03-08", "2026-03-09"), "23h all-day civil dates")
    check(try CalendarProjection.rows([input("old", "2026-10-28T00:00:00Z", "2026-10-29T00:00:00Z", allDay: true)], day: today).isEmpty, "exclusive all-day end")
    fails("inverted interval") { _ = try CalendarProjection.rows([input("bad", "2026-10-29T13:00:00Z", "2026-10-29T12:00:00Z")], day: today) }
    fails("zero all-day") { _ = try CalendarProjection.rows([input("bad", "2026-10-29T00:00:00Z", "2026-10-29T00:00:00Z", allDay: true)], day: today) }
    fails("invalid native date") { _ = try CalendarDay.milliseconds(Date(timeIntervalSince1970: .nan)) }
    fails("outside JS date range") { _ = try CalendarDay.milliseconds(Date(timeIntervalSince1970: 9e12)) }
    fails("outside civil year range") { _ = try CalendarDay.civilDate(Date(timeIntervalSince1970: 3e11), calendar: today.calendar) }
    // Positive all-day raw intervals cover exactly the intersected civil days.
    // Values are wholly synthetic, not inferred from diagnostic endpoint labels.
    for (zone, instant) in [
      ("UTC", "2026-10-29T12:00:00Z"),
      ("Europe/Malta", "2026-03-29T12:00:00Z"), ("Europe/Malta", "2026-10-25T12:00:00Z"),
      ("America/New_York", "2026-03-08T12:00:00Z"), ("America/New_York", "2026-11-01T12:00:00Z"),
      ("Australia/Lord_Howe", "2026-10-04T12:00:00Z"), ("Australia/Lord_Howe", "2026-04-05T12:00:00Z"),
      ("America/Sao_Paulo", "2018-11-04T12:00:00Z"), ("Pacific/Apia", "2011-12-29T12:00:00Z"),
      ("Asia/Kathmandu", "2026-10-29T12:00:00Z")
    ] {
      let local = try day(instant, zone), calendar = local.calendar
      let later = calendar.dateInterval(of: .day, for: local.end)!.end
      let spans = [(local.start, local.start.addingTimeInterval(1)),
        (local.start, local.end.addingTimeInterval(-1)), (local.start, local.end),
        (local.start, local.end.addingTimeInterval(1)), (local.start, later),
        (local.start.addingTimeInterval(1), local.end.addingTimeInterval(-1)),
        (local.start, later.addingTimeInterval(-1))]
      for (start, end) in spans {
        let value = CalendarEventInput(calendarID: "synthetic", eventID: "synthetic",
          occurrence: nil, recurring: false, title: "Synthetic", start: start, end: end, allDay: true, canceled: false)
        let projected = try CalendarProjection.rows([value], day: local)
        let expectedEnd = try CalendarDay.civilDate(end <= local.end ? local.end : later, calendar: calendar)
        check(projected.count == 1 && projected[0].time == .allDay(local.date, expectedEnd),
              "positive same/multi-day span and exact boundary without extra day")
        for offset in -1...3 {
          let point = calendar.date(byAdding: .day, value: offset, to: local.start)!
          let checkedDay = try CalendarDay(now: point, timeZone: local.timeZone)
          let rawOverlap = start < checkedDay.end && end > checkedDay.start
          let rows = try CalendarProjection.rows([value], day: checkedDay)
          check(rows.count == (rawOverlap ? 1 : 0), "all-day civil membership equals raw half-open overlap")
          if let row = rows.first { check(row.time == projected[0].time, "full span stable on each included day") }
        }
      }
      for (start, end) in [(local.start, local.start),
        (local.start.addingTimeInterval(1), local.start.addingTimeInterval(1)), (local.end, local.start)] {
        let invalid = CalendarEventInput(calendarID: "synthetic", eventID: "invalid", occurrence: nil,
          recurring: false, title: nil, start: start, end: end, allDay: true, canceled: false)
        fails("zero or reversed all-day rejected before ceiling") { _ = try CalendarProjection.rows([invalid], day: local) }
      }
    }
    let recurringAll = input("series", "2026-10-29T00:00:00Z", "2026-10-29T13:00:00Z", allDay: true,
      recurring: true, occurrence: "2026-10-29T00:00:00Z")
    let detachedAll = input("series", "2026-10-29T00:00:00Z", "2026-10-29T13:00:00Z", allDay: true,
      recurring: true, occurrence: "2026-10-28T00:00:00Z")
    let recurrenceRows = try CalendarProjection.rows([recurringAll, detachedAll], day: today)
    check(recurrenceRows.count == 2 && recurrenceRows[0].id != recurrenceRows[1].id,
          "normalized all-day occurrences retain separate raw original identity")
    let extendedEnd = input("series", "2026-10-29T00:00:00Z", "2026-10-30T13:00:00Z", allDay: true,
      recurring: true, occurrence: "2026-10-29T00:00:00Z")
    check(try CalendarProjection.rows([recurringAll], day: today)[0].id == CalendarProjection.rows([extendedEnd], day: today)[0].id,
          "exclusive-end conversion never changes occurrence identity")
    check(try CalendarProjection.rows([recurringAll, recurringAll], day: today).count == 1, "identical normalized occurrence still deduplicated")
    fails("different normalized spans for same occurrence still conflict") {
      _ = try CalendarProjection.rows([recurringAll, extendedEnd], day: today)
    }
    let invalidAll = CalendarEventInput(calendarID: "synthetic", eventID: "invalid", occurrence: nil,
      recurring: false, title: nil, start: today.start, end: Date(timeIntervalSince1970: .infinity), allDay: true, canceled: false)
    fails("nonfinite all-day endpoint still rejected") { _ = try CalendarProjection.rows([invalidAll], day: today) }
    let canceled = input(nil, canceled: true)
    check(try CalendarProjection.rows([canceled], day: today).isEmpty, "canceled excluded")
    check(try CalendarProjection.rows([input(title: nil)], day: today)[0].title == "", "missing title")
    for row in [input(nil), input(""), input(calendar: nil), input(calendar: " "), input(recurring: true)] {
      fails("missing required identity") { _ = try CalendarProjection.rows([row], day: today) }
    }
    let original = "2026-10-28T12:00:00Z"
    let moved = input(recurring: true, occurrence: original)
    let series = input(recurring: true, occurrence: "2026-10-29T12:00:00Z")
    let recurringRows = try CalendarProjection.rows([moved, series], day: today)
    check(recurringRows.count == 2 && recurringRows[0].id != recurringRows[1].id, "occurrences distinct")
    let movedAgain = input("event", "2026-10-29T14:00:00Z", "2026-10-29T15:00:00Z", recurring: true, occurrence: original)
    check(try CalendarProjection.rows([moved], day: today)[0].id == CalendarProjection.rows([movedAgain], day: today)[0].id, "detached original identity stable")
    check(try CalendarProjection.rows([input(), input()], day: today).count == 1, "identical rows collapse")
    fails("conflicting title") { _ = try CalendarProjection.rows([input(), input(title: "Different")], day: today) }
    fails("conflicting time") { _ = try CalendarProjection.rows([input(), input("event", "2026-10-29T12:00:00Z", "2026-10-29T14:00:00Z")], day: today) }
    fails("Unicode title wire conflict") { _ = try CalendarProjection.rows([input(title: "é"), input(title: "e\u{301}")], day: today) }
    let distinct = try CalendarProjection.rows([input("é"), input("e\u{301}"), input(calendar: "other"), input()], day: today)
    check(distinct.count == 4, "distinct IDs preserved without Unicode normalization")
    let escaped = try CalendarProjection.rows([input("a,b", calendar: "c"), input("b", calendar: "c,a"), input("\"[]\\")], day: today)
    check(escaped.count == 3, "tuple delimiters escaped")
    let ordered = try CalendarProjection.rows([input("z"), input("a"), input("all", "2026-10-29T00:00:00Z", "2026-10-30T00:00:00Z", allDay: true)], day: today)
    check(ordered[0].id.contains("all") && ordered[1].id.contains("\"a\""), "all-day first, ordinal tie-break")
    check(CalendarProjection.ordinal("😀", "\u{E000}"), "UTF16 ordinal ordering")
    let completeOrder = try CalendarProjection.rows([
      input("late", "2026-10-29T15:00:00Z", "2026-10-29T16:00:00Z"),
      input("long", "2026-10-29T12:00:00Z", "2026-10-29T14:00:00Z"), input("short"),
      input("later-all", "2026-10-29T00:00:00Z", "2026-10-30T00:00:00Z", allDay: true),
      input("long-all", "2026-10-28T00:00:00Z", "2026-10-31T00:00:00Z", allDay: true),
      input("short-all", "2026-10-28T00:00:00Z", "2026-10-30T00:00:00Z", allDay: true)
    ], day: today)
    let orderedIDs = try completeOrder.map {
      try JSONSerialization.jsonObject(with: Data($0.id.utf8)) as! [Any]
    }.map { $0[1] as! String }
    check(orderedIDs == ["short-all", "long-all", "later-all", "short", "long", "late"], "every ordering key")
    let wire = try JSONSerialization.data(withJSONObject: ["day": today.payload, "events": completeOrder.map { $0.payload }])
    let decoded = try JSONSerialization.jsonObject(with: wire) as! [String: Any]
    check(Set(decoded.keys) == Set(["day", "events"]), "snapshot wire shape")
    let wireRows = decoded["events"] as! [[String: Any]]
    check(wireRows.allSatisfy { Set($0.keys) == Set(["occurrenceId", "title", "time"]) }, "only allowed event fields")
    check(Set((decoded["day"] as! [String: Any]).keys) == Set(["date", "timeZone", "startsAt", "endsAt"]), "day wire shape")
    let identity = try JSONSerialization.jsonObject(with: Data(CalendarProjection.rows([moved], day: today)[0].id.utf8)) as! [Any]
    check((identity[2] as! Double) == date(original).timeIntervalSince1970 * 1000, "identity uses original occurrence milliseconds")
    let nonrecurringIdentity = try JSONSerialization.jsonObject(with: Data(CalendarProjection.rows([input()], day: today)[0].id.utf8)) as! [Any]
    check(nonrecurringIdentity[2] is NSNull, "nonrecurring null discriminator")
    let missingStart = CalendarEventInput(calendarID: "c", eventID: "e", occurrence: nil, recurring: false,
      title: nil, start: nil, end: today.end, allDay: false, canceled: false)
    fails("missing native endpoint") { _ = try CalendarProjection.rows([missingStart], day: today) }

    for status in CalendarAccess.allCases {
      let h = Harness(); h.store.status = status
      check(h.reader.getAuthorizationStatus() == status, "normalized status")
      check(h.store.reads == 0 && h.store.requests == 0, "status does no work")
      h.fetch()
      if status == .authorized {
        h.store.readCallbacks[0](.success([]))
        check(error(h.results.last) == nil, "authorized empty is success")
      } else {
        check(error(h.results.last) == status.readFailure && h.store.reads == 0, "nonfull access never queries")
      }
      check(h.store.requests == 0, "fetch never prompts")
    }
    for status in [CalendarAccess.authorized, .denied, .restricted, .unavailable] {
      let h = Harness(); h.store.status = status; h.request()
      check(h.store.requests == 0 && (try? h.accessResults[0].get()) == status, "terminal status no prompt")
    }
    for status in [CalendarAccess.notDetermined, .writeOnly] {
      let h = Harness(); h.store.status = status; h.active = false; h.request()
      check(error(h.accessResults.last) == .busy && h.store.requests == 0, "background prompt rejected")
      h.active = true; h.request(); h.request(); h.fetch()
      check(h.store.requests == 1 && error(h.accessResults.last) == .busy && error(h.results.last) == .busy, "request overlap rejected")
      h.store.status = .authorized; h.store.requestCallbacks[0](false)
      check((try? h.accessResults.last!.get()) == .authorized, "normalized resulting request status")
    }
    do {
      let h = Harness(); h.store.status = .notDetermined; h.request()
      h.store.status = .denied; h.store.requestCallbacks[0](false)
      check((try? h.accessResults.last!.get()) == .denied, "callback Boolean not treated as grant")
    }
    for failed in [false, true] {
      let h = Harness(); h.store.status = .notDetermined; h.request(); h.store.requestCallbacks[0](failed)
      check(error(h.accessResults.last) == .authorizationFailed, "request operational failure")
    }
    do {
      let h = Harness(); h.store.status = .writeOnly; h.request()
      h.store.status = .authorized; h.store.requestCallbacks[0](true)
      check(error(h.accessResults.last) == .authorizationFailed, "OS error takes precedence over changed status")
    }
    do {
      let h = Harness(); h.fetch(); h.fetch(); h.request()
      check(h.store.reads == 1 && error(h.results.last) == .busy && error(h.accessResults.last) == .busy, "read gate")
      h.deadlines[0](); check(error(h.results.last) == .readFailed, "timeout settles")
      h.fetch(); check(error(h.results.last) == .busy, "timeout retains underlying gate")
      let count = h.results.count; h.store.readCallbacks[0](.success([]))
      check(h.results.count == count, "late result discarded")
      h.fetch(); h.store.readCallbacks[0](.success([])); h.deadlines[0]()
      check(h.store.reads == 2 && h.results.count == count, "old callbacks cannot release/settle new read")
      h.store.readCallbacks[1](.success([])); check(h.results.count == count + 1, "new read completes")
    }
    do {
      let h = Harness(); h.store.status = .notDetermined; h.request(); h.deadlines[0](); h.request()
      check(error(h.accessResults[0]) == .authorizationFailed && error(h.accessResults.last) == .busy, "authorization timeout retains gate")
      h.store.status = .authorized; h.store.requestCallbacks[0](false)
      check(h.accessResults.count == 2, "late authorization discarded")
      h.fetch(); check(h.store.reads == 1, "gate releases only on OS completion")
    }
    for status in [CalendarAccess.denied, .writeOnly, .restricted, .notDetermined, .unavailable] {
      let h = Harness(); h.fetch(); h.store.status = status; h.store.readCallbacks[0](.success([]))
      check(error(h.results.last) == status.readFailure, "access loss before publication")
    }
    for changed in [try day("2026-10-30T12:00:00Z"), try day("2026-10-29T12:00:00Z", "Europe/Malta")] {
      let h = Harness(); h.fetch(); h.current = changed; h.store.readCallbacks[0](.success([]))
      check(error(h.results.last) == .readFailed, "day or zone changed during query")
    }
    do {
      let h = Harness(); h.dayFails = true; h.fetch()
      check(error(h.results.last) == .readFailed && h.store.reads == 0, "invalid day before read")
      h.dayFails = false; h.fetch(); h.store.readCallbacks[0](.failure(.readFailed))
      check(error(h.results.last) == .readFailed, "query failure never empty success")
      h.fetch(); h.store.readCallbacks[1](.success([])); h.deadlines.last!()
      check(h.results.count == 3 && error(h.results.last) == nil, "canceled deadline cannot settle twice")
    }
    do {
      let h = Harness(); h.fetch(); h.deadlines[0]()
      // No completion arrives: navigation/remount cannot release a static gate.
      for _ in 0..<3 {
        h.fetch(); h.request()
        check(error(h.results.last) == .busy && error(h.accessResults.last) == .busy,
              "never-returning read keeps every retry gated")
      }
      check(h.reader.getAuthorizationStatus() == .authorized && h.store.reads == 1,
            "status available without restarting timed-out underlying work")
    }
    do {
      let h = Harness(); h.store.status = .notDetermined; h.request(); h.deadlines[0]()
      for _ in 0..<3 { h.request(); check(error(h.accessResults.last) == .busy, "never-returning OS request stays gated") }
      check(h.store.requests == 1, "no repeated permission prompt after timeout")
    }
    // Static SDK mapping only: never construct an EKEventStore or request data.
    check(EventKitCalendarStore.access(.notDetermined) == .notDetermined, "SDK notDetermined")
    check(EventKitCalendarStore.access(.denied) == .denied, "SDK denied")
    check(EventKitCalendarStore.access(.restricted) == .restricted, "SDK restricted")
    if #available(macOS 14.0, *) {
      check(EventKitCalendarStore.access(.fullAccess) == .authorized, "SDK full access")
      check(EventKitCalendarStore.access(.writeOnly) == .writeOnly, "SDK write-only")
    }
    check(EventKitCalendarStore.access(EKAuthorizationStatus(rawValue: 999)!) == .unavailable, "SDK future status fails closed")
    print("Calendar native tests passed: \(checks) assertions; synthetic only, no EventKit store created.")
  }
}
