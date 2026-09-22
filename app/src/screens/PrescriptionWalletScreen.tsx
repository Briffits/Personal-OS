import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

type PrescriptionWalletScreenProps = {
  onBack: () => void;
};

function PrescriptionWalletScreen({
  onBack,
}: PrescriptionWalletScreenProps) {
  const isDarkMode = useColorScheme() === 'dark';

  const colours = {
    background: isDarkMode ? '#111111' : '#F7F7F7',
    surface: isDarkMode ? '#1C1C1E' : '#FFFFFF',
    primaryText: isDarkMode ? '#FFFFFF' : '#111111',
    secondaryText: isDarkMode ? '#A1A1A6' : '#666666',
    border: isDarkMode ? '#2C2C2E' : '#E5E5EA',
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, {backgroundColor: colours.background}]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Library"
          onPress={onBack}
          style={styles.backButton}>
          <Text style={[styles.backText, {color: colours.secondaryText}]}>
            Back
          </Text>
        </Pressable>

        <Text
          accessibilityRole="header"
          style={[styles.title, {color: colours.primaryText}]}>
          Prescription Wallet
        </Text>

        <View style={[styles.card, {backgroundColor: colours.surface}]}>
          <Text style={[styles.medicationName, {color: colours.primaryText}]}>
            Medication A
          </Text>

          <Text style={[styles.stockText, {color: colours.primaryText}]}>
            Estimated stock: 23 tablets
          </Text>

          <Text style={[styles.daysText, {color: colours.secondaryText}]}>
            Approximately 23 days remaining
          </Text>

          <View
            style={[
              styles.divider,
              {
                backgroundColor: colours.border,
              },
            ]}
          />

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View Prescription"
              style={styles.actionButton}>
              <Text style={[styles.actionText, {color: colours.primaryText}]}>
                View Prescription
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add Stock"
              style={styles.actionButton}>
              <Text style={[styles.actionText, {color: colours.primaryText}]}>
                Add Stock
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Correct Stock"
              style={styles.actionButton}>
              <Text style={[styles.actionText, {color: colours.primaryText}]}>
                Correct Stock
              </Text>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.note, {color: colours.secondaryText}]}>
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
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    fontSize: 15,
    fontWeight: '500',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 32,
  },
  card: {
    borderRadius: 16,
    padding: 18,
  },
  medicationName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  stockText: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  daysText: {
    fontSize: 15,
    lineHeight: 21,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 18,
  },
  actions: {
    gap: 8,
  },
  actionButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 16,
  },
});

export default PrescriptionWalletScreen;
