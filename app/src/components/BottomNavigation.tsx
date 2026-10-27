import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  goldenControlHeight,
  layout,
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

function BottomNavigation({ activeTab, onTabPress }: BottomNavigationProps) {
  const theme = usePersonalOSTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, fontScale } = useWindowDimensions();
  const paddingLeft = Math.max(insets.left, spacing.sm);
  const paddingRight = Math.max(insets.right, spacing.sm);
  const availableWidth = screenWidth - paddingLeft - paddingRight;
  // Reserve room for the longest scaled label, including the selected weight.
  // Reflow the controls rather than compressing text into four narrow columns.
  const useTwoRows = availableWidth / tabs.length < 64 * fontScale;

  const controlHeight = goldenControlHeight(screenWidth);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colours.navigationSurface,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
          paddingLeft,
          paddingRight,
        },
      ]}
    >
      {tabs.map(tab => {
        const isActive = tab === activeTab;

        return (
          <Pressable
            key={tab}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab} tab`}
            onPress={() => onTabPress(tab)}
            style={[
              styles.tab,
              useTwoRows ? styles.twoColumns : styles.fourColumns,
              {
                minHeight: controlHeight,
              },
            ]}
          >
            <Text
              style={[
                isActive ? typography.navigationActive : typography.navigation,
                styles.label,
                {
                  color: isActive
                    ? theme.colours.action
                    : theme.colours.textSecondary,
                },
              ]}
            >
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
    flexWrap: 'wrap',
    rowGap: spacing.xs,
    flexShrink: 0,
    paddingTop: spacing.sm,
  },
  twoColumns: { width: '50%' },
  fourColumns: { width: '25%' },
  label: {
    maxWidth: '100%',
    textAlign: 'center',
  },
  tab: {
    minWidth: layout.minimumTouchTarget,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BottomNavigation;
