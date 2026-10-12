/** Approved light palette. Icon anchors are representative samples from the
 * production-study rendering, not a clean source icon (not yet in this repo). */
export const brand = {
  warmWhite: '#F8F8F6',
  slate: '#273746',
  mutedSlate: '#667482',
  tintedSlate: '#566570',
  neutralBorder: '#DCE2E6',
  deepSlateIcon: '#4B6C83',
  sageIcon: '#8EB5AE',
  apricotIcon: '#F9A466',
  sageSurface: '#E8F0EF',
  apricotSurface: '#FEEDE0',
} as const;

/** Compatibility-only values: preserve the existing dark presentation. */
export const legacyDark = {
  background: '#121416',
  surface: '#1C2023',
  textPrimary: '#F5F7F8',
  textSecondary: '#B8BEC3',
  action: '#245C6A',
} as const;
