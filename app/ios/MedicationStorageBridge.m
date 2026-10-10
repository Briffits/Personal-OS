#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MedicationStorage, NSObject)
RCT_EXTERN_METHOD(read:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(mutate:(nonnull NSNumber *)revision command:(NSDictionary *)command
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
