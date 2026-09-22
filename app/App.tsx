import {useState} from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import BottomNavigation, {
  type AppTab,
} from './src/components/BottomNavigation';
import LibraryScreen from './src/screens/LibraryScreen';
import TodayScreen from './src/screens/TodayScreen';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [activeTab, setActiveTab] = useState<AppTab>('Today');

  const renderScreen = () => {
    switch (activeTab) {
      case 'Library':
        return <LibraryScreen />;
      case 'Ask':
      case 'Capture':
      case 'Today':
      default:
        return <TodayScreen />;
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {renderScreen()}
      <BottomNavigation activeTab={activeTab} onTabPress={setActiveTab} />
    </SafeAreaProvider>
  );
}

export default App;
