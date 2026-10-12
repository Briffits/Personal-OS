import { createTheme } from '../src/design-system';

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map(value => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

test('light text and control boundaries contrast on every supported surface', () => {
  const c = createTheme('light').colours;
  expect(contrast(c.textSecondary, c.background)).toBeGreaterThanOrEqual(4.5);
  for (const surface of [c.background, c.cardStandard, c.cardAttention]) {
    expect(contrast(c.textPrimary, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.action, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.borderControl, surface)).toBeGreaterThanOrEqual(3);
  }
  for (const surface of [c.cardStandard, c.cardAttention]) {
    expect(contrast(c.textSecondaryOnSurface, surface)).toBeGreaterThanOrEqual(
      4.5,
    );
  }
  expect(c.borderControl).not.toBe(c.borderSubtle);
});

test('missing appearance uses light and dark retains compatibility colours', () => {
  expect(createTheme(null)).toBe(createTheme('light'));
  expect(createTheme(undefined)).toBe(createTheme('light'));
  expect(createTheme('dark')).toEqual({
    isDark: true,
    colours: {
      background: '#121416',
      navigationSurface: '#1C2023',
      cardStandard: '#1C2023',
      cardAttention: '#1C2023',
      textPrimary: '#F5F7F8',
      textSecondary: '#B8BEC3',
      textSecondaryOnSurface: '#B8BEC3',
      action: '#245C6A',
      borderSubtle: '#1C2023',
      borderControl: '#B8BEC3',
    },
  });
});
