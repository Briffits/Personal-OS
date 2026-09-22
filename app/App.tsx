import {useState} from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import BottomNavigation, {
  type AppTab,
} from './src/components/BottomNavigation';
import LibraryScreen from './src/screens/LibraryScreen';
import PrescriptionWalletScreen from './src/screens/PrescriptionWalletScreen';
import TodayScreen from './src/screens/TodayScreen';

type AppScreen = 'main' | 'prescriptionWallet';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [activeTab, setActiveTab] = useState<AppTab>('Today');
  const [activeScreen, setActiveScreen] = useState<AppScreen>('main');

  const handleTabPress = (tab: AppTab) => {
    setActiveTab(tab);
    setActiveScreen('main');
  };

  const renderScreen = () => {
    if (activeScreen === 'prescriptionWallet') {
      return (
        <PrescriptionWalletScreen
          onBack={() => setActiveScreen('main')}
        />
      );
    }

    switch (activeTab) {
      case 'Library':
        return (
          <LibraryScreen
            onOpenPrescriptionWallet={() =>
              setActiveScreen('prescriptionWallet')
            }
          />
        );
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
      {activeScreen === 'main' && (
        <BottomNavigation
          activeTab={activeTab}
          onTabPress={handleTabPress}
        />
      )}
    </SafeAreaProvider>
  );
}

export default App;
