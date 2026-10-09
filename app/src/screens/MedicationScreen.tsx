import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
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

import {
  DEFAULT_MEDICATION_NAME,
  loadMedicationName,
  saveMedicationName,
} from '../storage/medicationNameStorage';

type StockState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; count: number | null; name: string };
type MedicationAction = 'record' | 'add' | 'correct' | 'rename';

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
      // Settle both reads before releasing the retry/mutation guard.
      const [stockResult, nameResult] = await Promise.allSettled([
        loadMedicationStock(),
        loadMedicationName(),
      ]);
      if (
        stockResult.status === 'rejected' ||
        nameResult.status === 'rejected'
      ) {
        throw new Error('Unable to load medication.');
      }
      if (mounted.current) {
        updateState({
          status: 'ready',
          count: stockResult.value,
          name: nameResult.value,
        });
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

  function requestAction(action: MedicationAction) {
    const state = currentStock.current;
    if (
      !mounted.current ||
      busy.current ||
      promptOpen.current ||
      state.status !== 'ready' ||
      ((action === 'add' || action === 'correct') && state.count === null) ||
      (action === 'record' && state.count !== null)
    ) {
      return;
    }
    promptOpen.current = true;
    // Native callbacks can outlive their presentation; each prompt may submit only once.
    let consumed = false;
    const title =
      action === 'rename'
        ? 'Edit medication name'
        : action === 'add'
        ? 'Add stock'
        : action === 'record'
        ? 'Record current stock'
        : 'Correct stock';
    Alert.prompt(
      title,
      action === 'rename'
        ? 'Enter a name for this medication.'
        : action === 'add'
        ? 'Enter the number of tablets to add.'
        : action === 'record'
        ? 'Enter the current number of tablets you physically have.'
        : 'Enter the current number of tablets you physically have. This replaces the recorded stock total.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            if (!consumed) {
              consumed = true;
              promptOpen.current = false;
            }
          },
        },
        {
          text:
            action === 'rename'
              ? 'Save'
              : action === 'add'
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
              action === 'rename'
                ? !input
                : !/^\d+$/.test(input) ||
                  !Number.isSafeInteger(amount) ||
                  amount < (action === 'add' ? 1 : 0) ||
                  !Number.isSafeInteger(total)
            ) {
              Alert.alert(
                action === 'rename' ? 'Invalid name' : 'Invalid amount',
                action === 'rename'
                  ? 'Enter a medication name.'
                  : action === 'add'
                  ? 'Enter a whole number greater than zero within the supported range.'
                  : 'Enter a whole number of zero or more within the supported range.',
              );
              return;
            }
            // A ref closes the gap before React renders the disabled controls.
            busy.current = true;
            setSaving(true);
            try {
              if (action === 'rename') {
                await saveMedicationName(input);
              } else {
                await saveMedicationStock(total);
              }
              if (mounted.current) {
                updateState({
                  ...state,
                  ...(action === 'rename' ? { name: input } : { count: total }),
                });
              }
            } catch {
              if (mounted.current) {
                Alert.alert(
                  action === 'rename'
                    ? 'Unable to save name'
                    : 'Unable to save stock',
                  action === 'rename'
                    ? 'Your medication name could not be saved. Please try again.'
                    : 'Your stock amount could not be saved. Please try again.',
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
      action === 'rename' ? state.name : '',
      action === 'rename' ? 'default' : 'number-pad',
    );
  }

  const recorded = stock.status === 'ready' && stock.count !== null;
  const disabled = stock.status !== 'ready' || saving;
  const name = stock.status === 'ready' ? stock.name : DEFAULT_MEDICATION_NAME;
  const actions: { name: MedicationAction; label: string }[] = disabled
    ? []
    : [
        ...(recorded
          ? [
              { name: 'add' as const, label: 'Add stock' },
              { name: 'correct' as const, label: 'Correct stock' },
            ]
          : [{ name: 'record' as const, label: 'Record current stock' }]),
        { name: 'rename', label: 'Edit medication name' },
      ];

  function showActions() {
    if (
      !mounted.current ||
      busy.current ||
      promptOpen.current ||
      currentStock.current.status !== 'ready'
    ) {
      return;
    }
    promptOpen.current = true;
    let consumed = false;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: currentStock.current.name,
        options: [...actions.map(action => action.label), 'Cancel'],
        cancelButtonIndex: actions.length,
      },
      index => {
        if (consumed) {
          return;
        }
        consumed = true;
        promptOpen.current = false;
        const action = actions[index];
        if (action) {
          requestAction(action.name);
        }
      },
    );
  }

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
            accessibilityLabel={`${name}, ${stockDescription}`}
            accessibilityHint="Touch and hold for medication actions, or use accessibility actions."
            accessibilityRole={stock.status === 'error' ? 'alert' : undefined}
            accessibilityState={{ busy: saving || stock.status === 'loading' }}
            style={styles.summary}
            accessibilityActions={actions}
            onAccessibilityAction={event => {
              const action = actions.find(
                item => item.name === event.nativeEvent.actionName,
              );
              if (action) {
                requestAction(action.name);
              }
            }}
            onLongPress={showActions}
          >
            <Text style={[typography.cardTitle, textColour]}>{name}</Text>
            <Text style={[typography.bodyStrong, styles.stock, textColour]}>
              {stockDescription}
            </Text>
          </Pressable>
          {stock.status === 'error' && (
            <>
              <Text style={[typography.body, textColour]}>
                Your saved medication details could not be read. Retry before
                making changes.
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
          {saving && (
            <Text
              accessibilityRole="alert"
              style={[typography.body, textColour]}
            >
              Saving medication…
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
          Touch and hold the card for actions. Stock is saved on this device and
          updated manually.
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
  action: {
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
    justifyContent: 'center',
  },
  note: { marginTop: spacing.lg },
});

export default MedicationScreen;
