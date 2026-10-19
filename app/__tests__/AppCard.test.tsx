import React from 'react';
import * as ReactNative from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AppCard from '../src/design-system/components/AppCard';
import { createTheme, goldenRadius, spacing } from '../src/design-system';

afterEach(() => jest.restoreAllMocks());

test.each(['light', 'dark'] as const)(
  'card variants and measured geometry in %s mode',
  scheme => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme);
    const theme = createTheme(scheme);
    let screen!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      screen = ReactTestRenderer.create(
        <AppCard>
          <ReactNative.Text>Information</ReactNative.Text>
        </AppCard>,
      );
    });
    const card = () => screen.root.findByType(ReactNative.View);
    const style = () => ReactNative.StyleSheet.flatten(card().props.style);
    expect(style().backgroundColor).toBe(theme.colours.cardStandard);
    expect(style().padding).toBe(spacing.lg);
    act(() =>
      card().props.onLayout({
        nativeEvent: { layout: { width: 300, height: 100 } },
      }),
    );
    expect(style().borderRadius).toBe(goldenRadius(300, 100));
    act(() =>
      screen.update(
        <AppCard variant="attention">
          <ReactNative.Text>Attention needed</ReactNative.Text>
        </AppCard>,
      ),
    );
    expect(style().backgroundColor).toBe(theme.colours.cardAttention);
    expect(screen.root.findByType(ReactNative.Text).props.children).toBe(
      'Attention needed',
    );
    act(() => screen.unmount());
  },
);
