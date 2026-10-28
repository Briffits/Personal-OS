#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(HealthMedications, NSObject)
RCT_EXTERN_METHOD(requestAccess:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(readMedications:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
