import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppCard from '../design-system/components/AppCard';
import {
  goldenScreenPadding,
  layout,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';

const descriptions = {
  Ask: 'Asking questions in Personal OS is not available yet.',
  Capture: 'Saving new items through Capture is not available yet.',
  Settings: 'There are no settings to change in this version.',
};

type UnavailableFeatureScreenProps = {
  feature: keyof typeof descriptions;
  onBack?: () => void;
};

function UnavailableFeatureScreen({
  feature,
  onBack,
}: UnavailableFeatureScreenProps) {
  const theme = usePersonalOSTheme();
  const { width } = useWindowDimensions();
  const [headingWidth, setHeadingWidth] = useState(0);
  const [headingViewportWidth, setHeadingViewportWidth] = useState(0);
  const headingOverflows = headingWidth > headingViewportWidth + 1;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colours.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: goldenScreenPadding(width) },
        ]}
      >
        {onBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Today"
            onPress={onBack}
            style={styles.backButton}
          >
            <Text
              style={[typography.bodyStrong, { color: theme.colours.action }]}
            >
              Back to Today
            </Text>
          </Pressable>
        )}

        <View style={styles.title}>
          {/* A scaled single word can exceed the viewport. Give it its natural
              width and scroll the row instead of splitting or shrinking it. */}
          <ScrollView
            key={feature}
            horizontal
            bounces={false}
            directionalLockEnabled
            testID="shell-heading-scroll"
            onLayout={event =>
              setHeadingViewportWidth(event.nativeEvent.layout.width)
            }
            onContentSizeChange={contentWidth => setHeadingWidth(contentWidth)}
          >
            <Text
              accessibilityRole="header"
              style={[
                typography.screenTitle,
                { color: theme.colours.textPrimary },
              ]}
            >
              {feature}
            </Text>
          </ScrollView>
          {headingOverflows && (
            <Text
              style={[
                typography.caption,
                styles.headingHint,
                { color: theme.colours.textSecondary },
              ]}
            >
              Swipe sideways
            </Text>
          )}
        </View>

        <AppCard>
          <Text
            style={[
              typography.cardTitle,
              styles.cardTitle,
              { color: theme.colours.textPrimary },
            ]}
          >
            Not available yet
          </Text>
          <Text
            style={[
              typography.body,
              { color: theme.colours.textSecondaryOnSurface },
            ]}
          >
            {descriptions[feature]}
          </Text>
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { paddingBottom: spacing.xxl },
  backButton: {
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  title: { marginBottom: spacing.xxl },
  headingHint: { marginTop: spacing.sm },
  cardTitle: { marginBottom: spacing.sm },
});

export default UnavailableFeatureScreen;
