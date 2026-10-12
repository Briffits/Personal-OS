import { brand, legacyDark } from '../tokens/brand';
import type { PersonalOSTheme } from './types';

const lightTheme: PersonalOSTheme = {
  isDark: false,
  colours: {
    background: brand.warmWhite,
    navigationSurface: brand.warmWhite,
    cardStandard: brand.sageSurface,
    cardAttention: brand.apricotSurface,
    textPrimary: brand.slate,
    textSecondary: brand.mutedSlate,
    textSecondaryOnSurface: brand.tintedSlate,
    action: brand.slate,
    borderSubtle: brand.neutralBorder,
    borderControl: brand.tintedSlate,
  },
};

const darkTheme: PersonalOSTheme = {
  isDark: true,
  colours: {
    background: legacyDark.background,
    navigationSurface: legacyDark.surface,
    cardStandard: legacyDark.surface,
    cardAttention: legacyDark.surface,
    textPrimary: legacyDark.textPrimary,
    textSecondary: legacyDark.textSecondary,
    textSecondaryOnSurface: legacyDark.textSecondary,
    action: legacyDark.action,
    borderSubtle: legacyDark.surface,
    borderControl: legacyDark.textSecondary,
  },
};

/** Reuse immutable theme objects; an unavailable system preference uses light. */
export function createTheme(
  scheme: 'light' | 'dark' | null | undefined,
): PersonalOSTheme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}
