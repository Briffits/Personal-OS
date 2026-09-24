import {useEffect, useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import AppCard from '../design-system/components/AppCard';
import {
  goldenScreenPadding,
  layout,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';
import {
  loadMedicationStock,
  saveMedicationStock,
} from '../storage/medicationStockStorage';

type PrescriptionWalletScreenProps = {
  onBack: () => void;
};

function PrescriptionWalletScreen({
  onBack,
}: PrescriptionWalletScreenProps) {
  const theme = usePersonalOSTheme();
  const {width: screenWidth} = useWindowDimensions();

  const [estimatedStock, setEstimatedStock] = useState<number | null>(null);
  const [isStockLoading, setIsStockLoading] = useState(true);

  const horizontalPadding = goldenScreenPadding(screenWidth);

  useEffect(() => {
    const loadSavedStock = async () => {
      try {
        const savedStock = await loadMedicationStock();
        setEstimatedStock(savedStock);
      } catch {
        Alert.alert(
          'Unable to load stock',
          'Your saved stock amount could not be loaded.',
        );
      } finally {
        setIsStockLoading(false);
      }
    };

    loadSavedStock();
  }, []);

  const updateStock = async (newStock: number) => {
    try {
      await saveMedicationStock(newStock);
      setEstimatedStock(newStock);
    } catch {
      Alert.alert(
        'Unable to save stock',
        'Your stock amount could not be saved. Please try again.',
      );
    }
  };

  const handleAddStock = () => {
    Alert.prompt(
      'Add Stock',
      'Enter the number of tablets to add.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Add',
          onPress: value => {
            const amount = Number(value);

            if (!Number.isInteger(amount) || amount <= 0) {
              Alert.alert(
                'Invalid amount',
                'Enter a whole number greater than zero.',
              );
              return;
            }

            updateStock((estimatedStock ?? 0) + amount);
          },
        },
      ],
      'plain-text',
      '',
      'number-pad',
    );
  };

  const handleCorrectStock = () => {
    Alert.prompt(
      'Correct Stock',
      'Enter the current number of tablets you physically have.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Update',
          onPress: value => {
            const amount = Number(value);

            if (!Number.isInteger(amount) || amount < 0) {
              Alert.alert(
                'Invalid amount',
                'Enter a whole number of zero or more.',
              );
              return;
            }

            updateStock(amount);
          },
        },
      ],
      'plain-text',
      '',
      'number-pad',
    );
  };
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Library"
          onPress={onBack}
          style={styles.backButton}>
          <Text
            style={[
              typography.bodyStrong,
              {
                color: theme.colours.primary,
              },
            ]}>
            Back
          </Text>
        </Pressable>

        <Text
          accessibilityRole="header"
          style={[
            typography.screenTitle,
            styles.title,
            {
              color: theme.colours.textPrimary,
            },
          ]}>
          Prescription Wallet
        </Text>

        <AppCard>
          <Text
            style={[
              styles.medicationName,
              {
                color: theme.colours.textPrimary,
              },
            ]}>
            Medication A
          </Text>

          <Text
            style={[
              typography.cardTitle,
              styles.stockText,
              {
                color: theme.colours.textPrimary,
              },
            ]}>
            {isStockLoading
              ? 'Loading stock…'
              : estimatedStock === null
                ? 'Stock not recorded'
                : `Estimated stock: ${estimatedStock} tablets`}
          </Text>

          <Text
            style={[
              typography.body,
              {
                color: theme.colours.textSecondary,
              },
            ]}>
            {isStockLoading
              ? 'Checking saved stock'
              : estimatedStock === null
                ? 'Add stock to begin tracking'
                : `Approximately ${estimatedStock} days remaining`}
          </Text>

          <View
            style={[
              styles.divider,
              {
                backgroundColor: theme.colours.primarySubtle,
              },
            ]}
          />

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View Prescription"
              style={styles.actionButton}>
              <Text
                style={[
                  typography.bodyStrong,
                  {
                    color: theme.colours.primary,
                  },
                ]}>
                View Prescription
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add Stock"
              onPress={handleAddStock}
              style={styles.actionButton}>
              <Text
                style={[
                  typography.bodyStrong,
                  {
                    color: theme.colours.primary,
                  },
                ]}>
                Add Stock
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Correct Stock"
              onPress={handleCorrectStock}
              style={styles.actionButton}>
              <Text
                style={[
                  typography.bodyStrong,
                  {
                    color: theme.colours.primary,
                  },
                ]}>
                Correct Stock
              </Text>
            </Pressable>
          </View>
        </AppCard>

        <Text
          style={[
            typography.caption,
            styles.note,
            {
              color: theme.colours.textSecondary,
            },
          ]}>
          Stock and prescription actions are placeholders for now.
        </Text>
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
  backButton: {
    alignSelf: 'flex-start',
    minHeight: layout.minimumTouchTarget,
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  medicationName: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    marginBottom: spacing.lg,
  },
  stockText: {
    marginBottom: spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.lg,
  },
  actions: {
    gap: spacing.sm,
  },
  actionButton: {
    minHeight: layout.minimumTouchTarget,
    justifyContent: 'center',
  },
  note: {
    marginTop: spacing.lg,
  },
});

export default PrescriptionWalletScreen;
