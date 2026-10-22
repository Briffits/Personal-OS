import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  layout,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';
import {
  MedicationHealthError,
  NativeMedicationHealth,
} from '../native/NativeMedicationHealth';

// Diagnostic branch only. Mounting MedicationScreen can initialize/migrate
// storage, so this control calls the access-only adapter without that screen.
export default function DebugHealthAuthorizationControl() {
  const theme = usePersonalOSTheme();
  const mounted = useRef(false);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function requestAccess() {
    if (!__DEV__ || !mounted.current || pending.current) {
      return;
    }
    pending.current = true;
    setBusy(true);
    setNotice('');
    try {
      // A tap is the only trigger. Never query Health or touch application storage.
      await NativeMedicationHealth.requestMedicationAccess();
      if (mounted.current) {
        setNotice(
          'Request completed. Sheet appearance and read access are not verified.',
        );
      }
    } catch (error) {
      if (mounted.current) {
        const code = error instanceof MedicationHealthError ? error.code : '';
        setNotice(
          code === 'authorization-cancelled'
            ? 'Request reported cancellation. Sheet appearance and read access are not verified.'
            : code === 'health-unavailable'
            ? 'Apple Health medication access is unavailable. Read access has not been checked.'
            : 'Request could not be completed. Sheet appearance and read access are not verified.',
        );
      }
    } finally {
      pending.current = false;
      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  if (!__DEV__) {
    return null;
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colours.background }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Diagnostic: request Apple Health medication access"
        accessibilityHint="Tap only after Today is visibly interactive. Cancel without changing selections."
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={requestAccess}
        style={styles.action}
      >
        <Text style={[typography.bodyStrong, { color: theme.colours.action }]}>
          {busy
            ? 'Diagnostic request in progress…'
            : 'Diagnostic: request Apple Health medication access'}
        </Text>
      </Pressable>
      {notice !== '' && (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colours.textPrimary }]}
        >
          {notice}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: layout.screenPaddingHorizontal,
    paddingVertical: spacing.sm,
  },
  action: {
    minHeight: layout.minimumTouchTarget,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
});
