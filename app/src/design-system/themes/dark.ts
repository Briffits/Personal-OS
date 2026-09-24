import {darkColours} from '../tokens/colours';

export const darkTheme = {
  colours: darkColours,
  isDark: true,
} as const;

export type DarkTheme = typeof darkTheme;
