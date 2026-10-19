import { useColorScheme } from 'react-native';
import { createTheme } from './theme/createTheme';

export function usePersonalOSTheme() {
  return createTheme(useColorScheme());
}
