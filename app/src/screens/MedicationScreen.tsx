import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppCard from '../design-system/components/AppCard';
import {
  goldenScreenPadding,
  layout,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';
import {
  loadMedicationStock,
  saveMedicationStock,
} from '../storage/medicationStockStorage';

type StockState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; count: number | null };
type StockAction = 'record' | 'add' | 'correct';

function MedicationScreen({ onBack }: { onBack: () => void }) {
  const theme = usePersonalOSTheme();
  const { width } = useWindowDimensions();
  const [stock, setStock] = useState<StockState>({ status: 'loading' });
  const [saving, setSaving] = useState(false);
  const currentStock = useRef(stock);
  const busy = useRef(false);
  const promptOpen = useRef(false);
  const mounted = useRef(false);

  const updateState = useCallback((next: StockState) => {
    currentStock.current = next;
    setStock(next);
  }, []);

  const loadStock = useCallback(async () => {
    if (!mounted.current || busy.current) {
      return;
    }
    busy.current = true;
    updateState({ status: 'loading' });
    try {
      const count = await loadMedicationStock();
      if (mounted.current) {
        updateState({ status: 'ready', count });
      }
    } catch {
      if (mounted.current) {
        updateState({ status: 'error' });
      }
    } finally {
      busy.current = false;
    }
  }, [updateState]);

  useEffect(() => {
    mounted.current = true;
    loadStock();
    return () => {
      mounted.current = false;
    };
  }, [loadStock]);

  function requestStock(action: StockAction) {
    const state = currentStock.current;
    if (
      !mounted.current ||
      busy.current ||
      promptOpen.current ||
      state.status !== 'ready' ||
      (action !== 'record' && state.count === null) ||
      (action === 'record' && state.count !== null)
    ) {
      return;
    }
    promptOpen.current = true;
    // Native callbacks can outlive their presentation; each prompt may submit only once.
    let consumed = false;
    const title =
      action === 'add'
        ? 'Add stock'
        : action === 'record'
        ? 'Record current stock'
        : 'Correct stock';
    Alert.prompt(
      title,
      action === 'add'
        ? 'Enter the number of tablets to add.'
        : action === 'record'
        ? 'Enter the current number of tablets you physically have.'
        : 'Enter the current number of tablets you physically have. This replaces the recorded stock total.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            consumed = true;
            promptOpen.current = false;
          },
        },
        {
          text:
            action === 'add'
              ? 'Add'
              : action === 'record'
              ? 'Record'
              : 'Replace total',
          onPress: async value => {
            if (consumed) {
              return;
            }
            consumed = true;
            promptOpen.current = false;
            if (
              !mounted.current ||
              busy.current ||
              currentStock.current.status !== 'ready'
            ) {
              return;
            }
            const input = value?.trim() ?? '';
            const amount = Number(input);
            const total =
              action === 'add' ? (state.count as number) + amount : amount;
            if (
              !/^\d+$/.test(input) ||
              !Number.isSafeInteger(amount) ||
              amount < (action === 'add' ? 1 : 0) ||
              !Number.isSafeInteger(total)
            ) {
              Alert.alert(
                'Invalid amount',
                action === 'add'
                  ? 'Enter a whole number greater than zero within the supported range.'
                  : 'Enter a whole number of zero or more within the supported range.',
              );
              return;
            }
            // A ref closes the gap before React renders the disabled controls.
            busy.current = true;
            setSaving(true);
            try {
              await saveMedicationStock(total);
              if (mounted.current) {
                updateState({ status: 'ready', count: total });
              }
            } catch {
              if (mounted.current) {
                Alert.alert(
                  'Unable to save stock',
                  'Your stock amount could not be saved. Please try again.',
                );
              }
            } finally {
              busy.current = false;
              if (mounted.current) {
                setSaving(false);
              }
            }
          },
        },
      ],
      'plain-text',
      '',
      'number-pad',
    );
  }

  function showActions() {
    if (
      !mounted.current ||
      busy.current ||
      promptOpen.current ||
      currentStock.current.status !== 'ready' ||
      currentStock.current.count === null
    ) {
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Medication A',
        options: ['Correct stock', 'Cancel'],
        cancelButtonIndex: 1,
      },
      index => {
        if (index === 0) {
          requestStock('correct');
        }
      },
    );
  }

  const recorded = stock.status === 'ready' && stock.count !== null;
  const disabled = stock.status !== 'ready' || saving;
  const stockDescription =
    stock.status === 'loading'
      ? 'Loading stock…'
      : stock.status === 'error'
      ? 'Unable to load stock'
      : stock.count === null
      ? 'Stock not recorded'
      : `Recorded stock: ${stock.count} tablets`;
  const textColour = { color: theme.colours.textPrimary };
  const actionColour = { color: theme.colours.primary };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colours.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: goldenScreenPadding(width) },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Library"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={() => {
            if (!busy.current || currentStock.current.status !== 'ready') {
              onBack();
            }
          }}
          style={styles.action}
        >
          <Text style={[typography.bodyStrong, actionColour]}>Back</Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[typography.screenTitle, styles.title, textColour]}
        >
          Medication
        </Text>
        <AppCard>
          <Pressable
            testID="medication-summary"
            accessible
            accessibilityLabel={`Medication A, ${stockDescription}`}
            accessibilityRole={stock.status === 'error' ? 'alert' : undefined}
            accessibilityState={{ busy: saving || stock.status === 'loading' }}
            style={styles.summary}
            accessibilityActions={
              recorded && !disabled
                ? [{ name: 'correct', label: 'Correct stock' }]
                : []
            }
            onAccessibilityAction={event => {
              if (event.nativeEvent.actionName === 'correct') {
                requestStock('correct');
              }
            }}
            onLongPress={showActions}
          >
            <Text style={[typography.cardTitle, textColour]}>Medication A</Text>
            <Text style={[typography.bodyStrong, styles.stock, textColour]}>
              {stockDescription}
            </Text>
          </Pressable>
          {stock.status === 'error' && (
            <>
              <Text style={[typography.body, textColour]}>
                Your saved stock could not be read. Retry before making changes.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry stock loading"
                onPress={loadStock}
                style={styles.action}
              >
                <Text style={[typography.bodyStrong, actionColour]}>Retry</Text>
              </Pressable>
            </>
          )}
          {stock.status === 'ready' && (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  recorded ? 'Add stock' : 'Record current stock'
                }
                accessibilityState={{ disabled, busy: saving }}
                disabled={disabled}
                onPress={() => requestStock(recorded ? 'add' : 'record')}
                style={styles.action}
              >
                <Text style={[typography.bodyStrong, actionColour]}>
                  {recorded ? 'Add stock' : 'Record current stock'}
                </Text>
              </Pressable>
              {recorded && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="More stock actions"
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  onPress={showActions}
                  style={styles.action}
                >
                  <Text style={[typography.bodyStrong, actionColour]}>
                    More…
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          {saving && (
            <Text
              accessibilityRole="alert"
              style={[typography.body, textColour]}
            >
              Saving stock…
            </Text>
          )}
        </AppCard>
        <Text
          style={[
            typography.caption,
            styles.note,
            { color: theme.colours.textSecondary },
          ]}
        >
          Stock is saved on this device and updated manually.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { paddingBottom: spacing.xxl },
  title: { marginTop: spacing.sm, marginBottom: spacing.lg },
  stock: { marginTop: spacing.sm },
  summary: { minHeight: layout.minimumTouchTarget },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    marginTop: spacing.sm,
  },
  action: {
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
    justifyContent: 'center',
  },
  note: { marginTop: spacing.lg },
});

export default MedicationScreen;
