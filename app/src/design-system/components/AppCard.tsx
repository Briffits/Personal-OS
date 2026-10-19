import { useState, type ReactNode } from 'react';
import {
  type LayoutChangeEvent,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import { radius as radiusTokens } from '../tokens/radius';
import type { CardVariant } from '../theme/types';
import { goldenRadius } from '../geometry/goldenRatio';
import { spacing } from '../tokens/spacing';
import { usePersonalOSTheme } from '../usePersonalOSTheme';

type AppCardProps = {
  children: ReactNode;
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
};

type CardDimensions = {
  width: number;
  height: number;
};

function AppCard({ children, style, variant = 'standard' }: AppCardProps) {
  const theme = usePersonalOSTheme();

  const [dimensions, setDimensions] = useState<CardDimensions>({
    width: 0,
    height: 0,
  });

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;

    setDimensions(currentDimensions => {
      if (
        currentDimensions.width === width &&
        currentDimensions.height === height
      ) {
        return currentDimensions;
      }

      return { width, height };
    });
  };

  const radius =
    dimensions.width > 0 && dimensions.height > 0
      ? goldenRadius(dimensions.width, dimensions.height)
      : radiusTokens.unmeasured;

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.card,
        {
          backgroundColor:
            variant === 'attention'
              ? theme.colours.cardAttention
              : theme.colours.cardStandard,
          borderRadius: radius,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
  },
});

export default AppCard;
