import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  goldenControlHeight,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';

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
  const theme = usePersonalOSTheme();
  const insets = useSafeAreaInsets();
  const {width: screenWidth} = useWindowDimensions();

  const controlHeight = goldenControlHeight(screenWidth);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colours.surface,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
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
            style={[
              styles.tab,
              {
                minHeight: controlHeight,
              },
            ]}>
            <Text
              style={[
                isActive
                  ? typography.navigationActive
                  : typography.navigation,
                {
                  color: isActive
                    ? theme.colours.primary
                    : theme.colours.textSecondary,
                },
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
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BottomNavigation;
