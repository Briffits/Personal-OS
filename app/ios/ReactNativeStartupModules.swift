// Preserve the generated eager list except for RN's unused demonstration module.
func personalOSModulesRequiringMainQueueSetup(_ modules: [String]) -> [String] {
  modules.filter { $0 != "SampleTurboModule" }
}
