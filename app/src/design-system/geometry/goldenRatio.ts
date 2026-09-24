/**
 * Personal OS Golden Geometry
 *
 * The golden ratio provides a common proportional language for responsive
 * dimensions. Accessibility and practical UI constraints always override
 * mathematical purity.
 */

export const PHI = (1 + Math.sqrt(5)) / 2;

const PHI_SQUARED = PHI ** 2;
const PHI_FOURTH = PHI ** 4;
const PHI_SIXTH = PHI ** 6;

export type GoldenButtonWidth = 'compact' | 'standard' | 'wide';

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Responsive horizontal screen padding.
 *
 * Around 22 pt on a 390 pt-wide iPhone.
 * Constrained so very small and very large screens remain usable.
 */
export function goldenScreenPadding(screenWidth: number) {
  return clamp(screenWidth / PHI_SIXTH, 16, 32);
}

/**
 * Corner radius derived from the shorter dimension of an element.
 *
 * Using φ⁴ gives restrained rounding rather than pill-shaped controls.
 */
export function goldenRadius(width: number, height: number) {
  const shortestSide = Math.min(width, height);

  return clamp(shortestSide / PHI_FOURTH, 6, 24);
}

/**
 * Available horizontal content width after golden screen margins.
 */
export function goldenContentWidth(screenWidth: number) {
  const horizontalPadding = goldenScreenPadding(screenWidth);

  return screenWidth - horizontalPadding * 2;
}

/**
 * Button width derived from available content width.
 *
 * compact  ≈ 38.2%
 * standard ≈ 61.8%
 * wide     = 100%
 */
export function goldenButtonWidth(
  screenWidth: number,
  size: GoldenButtonWidth = 'standard',
) {
  const contentWidth = goldenContentWidth(screenWidth);

  switch (size) {
    case 'compact':
      return contentWidth / PHI_SQUARED;

    case 'wide':
      return contentWidth;

    case 'standard':
    default:
      return contentWidth / PHI;
  }
}

/**
 * Recommended control height derived from screen width.
 *
 * 44 pt remains the absolute accessibility floor.
 */
export function goldenControlHeight(screenWidth: number) {
  const calculatedHeight = screenWidth / PHI_FOURTH;

  return clamp(calculatedHeight, 44, 64);
}
