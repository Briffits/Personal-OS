import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CalendarSnapshot } from '../calendar/calendar';
import { createCalendarGapFormatter } from '../calendar/formatCalendarGap';
import { useCalendarGaps } from '../calendar/useCalendarGaps';
import AppCard from '../design-system/components/AppCard';
import { spacing, typography, usePersonalOSTheme } from '../design-system';

export default function CalendarGaps({
  snapshot,
  readAt,
}: {
  snapshot: CalendarSnapshot;
  readAt: number;
}) {
  const theme = usePersonalOSTheme();
  const { now, result } = useCalendarGaps(snapshot);
  const format = useMemo(
    () => createCalendarGapFormatter(snapshot.day.timeZone),
    [snapshot.day.timeZone],
  );
  const body = [typography.body, { color: theme.colours.textPrimary }];

  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[typography.cardTitle, { color: theme.colours.textPrimary }]}
      >
        Calendar gaps today
      </Text>
      {result.kind === 'unavailable' ? (
        <Text style={body}>
          Calendar gaps need a fresh read. Refresh events to try again.
        </Text>
      ) : (
        <>
          <Text style={body}>
            Remaining today: now–midnight. Times shown in{' '}
            {snapshot.day.timeZone}.
          </Text>
          <Text style={body}>
            Gaps of at least 15 minutes between loaded timed entries are not
            confirmed availability. Inaccessible calendars, unsynced changes and
            commitments outside Calendar may be missing.
          </Text>
          <Text style={body}>
            All-day entries are not subtracted and may still represent
            commitments. Check the events below before using a gap.
          </Text>
          <Text style={body}>
            Timed entries block gaps regardless of free/busy or invitation
            status. Zero-duration entries reserve no time.
          </Text>
          <Text style={body}>
            Calendar last read: {format.readTime(readAt)}. Refresh to check for
            changes.
          </Text>
          {result.gaps.length === 0 ? (
            <Text style={body}>
              No gaps of 15 minutes or more under these rules.
            </Text>
          ) : (
            result.gaps.map(gap => {
              const label = format.gap(gap, now);
              return (
                <AppCard key={gap.endsAt}>
                  <View accessible accessibilityLabel={label.spoken}>
                    <Text style={body}>{label.visible}</Text>
                    <Text style={body}>{label.duration}</Text>
                  </View>
                </AppCard>
              );
            })
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md, marginBottom: spacing.lg },
});
