import { useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BottomNavigation, {
  type AppTab,
} from './src/components/BottomNavigation';
import DebugHealthAuthorizationControl from './src/components/DebugHealthAuthorizationControl';
import LibraryScreen from './src/screens/LibraryScreen';
import MedicationScreen from './src/screens/MedicationScreen';
import PrescriptionWalletScreen from './src/screens/PrescriptionWalletScreen';
import TodayScreen from './src/screens/TodayScreen';

import { usePersonalOSTheme } from './src/design-system';

type AppScreen = 'main' | 'medication' | 'prescriptionWallet';

function App() {
  const theme = usePersonalOSTheme();
  const [activeTab, setActiveTab] = useState<AppTab>('Today');
  const [activeScreen, setActiveScreen] = useState<AppScreen>('main');

  const handleTabPress = (tab: AppTab) => {
    setActiveTab(tab);
    setActiveScreen('main');
  };

  const renderScreen = () => {
    if (activeScreen === 'medication') {
      return <MedicationScreen onBack={() => setActiveScreen('main')} />;
    }

    if (activeScreen === 'prescriptionWallet') {
      return (
        <PrescriptionWalletScreen onBack={() => setActiveScreen('main')} />
      );
    }

    switch (activeTab) {
      case 'Library':
        return (
          <LibraryScreen
            onOpenMedication={() => setActiveScreen('medication')}
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
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      {renderScreen()}
      {__DEV__ && activeScreen === 'main' && activeTab === 'Today' && (
        <DebugHealthAuthorizationControl />
      )}
      {activeScreen === 'main' && (
        <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} />
      )}
    </SafeAreaProvider>
  );
}

export default App;
