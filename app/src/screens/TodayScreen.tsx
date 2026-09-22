import {ScrollView, StyleSheet, Text, useColorScheme, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

function TodayScreen() {
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
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Text
          accessibilityRole="header"
          style={[styles.appTitle, {color: colours.primaryText}]}>
          Personal OS
        </Text>

        <Text style={[styles.sectionLabel, {color: colours.secondaryText}]}>
          NOW
        </Text>

        <View style={[styles.card, {backgroundColor: colours.surface}]}>
          <Text style={[styles.cardTitle, {color: colours.primaryText}]}>
            Your next priority will appear here
          </Text>
          <Text style={[styles.cardText, {color: colours.secondaryText}]}>
            Personal OS will surface the one thing that most needs your
            attention.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, {color: colours.secondaryText}]}>
          TODAY
        </Text>

        <View style={[styles.card, {backgroundColor: colours.surface}]}>
          <Text style={[styles.cardTitle, {color: colours.primaryText}]}>
            Priority 2
          </Text>
          <Text style={[styles.cardText, {color: colours.secondaryText}]}>
            A second important item will appear here.
          </Text>
        </View>

        <View style={[styles.card, {backgroundColor: colours.surface}]}>
          <Text style={[styles.cardTitle, {color: colours.primaryText}]}>
            Priority 3
          </Text>
          <Text style={[styles.cardText, {color: colours.secondaryText}]}>
            A third important item will appear here.
          </Text>
        </View>
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
  appTitle: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  card: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
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

export default TodayScreen;
