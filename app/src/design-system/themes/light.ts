
import {lightColours} from '../tokens/colours';

export const lightTheme = {
  colours: lightColours,
  isDark: false,
} as const;

export type LightTheme = typeof lightTheme;
