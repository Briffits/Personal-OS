import { useEffect, useRef, useState } from 'react';
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
import MedicationCard, {
  medicationActions,
  type MedicationAction,
} from '../components/MedicationCard';
import MedicationForm from '../components/MedicationForm';
import {
  type MedicationCollection,
  type MedicationRecord,
  type MedicationDetails,
} from '../medications/medication';
import { medicationService as service } from '../medications/currentMedicationService';
type Editor =
  | { mode: 'add' | 'migrate'; snapshot: MedicationCollection }
  | { mode: 'edit'; record: MedicationRecord; snapshot: MedicationCollection };

export default function MedicationScreen({ onBack }: { onBack: () => void }) {
  const theme = usePersonalOSTheme();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<MedicationCollection | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const stateRef = useRef(state);
  const busyRef = useRef(true);
  const editorRef = useRef<Editor | null>(null);
  const interaction = useRef(false);
  const mounted = useRef(false);

  function update(next: MedicationCollection | null) {
    stateRef.current = next;
    setState(next);
  }
  function edit(next: Editor | null) {
    editorRef.current = next;
    setEditor(next);
  }
  async function reload() {
    try {
      const next = await service.read();
      if (mounted.current) {
        update(next);
        setFailed(false);
      }
    } catch {
      if (mounted.current) {
        update(null);
        setFailed(true);
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    reload().finally(() => {
      if (mounted.current) {
        busyRef.current = false;
        setBusy(false);
      }
    });
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function available() {
    return (
      mounted.current &&
      !busyRef.current &&
      !interaction.current &&
      editorRef.current === null &&
      stateRef.current !== null
    );
  }
  async function run(operation: () => Promise<MedicationCollection>) {
    if (!mounted.current || busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setNotice('');
    try {
      const next = await operation();
      if (mounted.current) {
        update(next);
        edit(null);
        setNotice('Medication saved.');
      }
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : '';
      if (mounted.current) {
        if (code === 'invalid-input' || code === 'prescription-unavailable') {
          Alert.alert(
            code === 'invalid-input'
              ? 'Invalid amount'
              : 'Prescription unavailable',
            code === 'invalid-input'
              ? 'Enter a whole number of zero or more. Add stock requires a number greater than zero within the supported range.'
              : 'This prescription is no longer available. Choose another prescription or None / Unlinked.',
          );
        } else {
          edit(null);
          setNotice(
            'The change could not be confirmed. Check the reloaded medication list before trying again.',
          );
          await reload();
        }
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  function requestAction(record: MedicationRecord, action: MedicationAction) {
    if (!available()) {
      return;
    }
    const snapshot = stateRef.current!;
    // A callback from an old card must never act on a newer snapshot.
    if (snapshot.records.find(item => item.id === record.id) !== record) {
      return;
    }
    if (action === 'edit') {
      edit({ mode: 'edit', record, snapshot });
      return;
    }
    interaction.current = true;
    let consumed = false;
    function consume() {
      if (consumed) {
        return false;
      }
      consumed = true;
      interaction.current = false;
      return (
        mounted.current && !busyRef.current && stateRef.current === snapshot
      );
    }
    if (action === 'delete') {
      Alert.alert(
        'Delete medication',
        `Delete ${record.displayName} and its recorded stock? Its prescription will be kept.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              consume();
            },
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              if (consume()) {
                return run(() => service.remove(snapshot, record.id));
              }
            },
          },
        ],
        {
          cancelable: true,
          onDismiss: () => {
            consume();
          },
        },
      );
      return;
    }
    const stockAction =
      action === 'correct' && record.stock === null ? 'record' : action;
    const title =
      stockAction === 'add'
        ? 'Add stock'
        : stockAction === 'record'
        ? 'Record current stock'
        : 'Correct stock';
    Alert.prompt(
      title,
      stockAction === 'add'
        ? 'Enter the number of tablets to add.'
        : 'Enter the number of tablets you physically have. This becomes the recorded total.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            consume();
          },
        },
        {
          text:
            stockAction === 'add'
              ? 'Add'
              : stockAction === 'record'
              ? 'Record'
              : 'Replace total',
          onPress: value => {
            if (consume()) {
              return run(() =>
                service.changeStock(
                  snapshot,
                  record.id,
                  stockAction,
                  value ?? '',
                ),
              );
            }
          },
        },
      ],
      'plain-text',
      '',
      'number-pad',
    );
  }

  function showActions(record: MedicationRecord) {
    if (!available()) {
      return;
    }
    interaction.current = true;
    let consumed = false;
    const actions = medicationActions(record);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: record.displayName,
        options: [...actions.map(action => action.label), 'Cancel'],
        destructiveButtonIndex: 3,
        cancelButtonIndex: actions.length,
      },
      index => {
        if (consumed) {
          return;
        }
        consumed = true;
        interaction.current = false;
        const action = actions[index];
        if (action) {
          requestAction(record, action.name);
        }
      },
    );
  }
  async function saveDetails(session: Editor, details: MedicationDetails) {
    if (!mounted.current || editorRef.current !== session) {
      return;
    }
    await run(() =>
      session.mode === 'migrate'
        ? service.completeLegacy(session.snapshot, details.displayName)
        : service.saveDetails(
            session.snapshot,
            details,
            session.mode === 'edit' ? session.record.id : undefined,
          ),
    );
  }
  function button(label: string, onPress: () => void, disabled = busy) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={styles.action}
      >
        <Text style={[typography.bodyStrong, { color: theme.colours.action }]}>
          {label}
        </Text>
      </Pressable>
    );
  }
  const text = [typography.body, { color: theme.colours.textPrimary }];
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colours.background }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: goldenScreenPadding(width) },
        ]}
      >
        {button('Back to Library', () => {
          if (!busyRef.current && !interaction.current) {
            onBack();
          }
        })}
        <Text
          accessibilityRole="header"
          style={[
            typography.screenTitle,
            styles.title,
            { color: theme.colours.textPrimary },
          ]}
        >
          Medication
        </Text>
        {button(
          'Add medication',
          () => {
            if (available() && stateRef.current!.pendingLegacy === null) {
              edit({ mode: 'add', snapshot: stateRef.current! });
            }
          },
          busy || !state || !!state.pendingLegacy || !!editor,
        )}
        {busy && !state && !failed && (
          <Text style={text}>Loading medications…</Text>
        )}
        {failed && (
          <>
            <Text accessibilityRole="alert" style={text}>
              Your saved medications could not be read. Retry before making
              changes.
            </Text>
            {button('Retry loading medications', async () => {
              if (busyRef.current) {
                return;
              }
              busyRef.current = true;
              setBusy(true);
              await reload();
              busyRef.current = false;
              if (mounted.current) {
                setBusy(false);
              }
            })}
          </>
        )}
        {notice !== '' && (
          <Text accessibilityRole="alert" style={text}>
            {notice}
          </Text>
        )}
        {state?.pendingLegacy && (
          <AppCard variant="attention" style={styles.card}>
            <Text style={text}>Saved medication — name needed</Text>
            <Text style={text}>
              Recorded stock: {state.pendingLegacy.stock} tablets
            </Text>
            <Text style={text}>
              Enter a name to finish keeping this medication. Your saved stock
              is preserved.
            </Text>
            {button(
              'Complete medication details',
              () => {
                if (available()) {
                  edit({ mode: 'migrate', snapshot: stateRef.current! });
                }
              },
              busy || !!editor,
            )}
          </AppCard>
        )}
        {editor ? (
          <AppCard style={styles.card}>
            <Text
              accessibilityRole="header"
              style={[
                typography.cardTitle,
                { color: theme.colours.textPrimary },
              ]}
            >
              {editor.mode === 'add'
                ? 'New medication'
                : editor.mode === 'migrate'
                ? 'Complete medication details'
                : 'Edit medication'}
            </Text>
            <MedicationForm
              initial={editor.mode === 'edit' ? editor.record : undefined}
              migration={editor.mode === 'migrate'}
              busy={busy}
              onSave={details => saveDetails(editor, details)}
              onCancel={() => {
                if (!busyRef.current) {
                  edit(null);
                }
              }}
            />
          </AppCard>
        ) : (
          <>
            {state?.records.length === 0 && !state.pendingLegacy && (
              <Text style={text}>
                No medications saved. Add a medication to get started.
              </Text>
            )}
            {state?.records.map(record => (
              <MedicationCard
                key={record.id}
                record={record}
                disabled={busy}
                onAction={action => requestAction(record, action)}
                onLongPress={() => showActions(record)}
              />
            ))}
          </>
        )}
        <Text
          style={[
            typography.caption,
            styles.note,
            { color: theme.colours.textSecondary },
          ]}
        >
          Touch and hold a card for actions. Stock is saved on this device and
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
  card: { marginVertical: spacing.sm },
  note: { marginTop: spacing.lg },
  action: { minHeight: layout.minimumTouchTarget, justifyContent: 'center' },
});
