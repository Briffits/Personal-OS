export const palette = {
  petrol: '#245C6A',
  petrolSubtle: '#E9F1F3',
  amber: '#D4942B',

  white: '#FFFFFF',

  lightBackground: '#F7F8FA',
  lightTextPrimary: '#1B1D1F',
  lightTextSecondary: '#5B5F63',

  darkBackground: '#121416',
  darkSurface: '#1C2023',
  darkTextPrimary: '#F5F7F8',
  darkTextSecondary: '#B8BEC3',
} as const;

export const lightColours = {
  background: palette.lightBackground,
  surface: palette.white,

  textPrimary: palette.lightTextPrimary,
  textSecondary: palette.lightTextSecondary,

  primary: palette.petrol,
  primarySubtle: palette.petrolSubtle,
  attention: palette.amber,
} as const;

export const darkColours = {
  background: palette.darkBackground,
  surface: palette.darkSurface,

  textPrimary: palette.darkTextPrimary,
  textSecondary: palette.darkTextSecondary,

  primary: palette.petrol,
  primarySubtle: palette.petrolSubtle,
  attention: palette.amber,
} as const;
