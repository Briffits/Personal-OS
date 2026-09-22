import {Pressable, StyleSheet, Text, useColorScheme, View} from 'react-native';

export type AppTab = 'Today' | 'Ask' | 'Capture' | 'Library';

type BottomNavigationProps = {
  activeTab: AppTab;
  onTabPress: (tab: AppTab) => void;
};

const tabs: AppTab[] = ['Today', 'Ask', 'Capture', 'Library'];

function BottomNavigation({
  activeTab,
  onTabPress,
}: BottomNavigationProps) {
  const isDarkMode = useColorScheme() === 'dark';

  const colours = {
    background: isDarkMode ? '#1C1C1E' : '#FFFFFF',
    activeText: isDarkMode ? '#FFFFFF' : '#111111',
    inactiveText: isDarkMode ? '#8E8E93' : '#8A8A8E',
    border: isDarkMode ? '#2C2C2E' : '#E5E5EA',
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colours.background,
          borderTopColor: colours.border,
        },
      ]}>
      {tabs.map(tab => {
        const isActive = tab === activeTab;

        return (
          <Pressable
            key={tab}
            accessibilityRole="button"
            accessibilityState={{selected: isActive}}
            accessibilityLabel={`${tab} tab`}
            onPress={() => onTabPress(tab)}
            style={styles.tab}>
            <Text
              style={[
                styles.label,
                {
                  color: isActive
                    ? colours.activeText
                    : colours.inactiveText,
                },
                isActive && styles.activeLabel,
              ]}>
              {tab}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
  activeLabel: {
    fontWeight: '700',
  },
});

export default BottomNavigation;
