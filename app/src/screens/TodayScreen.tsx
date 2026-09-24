import {ScrollView, StyleSheet, Text, useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import AppCard from '../design-system/components/AppCard';
import {
  goldenScreenPadding,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';

function TodayScreen() {
  const theme = usePersonalOSTheme();
  const {width: screenWidth} = useWindowDimensions();

  const horizontalPadding = goldenScreenPadding(screenWidth);

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor: theme.colours.background,
        },
      ]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: horizontalPadding,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <Text
          accessibilityRole="header"
          style={[
            typography.screenTitle,
            styles.appTitle,
            {
              color: theme.colours.textPrimary,
            },
          ]}>
          Personal OS
        </Text>

        <Text
          style={[
            typography.sectionLabel,
            styles.sectionLabel,
            {
              color: theme.colours.primary,
            },
          ]}>
          NOW
        </Text>

        <AppCard style={styles.card}>
          <Text
            style={[
              typography.cardTitle,
              styles.cardTitle,
              {
                color: theme.colours.textPrimary,
              },
            ]}>
            Your next priority will appear here
          </Text>

          <Text
            style={[
              typography.body,
              {
                color: theme.colours.textSecondary,
              },
            ]}>
            Personal OS will surface the one thing that most needs your
            attention.
          </Text>
        </AppCard>

        <Text
          style={[
            typography.sectionLabel,
            styles.sectionLabel,
            {
              color: theme.colours.primary,
            },
          ]}>
          TODAY
        </Text>

        <AppCard style={styles.card}>
          <Text
            style={[
              typography.cardTitle,
              styles.cardTitle,
              {
                color: theme.colours.textPrimary,
              },
            ]}>
            Priority 2
          </Text>

          <Text
            style={[
              typography.body,
              {
                color: theme.colours.textSecondary,
              },
            ]}>
            A second important item will appear here.
          </Text>
        </AppCard>

        <AppCard style={styles.card}>
          <Text
            style={[
              typography.cardTitle,
              styles.cardTitle,
              {
                color: theme.colours.textPrimary,
              },
            ]}>
            Priority 3
          </Text>

          <Text
            style={[
              typography.body,
              {
                color: theme.colours.textSecondary,
              },
            ]}>
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
  appTitle: {
    marginBottom: spacing.xxl,
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
