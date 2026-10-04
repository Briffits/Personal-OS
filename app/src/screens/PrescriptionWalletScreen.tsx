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

  const horizontalPadding = goldenScreenPadding(screenWidth);

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

      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'prescription_documents_authentication_cancelled'
      ) {
        return;
      }

      Alert.alert(
        'Unable to open prescription',
        'Personal OS could not access the prescription wallet.',
      );
    }
  };

  const handleReplacePrescription = async () => {
    try {
        const result = await prescriptionService.importPrescription();

        if (result.status === 'saved') {
        Alert.alert(
        'Prescription saved',
        'Your current prescription has been updated.',
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

    if (
      error instanceof PrescriptionOperationError &&
      error.code === 'cleanup-pending'
    ) {
      Alert.alert(
        'Cleanup required',
        'Personal OS must finish cleaning up the previous prescription before another replacement can be made.',
      );
      return;
    }

    Alert.alert(
      'Unable to replace prescription',
      'Personal OS could not start the prescription replacement.',
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
          Prescriptions
        </Text>

        <AppCard>
          <Text
            style={[
              typography.cardTitle,
              {color: theme.colours.textPrimary},
            ]}>
            Current prescription
          </Text>
          <Text
            style={[
              typography.body,
              styles.description,
              {color: theme.colours.textSecondary},
            ]}>
            View your saved prescription, or import one if none is saved yet.
          </Text>

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
              accessibilityLabel="Replace Prescription"
              onPress={handleReplacePrescription}
              style={styles.actionButton}>
              <Text
                style={[
                  typography.bodyStrong,
                  {
                    color: theme.colours.primary,
                  },
                ]}>
                Replace Prescription
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
            Your current prescription is stored privately on this device.
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
  description: {
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
