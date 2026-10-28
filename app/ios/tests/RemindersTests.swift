import XCTest
import EventKit

final class RemindersTests: XCTestCase {
  private func instant(_ value: String) -> Date { ISO8601DateFormatter().date(from: value)! }
  private func day(_ value: String = "2026-10-27T12:00:00Z", zone: String = "Europe/Malta") throws -> RemindersDay {
    try RemindersDay(now: instant(value), timeZone: TimeZone(identifier: zone)!)
  }
  private func due(_ year: Int = 2026, _ month: Int = 10, _ day: Int = 27,
                   hour: Int? = nil, minute: Int? = nil, zone: String? = nil) -> DateComponents {
    var value = DateComponents(year: year, month: month, day: day, hour: hour, minute: minute)
    value.timeZone = zone.flatMap(TimeZone.init(identifier:))
    return value
  }
  private func input(_ id: String, _ due: DateComponents?, completed: Bool = false) -> ReminderInput {
    ReminderInput(id: id, title: "Synthetic task", isCompleted: completed, due: due)
  }

  func testCalendarDayBoundariesIncludeDSTShortAndLongDays() throws {
    let short = try day("2026-03-29T12:00:00Z")
    let long = try day("2026-10-25T12:00:00Z")
    XCTAssertEqual(short.end.timeIntervalSince(short.start), 23 * 3600)
    XCTAssertEqual(long.end.timeIntervalSince(long.start), 25 * 3600)
    XCTAssertEqual(short.date, "2026-03-29")
    XCTAssertEqual(long.date, "2026-10-25")
  }

  func testMembershipAndOrderingUseCompletionFlagAndExclusiveEnd() throws {
    let rows = try RemindersFilter.rows([
      input("late", due(hour: 23, minute: 59)), input("early-z", due(hour: 0)),
      input("early-a", due(hour: 0)), input("all-z", due()), input("all-a", due()),
      input("tomorrow", due(2026, 10, 28, hour: 0)), input("yesterday", due(2026, 10, 26)),
      input("undated", nil), input("completed", due(), completed: true)
    ], day: day())
    XCTAssertEqual(rows.map(\.id), ["all-a", "all-z", "early-a", "early-z", "late"])
    XCTAssertEqual(rows[0].date, "2026-10-27")
    XCTAssertNil(rows[0].instant)
    XCTAssertEqual(rows[2].instant, try day().start)
    XCTAssertEqual((rows[0].payload["due"] as? [String: String])?["kind"], "date-only")
    XCTAssertEqual((rows[2].payload["due"] as? [String: Any])?["kind"] as? String, "timed")
  }

  func testFloatingAndExplicitTimeZonesAndDateOnlyStayDistinct() throws {
    let rows = try RemindersFilter.rows([
      input("floating", due(hour: 9)), input("utc", due(hour: 9, zone: "Etc/UTC")),
      input("previous-local", due(hour: 0, zone: "Asia/Tokyo")),
      input("next-local", due(hour: 23, zone: "America/New_York")),
      input("all-day", due(zone: "Pacific/Kiritimati"))
    ], day: day())
    XCTAssertEqual(rows.map(\.id), ["all-day", "floating", "utc"])
    XCTAssertEqual(rows[1].instant, instant("2026-10-27T08:00:00Z"))
    XCTAssertEqual(rows[2].instant, instant("2026-10-27T09:00:00Z"))
  }

  func testNativeCalendarIsConvertedToGregorianWithoutRelabelling() throws {
    var buddhist = due(2569, 10, 27)
    buddhist.calendar = Calendar(identifier: .buddhist)
    let rows = try RemindersFilter.rows([input("other-calendar", buddhist)], day: day())
    XCTAssertEqual(rows.first?.date, "2026-10-27")
  }

  func testInvalidDatesAndNonexistentDSTTimesFailInsteadOfNormalizing() throws {
    for invalid in [due(2026, 2, 29), due(2026, 13, 1), due(hour: 24), DateComponents(month: 10, day: 27)] {
      XCTAssertThrowsError(try RemindersFilter.rows([input("invalid", invalid)], day: day()))
    }
    XCTAssertThrowsError(try RemindersFilter.rows([input("gap", due(2026, 3, 29, hour: 2, minute: 30))],
                                                 day: day("2026-03-29T12:00:00Z")))
    let leap = try RemindersFilter.rows([input("leap", due(2028, 2, 29))], day: day("2028-02-29T12:00:00Z"))
    XCTAssertEqual(leap.count, 1)
  }

  func testRepeatedDSTHourResolvesDeterministically() throws {
    let value = input("overlap", due(2026, 10, 25, hour: 2, minute: 30))
    let a = try RemindersFilter.rows([value], day: day("2026-10-25T12:00:00Z"))
    let b = try RemindersFilter.rows([value], day: day("2026-10-25T12:00:00Z"))
    XCTAssertEqual(a.count, 1)
    XCTAssertEqual(a.first?.instant, b.first?.instant)
  }

  func testDuplicateAndBlankIdentifiersFailRatherThanReturnInvalidSnapshot() throws {
    XCTAssertThrowsError(try RemindersFilter.rows([input("same", due()), input("same", due())], day: day()))
    XCTAssertThrowsError(try RemindersFilter.rows([input(" \n", due())], day: day()))
  }

  func testEventKitAuthorizationMappingFailsClosed() {
    XCTAssertEqual(EventKitRemindersStore.access(.notDetermined), .notDetermined)
    XCTAssertEqual(EventKitRemindersStore.access(.denied), .denied)
    XCTAssertEqual(EventKitRemindersStore.access(.restricted), .restricted)
    if #available(macOS 14.0, iOS 17.0, *) {
      XCTAssertEqual(EventKitRemindersStore.access(.fullAccess), .authorized)
      XCTAssertEqual(EventKitRemindersStore.access(.writeOnly), .unavailable)
    }
    XCTAssertEqual(EventKitRemindersStore.access(EKAuthorizationStatus(rawValue: 999)!), .unavailable)
  }

  private final class Store: RemindersStore {
    var access: RemindersAccess = .notDetermined
    var requests = 0
    var reads = 0
    var requestCompletion: ((Bool) -> Void)?
    var fetchCompletion: (([ReminderInput]?) -> Void)?
    func authorization() -> RemindersAccess { access }
    func requestAccess(_ completion: @escaping (Bool) -> Void) {
      requests += 1; requestCompletion = completion
    }
    func fetch(_ completion: @escaping ([ReminderInput]?) -> Void) {
      reads += 1; fetchCompletion = completion
    }
  }

  private func failure<T>(_ result: Result<T, RemindersFailure>) -> RemindersFailure? {
    if case .failure(let error) = result { return error }
    XCTFail("Expected a failure"); return nil
  }

  func testStatusAndUnauthorizedReadsNeverPromptOrQuery() throws {
    let store = Store()
    let today = try day()
    let reader = RemindersReader(store: store, isActive: { true }, currentDay: { today })
    for access in [RemindersAccess.notDetermined, .denied, .restricted, .unavailable] {
      store.access = access
      XCTAssertEqual(reader.getAuthorizationStatus(), access)
      var called = false
      reader.fetchDueToday { called = true; XCTAssertEqual(self.failure($0), access.readFailure) }
      XCTAssertTrue(called)
    }
    XCTAssertEqual(store.requests, 0)
    XCTAssertEqual(store.reads, 0)
  }

  func testRequestRequiresForegroundRejectsBusyAndReturnsNormalizedDenial() {
    let store = Store()
    var active = false
    let reader = RemindersReader(store: store, isActive: { active })
    reader.requestAccess { XCTAssertEqual(self.failure($0), .busy) }
    XCTAssertEqual(store.requests, 0)
    active = true
    var outcome: RemindersAccess?
    reader.requestAccess { outcome = try? $0.get() }
    reader.requestAccess { XCTAssertEqual(self.failure($0), .busy) }
    reader.fetchDueToday { XCTAssertEqual(self.failure($0), .busy) }
    XCTAssertEqual(store.requests, 1)
    store.access = .denied
    store.requestCompletion?(false)
    XCTAssertEqual(outcome, .denied)
    reader.requestAccess { XCTAssertEqual(try? $0.get(), .denied) }
    XCTAssertEqual(store.requests, 1)
  }

  func testPermissionOperationalFailureAndUnresolvedStatus() {
    for failed in [true, false] {
      let store = Store()
      let reader = RemindersReader(store: store, isActive: { true })
      var result: RemindersFailure?
      reader.requestAccess { result = self.failure($0) }
      store.requestCompletion?(failed)
      XCTAssertEqual(result, .authorizationFailed)
    }
  }

  func testPermissionGrantAndExistingStatesDoNotQuery() {
    let store = Store()
    let reader = RemindersReader(store: store, isActive: { true })
    var result: RemindersAccess?
    reader.requestAccess { result = try? $0.get() }
    store.access = .authorized
    store.requestCompletion?(false)
    XCTAssertEqual(result, .authorized)
    for access in [RemindersAccess.authorized, .restricted, .unavailable] {
      store.access = access
      reader.requestAccess { XCTAssertEqual(try? $0.get(), access) }
    }
    XCTAssertEqual(store.requests, 1)
    XCTAssertEqual(store.reads, 0)
  }

  func testRevocationAtCompletionWinsOverDataOrNilQuery() throws {
    for revoked in [RemindersAccess.denied, .restricted, .notDetermined, .unavailable] {
      let store = Store(); store.access = .authorized
      let today = try day()
      let reader = RemindersReader(store: store, isActive: { true }, currentDay: { today })
      var result: RemindersFailure?
      reader.fetchDueToday { result = self.failure($0) }
      store.access = revoked
      store.fetchCompletion?([input("synthetic", due())])
      XCTAssertEqual(result, revoked.readFailure)
      XCTAssertEqual(store.requests, 0)
    }
  }

  func testNilQueryFailsButAuthorizedEmptySucceedsAndReleasesBusyState() throws {
    let store = Store(); store.access = .authorized
    let today = try day()
    let reader = RemindersReader(store: store, isActive: { true }, currentDay: { today })
    var error: RemindersFailure?
    reader.fetchDueToday { error = self.failure($0) }
    reader.requestAccess { XCTAssertEqual(self.failure($0), .busy) }
    store.fetchCompletion?(nil)
    XCTAssertEqual(error, .readFailed)
    var payload: [String: Any]?
    reader.fetchDueToday { payload = try? $0.get() }
    store.fetchCompletion?([])
    XCTAssertEqual((payload?["reminders"] as? [[String: Any]])?.count, 0)
    XCTAssertEqual((payload?["day"] as? [String: Any])?["date"] as? String, today.date)
  }

  func testMidnightAndTimeZoneChangesRejectOldSnapshots() throws {
    for changed in [try day("2026-10-28T12:00:00Z"), try day(zone: "Europe/London")] {
      let store = Store(); store.access = .authorized
      var today = try day()
      let reader = RemindersReader(store: store, isActive: { true }, currentDay: { today })
      var result: RemindersFailure?
      reader.fetchDueToday { result = self.failure($0) }
      today = changed
      store.fetchCompletion?([])
      XCTAssertEqual(result, .readFailed)
    }
  }
}
