import { useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BottomNavigation, {
  type AppTab,
} from './src/components/BottomNavigation';
import LibraryScreen from './src/screens/LibraryScreen';
import MedicationScreen from './src/screens/MedicationScreen';
import PrescriptionWalletScreen from './src/screens/PrescriptionWalletScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import TodayScreen from './src/screens/TodayScreen';
import UnavailableFeatureScreen from './src/screens/UnavailableFeatureScreen';

import { usePersonalOSTheme } from './src/design-system';

type AppScreen =
  | 'main'
  | 'medication'
  | 'prescriptionWallet'
  | 'settings'
  | 'reminders';

function App() {
  const theme = usePersonalOSTheme();
  const [activeTab, setActiveTab] = useState<AppTab>('Today');
  const [activeScreen, setActiveScreen] = useState<AppScreen>('main');

  const handleTabPress = (tab: AppTab) => {
    setActiveTab(tab);
    setActiveScreen('main');
  };

  const renderScreen = () => {
    if (activeScreen === 'reminders') {
      return <RemindersScreen onBack={() => setActiveScreen('main')} />;
    }
    if (activeScreen === 'settings') {
      return (
        <UnavailableFeatureScreen
          feature="Settings"
          onBack={() => setActiveScreen('main')}
        />
      );
    }

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
        return <UnavailableFeatureScreen feature={activeTab} />;
      case 'Today':
      default:
        return (
          <TodayScreen
            onOpenSettings={() => setActiveScreen('settings')}
            onOpenReminders={() => setActiveScreen('reminders')}
          />
        );
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      {renderScreen()}
      {activeScreen === 'main' && (
        <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} />
      )}
    </SafeAreaProvider>
  );
}

export default App;
