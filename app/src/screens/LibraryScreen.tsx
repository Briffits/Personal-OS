import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import AppCard from '../design-system/components/AppCard';
import {
  goldenScreenPadding,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';

type LibraryScreenProps = {
  onOpenPrescriptionWallet: () => void;
};

function LibraryScreen({
  onOpenPrescriptionWallet,
}: LibraryScreenProps) {
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
      <View
        style={[
          styles.content,
          {
            paddingHorizontal: horizontalPadding,
          },
        ]}>
        <Text
          accessibilityRole="header"
          style={[
            typography.screenTitle,
            styles.title,
            {
              color: theme.colours.textPrimary,
            },
          ]}>
          Library
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Prescription Wallet"
          onPress={onOpenPrescriptionWallet}
          style={styles.walletEntry}>
          <AppCard>
            <Text
              style={[
                typography.cardTitle,
                styles.cardTitle,
                {
                  color: theme.colours.textPrimary,
                },
              ]}>
              Prescription Wallet
            </Text>

            <Text
              style={[
                typography.body,
                {
                  color: theme.colours.textSecondary,
                },
              ]}>
              View your current prescription and manage medication stock.
            </Text>
          </AppCard>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  title: {
    marginBottom: spacing.xxl,
  },
  walletEntry: {
    width: '100%',
  },
  cardTitle: {
    marginBottom: spacing.sm,
  },
});

export default LibraryScreen;
