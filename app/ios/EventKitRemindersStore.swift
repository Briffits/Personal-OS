import EventKit
import Foundation

final class EventKitRemindersStore: RemindersStore {
  // Lazy creation ensures status inspection alone does not create a store.
  private lazy var store = EKEventStore()

  static func access(_ status: EKAuthorizationStatus) -> RemindersAccess {
    if #available(iOS 17.0, macOS 14.0, *) {
      if status == .fullAccess { return .authorized }
      if status == .writeOnly { return .unavailable }
    } else if status == .authorized { return .authorized }
    switch status {
    case .notDetermined: return .notDetermined
    case .denied: return .denied
    case .restricted: return .restricted
    default: return .unavailable
    }
  }

  func authorization() -> RemindersAccess {
    Self.access(EKEventStore.authorizationStatus(for: .reminder))
  }

  func requestAccess(_ completion: @escaping (Bool) -> Void) {
    let handler: EKEventStoreRequestAccessCompletionHandler = { _, error in
      let failed = error != nil
      DispatchQueue.main.async { completion(failed) }
    }
    if #available(iOS 17.0, macOS 14.0, *) {
      store.requestFullAccessToReminders(completion: handler)
    } else {
      store.requestAccess(to: .reminder, completion: handler)
    }
  }

  func fetch(_ completion: @escaping ([ReminderInput]?) -> Void) {
    // Unbounded incomplete predicate avoids losing floating/all-day values to
    // EventKit's range conversion. Our pure filter owns exact day membership.
    let predicate = store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: nil)
    var finished = false
    let token = store.fetchReminders(matching: predicate) { reminders in
      DispatchQueue.main.async {
        guard !finished else { return }
        finished = true
        guard self.authorization() == .authorized else { completion(nil); return }
        completion(reminders?.map {
          ReminderInput(id: $0.calendarItemIdentifier, title: $0.title ?? "",
                        isCompleted: $0.isCompleted, due: $0.dueDateComponents)
        })
      }
    }
    // A hung read must not hold the JS adapter's serial lock indefinitely.
    DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
      guard !finished else { return }
      finished = true
      self.store.cancelFetchRequest(token)
      completion(nil)
    }
  }
}
