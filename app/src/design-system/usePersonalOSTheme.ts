import {useColorScheme} from 'react-native';

import {darkTheme} from './themes/dark';
import {lightTheme} from './themes/light';

export function usePersonalOSTheme() {
  const colourScheme = useColorScheme();

  return colourScheme === 'dark' ? darkTheme : lightTheme;
}
