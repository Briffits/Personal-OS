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
import { NativeCalendar } from '../native/NativeCalendar';
import { useCalendar } from '../calendar/useCalendar';

const messages = {
  loading: 'Loading events…',
  requesting: 'Waiting for Calendar access…',
  notDetermined:
    'Allow access to see today’s events. iOS requests full Calendar access; Personal OS only reads your events.',
  writeOnly:
    'Calendar access currently allows adding events only. To show today’s events, allow full Calendar access. Personal OS only reads your events.',
  denied: 'Calendar access is off. You can allow access in iPhone Settings.',
  restricted: 'Calendar access is restricted on this iPhone.',
  unavailable: 'Calendar is unavailable in this build.',
  error: 'Unable to load events. Please try again.',
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

export default function CalendarScreen({ onBack }: { onBack: () => void }) {
  const theme = usePersonalOSTheme();
  const { width, fontScale } = useWindowDimensions();
  const { state, refresh, requestAccess } = useCalendar(NativeCalendar);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const busy = state.kind === 'loading' || state.kind === 'requesting';
  const heading =
    fontScale >= 1.786 ? typography.cardTitle : typography.screenTitle;
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: state.kind === 'ready' ? state.snapshot.day.timeZone : 'UTC',
  });

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
          Calendar today
        </Text>
        <Text
          style={[
            typography.body,
            styles.introduction,
            { color: theme.colours.textSecondary },
          ]}
        >
          View today’s events here. Make changes in Apple Calendar.
        </Text>
        {state.kind === 'ready' ? (
          state.snapshot.events.length === 0 ? (
            <AppCard>
              <Text
                style={[typography.body, { color: theme.colours.textPrimary }]}
              >
                No events today.
              </Text>
            </AppCard>
          ) : (
            <>
              <Text
                style={[
                  typography.body,
                  styles.introduction,
                  { color: theme.colours.textSecondary },
                ]}
              >
                Times shown in {state.snapshot.day.timeZone}.
              </Text>
              {state.snapshot.events.map(event => {
                // Display only: native owns all membership and ordering decisions.
                const timeLabel =
                  event.time.kind === 'all-day'
                    ? 'All day'
                    : `${timeFormatter.format(
                        event.time.startsAt,
                      )} – ${timeFormatter.format(event.time.endsAt)}`;
                const title = event.title.trim() || 'Untitled event';
                return (
                  <AppCard key={event.occurrenceId} style={styles.card}>
                    <View
                      accessible
                      accessibilityLabel={`${title}, ${timeLabel}`}
                    >
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
                        {timeLabel}
                      </Text>
                    </View>
                  </AppCard>
                );
              })}
            </>
          )
        ) : (
          <AppCard>
            <Text
              accessibilityLiveRegion="polite"
              style={[typography.body, { color: theme.colours.textPrimary }]}
            >
              {messages[state.kind]}
            </Text>
            {busy && <ActivityIndicator accessibilityLabel="Loading events" />}
            {(state.kind === 'notDetermined' || state.kind === 'writeOnly') && (
              <Action label="Allow Calendar access" onPress={requestAccess} />
            )}
            {state.kind === 'denied' && (
              <Action label="Open iPhone Settings" onPress={openSettings} />
            )}
            {state.kind === 'denied' && settingsFailed && (
              <Text
                accessibilityRole="alert"
                style={[typography.body, { color: theme.colours.textPrimary }]}
              >
                Unable to open Settings. Open iPhone Settings to change Calendar
                access.
              </Text>
            )}
          </AppCard>
        )}
        {state.kind !== 'unavailable' && (
          <Action
            label={state.kind === 'error' ? 'Retry' : 'Refresh events'}
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
