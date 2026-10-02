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

import {
  createCurrentPrescriptionService,
  PrescriptionOperationError,
} from '../prescriptions/currentPrescriptionService';
import {NativePrescriptionDocuments} from '../native/NativePrescriptionDocuments';
function confirmPrescriptionReplacement(): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      'Replace Prescription',
      'This will replace the prescription currently stored in Personal OS.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(false),
      },
    );
  });
}
const prescriptionService = createCurrentPrescriptionService({
  store: NativePrescriptionDocuments,
  selector: NativePrescriptionDocuments,
  viewer: NativePrescriptionDocuments,
  confirmReplacement: confirmPrescriptionReplacement,
});

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
    if (isStockLoading) {
      return;
    }

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
    if (isStockLoading) {
      return;
    }

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
            const input = value?.trim() ?? '';
            const amount = Number(input);

            if (input === '' || !Number.isInteger(amount) || amount < 0) {
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

  const handlePrescriptionAction = async () => {
    try {
      const viewResult = await prescriptionService.viewPrescription();

      if (viewResult === 'opened') {
        return;
      }

      const result = await prescriptionService.importPrescription();

      if (result.status === 'saved') {
        Alert.alert(
          'Prescription saved',
          'Your prescription is now stored in Personal OS.',
        );
        return;
      }

      if (result.status === 'cleanup-pending') {
        Alert.alert(
          'Prescription saved',
          'Your new prescription was saved, but Personal OS still needs to finish cleaning up the previous copy.',
        );
        return;
      }

if (result.status === 'candidate-release-failed') {
  const prescriptionWasSaved =
    result.outcome.status === 'saved' ||
    result.outcome.status === 'cleanup-pending';

  Alert.alert(
    prescriptionWasSaved
      ? 'Prescription saved'
      : 'Temporary file cleanup incomplete',
    prescriptionWasSaved
      ? 'Your prescription was saved, but some temporary file cleanup could not finish.'
      : 'Personal OS could not remove its temporary import copy.',
  );
  return;
}

      if (result.status === 'failed') {
        Alert.alert(
          'Unable to save prescription',
          'Personal OS could not complete the prescription import.',
        );
      }
    } catch (error) {
      if (
        error instanceof PrescriptionOperationError &&
        error.code === 'busy'
      ) {
        return;
      }

      Alert.alert(
        'Unable to open prescription',
        'Personal OS could not access the prescription wallet.',
      );
    }
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
                : 'Stock quantity recorded'}
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
              onPress={handlePrescriptionAction}
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
              accessibilityState={{disabled: isStockLoading}}
              disabled={isStockLoading}
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
              accessibilityState={{disabled: isStockLoading}}
              disabled={isStockLoading}
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
		Stock is saved on this device. Add stock when you receive tablets, or
		correct it to match your current count. Your current prescription is stored
		privately on this device.
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
