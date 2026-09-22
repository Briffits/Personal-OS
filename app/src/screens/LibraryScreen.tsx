import {Pressable, StyleSheet, Text, useColorScheme, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

function LibraryScreen() {
  const isDarkMode = useColorScheme() === 'dark';

  const colours = {
    background: isDarkMode ? '#111111' : '#F7F7F7',
    surface: isDarkMode ? '#1C1C1E' : '#FFFFFF',
    primaryText: isDarkMode ? '#FFFFFF' : '#111111',
    secondaryText: isDarkMode ? '#A1A1A6' : '#666666',
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, {backgroundColor: colours.background}]}>
      <View style={styles.content}>
        <Text
          accessibilityRole="header"
          style={[styles.title, {color: colours.primaryText}]}>
          Library
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Prescription Wallet"
          style={[styles.card, {backgroundColor: colours.surface}]}>
          <Text style={[styles.cardTitle, {color: colours.primaryText}]}>
            Prescription Wallet
          </Text>

          <Text style={[styles.cardText, {color: colours.secondaryText}]}>
            View your current prescription and manage medication stock.
          </Text>
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
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 32,
  },
  card: {
    borderRadius: 16,
    padding: 18,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  cardText: {
    fontSize: 15,
    lineHeight: 21,
  },
});

export default LibraryScreen;
