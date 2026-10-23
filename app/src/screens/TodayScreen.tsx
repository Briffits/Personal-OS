import {
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

type TodayScreenProps = {
  onOpenSettings: () => void;
};

function TodayScreen({ onOpenSettings }: TodayScreenProps) {
  const theme = usePersonalOSTheme();
  const { width: screenWidth } = useWindowDimensions();

  const horizontalPadding = goldenScreenPadding(screenWidth);

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor: theme.colours.background,
        },
      ]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: horizontalPadding,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            style={[
              typography.screenTitle,
              styles.appTitle,
              { color: theme.colours.textPrimary },
            ]}
          >
            Personal OS
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Settings"
            onPress={onOpenSettings}
            style={styles.settingsButton}
          >
            <Text
              style={[typography.bodyStrong, { color: theme.colours.action }]}
            >
              Settings
            </Text>
          </Pressable>
        </View>

        <Text
          style={[
            typography.sectionLabel,
            styles.sectionLabel,
            {
              color: theme.colours.action,
            },
          ]}
        >
          NOW
        </Text>

        <AppCard variant="attention" style={styles.card}>
          <Text
            style={[
              typography.cardTitle,
              styles.cardTitle,
              {
                color: theme.colours.textPrimary,
              },
            ]}
          >
            Your next priority will appear here
          </Text>

          <Text
            style={[
              typography.body,
              {
                color: theme.colours.textSecondaryOnSurface,
              },
            ]}
          >
            Personal OS will surface the one thing that most needs your
            attention.
          </Text>
        </AppCard>

        <Text
          style={[
            typography.sectionLabel,
            styles.sectionLabel,
            {
              color: theme.colours.action,
            },
          ]}
        >
          TODAY
        </Text>

        <AppCard variant="attention" style={styles.card}>
          <Text
            style={[
              typography.cardTitle,
              styles.cardTitle,
              {
                color: theme.colours.textPrimary,
              },
            ]}
          >
            Priority 2
          </Text>

          <Text
            style={[
              typography.body,
              {
                color: theme.colours.textSecondaryOnSurface,
              },
            ]}
          >
            A second important item will appear here.
          </Text>
        </AppCard>

        <AppCard variant="attention" style={styles.card}>
          <Text
            style={[
              typography.cardTitle,
              styles.cardTitle,
              {
                color: theme.colours.textPrimary,
              },
            ]}
          >
            Priority 3
          </Text>

          <Text
            style={[
              typography.body,
              {
                color: theme.colours.textSecondaryOnSurface,
              },
            ]}
          >
            A third important item will appear here.
          </Text>
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  settingsButton: {
    maxWidth: '100%',
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  appTitle: {
    maxWidth: '100%',
  },
  sectionLabel: {
    marginBottom: spacing.md,
  },
  card: {
    marginBottom: spacing.xl,
  },
  cardTitle: {
    marginBottom: spacing.sm,
  },
});

export default TodayScreen;
