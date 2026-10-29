import EventKit
import Foundation

final class EventKitCalendarStore: CalendarEventStore {
  private var eventStore: EKEventStore?
  private let worker = DispatchQueue(label: "com.personalos.calendar.read", qos: .userInitiated)

  static func access(_ status: EKAuthorizationStatus) -> CalendarAccess {
    if #available(iOS 17.0, macOS 14.0, *) {
      if status == .fullAccess { return .authorized }
      if status == .writeOnly { return .writeOnly }
    } else if status == .authorized { return .authorized }
    switch status {
    case .notDetermined: return .notDetermined
    case .denied: return .denied
    case .restricted: return .restricted
    default: return .unavailable
    }
  }

  func authorization() -> CalendarAccess {
    Self.access(EKEventStore.authorizationStatus(for: .event))
  }

  // Called only from the main-confined coordinator, while its gate is held.
  // Store creation/request occurs on main; ownership transfers exclusively to
  // the serial worker for reads and returns before the completion is delivered.
  private func store() -> EKEventStore {
    dispatchPrecondition(condition: .onQueue(.main))
    if let eventStore = eventStore { return eventStore }
    let created = EKEventStore()
    eventStore = created
    return created
  }

  func requestAccess(_ completion: @escaping (Bool) -> Void) {
    let handler: EKEventStoreRequestAccessCompletionHandler = { _, error in
      let failed = error != nil
      DispatchQueue.main.async { completion(failed) }
    }
    if #available(iOS 17.0, macOS 14.0, *) {
      store().requestFullAccessToEvents(completion: handler)
    } else {
      store().requestAccess(to: .event, completion: handler)
    }
  }

  func fetch(day: CalendarDay, completion: @escaping (Result<[CalendarEventRow], CalendarFailure>) -> Void) {
    let store = self.store()
    worker.async {
      let result: Result<[CalendarEventRow], CalendarFailure>
      do {
        if let error = self.authorization().readFailure { throw error }
        let predicate = store.predicateForEvents(withStart: day.start, end: day.end, calendars: nil)
        // EventKit's synchronous API has no NSError channel. Authorization and
        // data validation are checked independently; never manufacture success
        // from an observed failure. No EKEvent objects survive this operation.
        let inputs = store.events(matching: predicate).map { event in
          CalendarEventInput(calendarID: event.calendar?.calendarIdentifier,
            eventID: event.eventIdentifier, occurrence: event.occurrenceDate,
            recurring: event.hasRecurrenceRules || event.isDetached,
            title: event.title, start: event.startDate, end: event.endDate,
            allDay: event.isAllDay, canceled: event.status == .canceled)
        }
        if let error = self.authorization().readFailure { throw error }
        result = .success(try CalendarProjection.rows(inputs, day: day))
      } catch { result = .failure(.readFailed) }
      DispatchQueue.main.async { completion(result) }
    }
  }
}
