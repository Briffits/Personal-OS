#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(Reminders, NSObject)
RCT_EXTERN_METHOD(getAuthorizationStatus:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(requestAccess:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(fetchDueToday:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
