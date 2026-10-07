import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppCard from '../design-system/components/AppCard';
import {
  goldenScreenPadding,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';

type LibraryScreenProps = {
  onOpenMedication: () => void;
  onOpenPrescriptionWallet: () => void;
};

function LibraryScreen({
  onOpenMedication,
  onOpenPrescriptionWallet,
}: LibraryScreenProps) {
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
      >
        <Text
          accessibilityRole="header"
          style={[
            typography.screenTitle,
            styles.title,
            {
              color: theme.colours.textPrimary,
            },
          ]}
        >
          Library
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Medication"
          onPress={onOpenMedication}
          style={styles.entry}
        >
          <AppCard>
            <Text
              style={[
                typography.cardTitle,
                styles.cardTitle,
                {
                  color: theme.colours.textPrimary,
                },
              ]}
            >
              Medication
            </Text>

            <Text
              style={[
                typography.body,
                {
                  color: theme.colours.textSecondary,
                },
              ]}
            >
              Check estimated stock, add stock or correct your count.
            </Text>
          </AppCard>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Prescriptions"
          onPress={onOpenPrescriptionWallet}
          style={styles.entry}
        >
          <AppCard>
            <Text
              style={[
                typography.cardTitle,
                styles.cardTitle,
                {
                  color: theme.colours.textPrimary,
                },
              ]}
            >
              Prescriptions
            </Text>

            <Text
              style={[
                typography.body,
                {
                  color: theme.colours.textSecondary,
                },
              ]}
            >
              View, add or manage your saved prescriptions.
            </Text>
          </AppCard>
        </Pressable>
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
  title: {
    marginBottom: spacing.xxl,
  },
  entry: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  cardTitle: {
    marginBottom: spacing.sm,
  },
});

export default LibraryScreen;
