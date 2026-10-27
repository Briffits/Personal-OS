import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppCard from '../design-system/components/AppCard';
import {
  goldenScreenPadding,
  layout,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';
import { NativeReminders } from '../native/NativeReminders';
import { useReminders } from '../reminders/useReminders';

const messages = {
  loading: 'Loading reminders…',
  requesting: 'Waiting for Reminders access…',
  notDetermined:
    'Allow access to see incomplete reminders due today. iOS requests full Reminders access; Personal OS only reads your reminders.',
  denied: 'Reminders access is off. You can allow access in iPhone Settings.',
  restricted: 'Reminders access is restricted on this iPhone.',
  unavailable: 'Reminders is unavailable in this build.',
  error: 'Unable to load reminders. Please try again.',
};

function Action({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = usePersonalOSTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
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

export default function RemindersScreen({ onBack }: { onBack: () => void }) {
  const theme = usePersonalOSTheme();
  const { width, fontScale } = useWindowDimensions();
  const { state, refresh, requestAccess } = useReminders(NativeReminders);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const busy = state.kind === 'loading' || state.kind === 'requesting';
  const heading =
    fontScale >= 1.786 ? typography.cardTitle : typography.screenTitle;

  async function openSettings() {
    setSettingsFailed(false);
    try {
      await Linking.openSettings();
    } catch {
      setSettingsFailed(true);
    }
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colours.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: goldenScreenPadding(width) },
        ]}
      >
        <Action label="Back to Today" onPress={onBack} />
        <Text
          accessibilityRole="header"
          style={[heading, styles.title, { color: theme.colours.textPrimary }]}
        >
          Reminders due today
        </Text>
        <Text
          style={[
            typography.body,
            styles.introduction,
            { color: theme.colours.textSecondary },
          ]}
        >
          View your reminders here. Make changes in Apple Reminders.
        </Text>
        {state.kind === 'ready' ? (
          state.snapshot.reminders.length === 0 ? (
            <AppCard>
              <Text
                style={[typography.body, { color: theme.colours.textPrimary }]}
              >
                No incomplete reminders due today.
              </Text>
            </AppCard>
          ) : (
            state.snapshot.reminders.map(reminder => {
              const dueLabel =
                reminder.due.kind === 'date-only'
                  ? 'Today · No time'
                  : 'Today · ' +
                    new Intl.DateTimeFormat(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: state.snapshot.day.timeZone,
                    }).format(reminder.due.at);
              const title = reminder.title.trim() || 'Untitled reminder';
              return (
                <AppCard key={reminder.id} style={styles.card}>
                  <View accessible accessibilityLabel={`${title}, ${dueLabel}`}>
                    <Text
                      style={[
                        typography.cardTitle,
                        styles.cardTitle,
                        { color: theme.colours.textPrimary },
                      ]}
                    >
                      {title}
                    </Text>
                    <Text
                      style={[
                        typography.body,
                        { color: theme.colours.textSecondaryOnSurface },
                      ]}
                    >
                      {dueLabel}
                    </Text>
                  </View>
                </AppCard>
              );
            })
          )
        ) : (
          <AppCard>
            <Text
              accessibilityLiveRegion="polite"
              style={[typography.body, { color: theme.colours.textPrimary }]}
            >
              {messages[state.kind]}
            </Text>
            {busy && (
              <ActivityIndicator accessibilityLabel="Loading reminders" />
            )}
            {state.kind === 'notDetermined' && (
              <Action label="Allow Reminders access" onPress={requestAccess} />
            )}
            {state.kind === 'denied' && (
              <Action label="Open iPhone Settings" onPress={openSettings} />
            )}
            {state.kind === 'denied' && settingsFailed && (
              <Text
                accessibilityRole="alert"
                style={[typography.body, { color: theme.colours.textPrimary }]}
              >
                Unable to open Settings. Open iPhone Settings to change
                Reminders access.
              </Text>
            )}
          </AppCard>
        )}
        {state.kind !== 'unavailable' && (
          <Action
            label={state.kind === 'error' ? 'Retry' : 'Refresh reminders'}
            onPress={refresh}
            disabled={busy}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { paddingBottom: spacing.xxl },
  action: {
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  title: { maxWidth: '100%', marginVertical: spacing.lg },
  introduction: { marginBottom: spacing.lg },
  card: { marginBottom: spacing.lg },
  cardTitle: { marginBottom: spacing.sm },
});
