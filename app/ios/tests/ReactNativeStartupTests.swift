import XCTest

final class ReactNativeStartupTests: XCTestCase {
  func testRemovesOnlyExactSampleEntriesAndPreservesOrderAndDuplicates() {
    let modules = [
      "SampleTurboModule", "DeviceInfo", "FutureModule", "DeviceInfo",
      "RCTSampleTurboModule", "sampleTurboModule", "SampleTurboModuleExtra",
      " SampleTurboModule", "SampleTurboModule ", "", "SampleTurboModule",
      "StatusBarManager"
    ]

    XCTAssertEqual(personalOSModulesRequiringMainQueueSetup(modules), [
      "DeviceInfo", "FutureModule", "DeviceInfo",
      "RCTSampleTurboModule", "sampleTurboModule", "SampleTurboModuleExtra",
      " SampleTurboModule", "SampleTurboModule ", "", "StatusBarManager"
    ])
  }

  func testPreservesListWhenSampleIsAbsent() {
    let modules = ["FutureModule", "AppState", "FutureModule"]
    XCTAssertEqual(personalOSModulesRequiringMainQueueSetup(modules), modules)
  }

  func testEmptyAndSampleOnlyLists() {
    XCTAssertEqual(personalOSModulesRequiringMainQueueSetup([]), [])
    XCTAssertEqual(personalOSModulesRequiringMainQueueSetup([
      "SampleTurboModule", "SampleTurboModule"
    ]), [])
  }

  func testPreservesReactNative0871CoreModuleOrder() {
    XCTAssertEqual(personalOSModulesRequiringMainQueueSetup([
      "AccessibilityManager", "Appearance", "AppState", "DeviceInfo",
      "PlatformConstants", "SampleTurboModule", "StatusBarManager"
    ]), [
      "AccessibilityManager", "Appearance", "AppState", "DeviceInfo",
      "PlatformConstants", "StatusBarManager"
    ])
  }
}
