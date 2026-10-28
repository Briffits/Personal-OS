import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  goldenScreenPadding,
  layout,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';
import AppCard from '../design-system/components/AppCard';
import { NativeHealthMedications } from '../native/NativeHealthMedications';
import { useHealthMedications } from '../healthMedications/useHealthMedications';

const messages = {
  loading: 'Loading Apple Health medications…',
  requesting:
    'Waiting for the access request to finish. A selection sheet may not appear. You can manage selections in Health.',
  empty:
    'No medications are available to read. This does not tell us whether access was granted. Check your medication selections in Health.',
  unavailable:
    'Apple Health medications require iOS 26 or later, Health availability and a supported app build.',
  error:
    'Unable to read Apple Health medications. Try refreshing when the app is active and the iPhone is unlocked, or check your selections in Health.',
  waiting:
    'Apple Health has not finished this operation. You can leave this screen. No additional request will start while it is still running.',
};
function Action({
  label,
  onPress,
  disabled = false,
  expanded,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  expanded?: boolean;
}) {
  const theme = usePersonalOSTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, expanded }}
      disabled={disabled}
      onPress={onPress}
      style={styles.action}
    >
      <Text
        style={[typography.bodyStrong, { color: theme.colours.textPrimary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export default function HealthMedicationsScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const theme = usePersonalOSTheme();
  const { width, fontScale } = useWindowDimensions();
  const { state, requestFailed, refresh, connect } = useHealthMedications(
    NativeHealthMedications,
  );
  const [guidance, setGuidance] = useState(false);
  const body = [typography.body, { color: theme.colours.textPrimary }];
  const busy = state.kind === 'loading' || state.kind === 'requesting';
  return (
    <SafeAreaView
      style={[styles.fill, { backgroundColor: theme.colours.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: goldenScreenPadding(width) },
        ]}
      >
        <Action label="Back to Library" onPress={onBack} />
        <Text
          accessibilityRole="header"
          style={[
            fontScale >= 1.786 ? typography.cardTitle : typography.screenTitle,
            styles.gap,
            { color: theme.colours.textPrimary },
          ]}
        >
          Apple Health medications
        </Text>
        <Text style={[body, styles.gap]}>
          View medications you choose to share from Health. This does not add
          them to your local medication records or change anything in Health.
        </Text>
        <Action
          label="Manage medication access"
          expanded={guidance}
          onPress={() => setGuidance(value => !value)}
        />
        {guidance && (
          <AppCard style={styles.gap}>
            <Text
              accessibilityRole="header"
              style={[
                typography.cardTitle,
                { color: theme.colours.textPrimary },
              ]}
            >
              Manage selections in Health
            </Text>
            <Text style={body}>
              Open the Health app → your profile → Apps →{' '}
              {NativeHealthMedications.appDisplayName} → medication selections.
              Choose the medications you want to share, then return here to
              refresh automatically. You can also use Refresh medications.
            </Text>
            <Text style={body}>
              If the app is not listed, use Connect Apple Health medications
              here first. A completed request does not confirm access, and the
              selection sheet may not appear again.
            </Text>
          </AppCard>
        )}
        <Action
          label="Connect Apple Health medications"
          onPress={connect}
          disabled={busy || state.kind === 'unavailable'}
        />
        {requestFailed && (
          <Text accessibilityRole="alert" style={[body, styles.gap]}>
            The access request did not complete successfully. Your selections
            have not been confirmed. Check Manage medication access.
          </Text>
        )}
        {state.kind === 'ready' ? (
          state.rows.map((row, index) => (
            <AppCard key={index} style={styles.gap}>
              <View accessible>
                <Text
                  style={[
                    typography.cardTitle,
                    { color: theme.colours.textPrimary },
                  ]}
                >
                  {row.name.trim() || 'Unnamed medication'}
                </Text>
                {!!row.nickname && <Text style={body}>{row.nickname}</Text>}
                {row.isArchived && <Text style={body}>Archived in Health</Text>}
              </View>
            </AppCard>
          ))
        ) : (
          <AppCard>
            <Text accessibilityLiveRegion="polite" style={body}>
              {messages[state.kind]}
            </Text>
          </AppCard>
        )}
        <Action
          label="Refresh medications"
          onPress={refresh}
          disabled={busy || state.kind === 'unavailable'}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: spacing.xxl },
  gap: { marginBottom: spacing.lg },
  action: {
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
});
