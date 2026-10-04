import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
  createPrescriptionService,
  PrescriptionWalletOperationError,
  type PrescriptionImportResult,
  type PrescriptionWalletState,
} from '../prescriptions/prescriptionService';
import {
  isPrescriptionExpired,
  type PrescriptionCandidateId,
  type PrescriptionMetadata,
  type PrescriptionRecord,
} from '../prescriptions/prescription';
import { NativePrescriptionDocuments } from '../native/NativePrescriptionDocuments';
import PrescriptionMetadataForm from '../components/PrescriptionMetadataForm';

function confirmChange(action: 'Replace' | 'Delete'): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      action + ' Prescription',
      action === 'Delete'
        ? 'Delete this saved prescription from Personal OS? The original source document will not be deleted.'
        : 'Replace the document for this prescription? Its details will stay the same.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: action, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

const prescriptionService = createPrescriptionService({
  store: NativePrescriptionDocuments,
  documents: NativePrescriptionDocuments,
  confirmReplacement: () => confirmChange('Replace'),
  confirmDeletion: () => confirmChange('Delete'),
});

function localDate() {
  const date = new Date();
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function WalletAction({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = usePersonalOSTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.action}
    >
      <Text style={[typography.bodyStrong, { color: theme.colours.primary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

type Editor =
  | { mode: 'add' | 'migrate' }
  | { mode: 'edit'; record: PrescriptionRecord };

export default function PrescriptionWalletScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const theme = usePersonalOSTheme();
  const { width } = useWindowDimensions();
  const [wallet, setWallet] = useState<PrescriptionWalletState | null>(null);
  const [busy, setBusy] = useState(true);
  const busyRef = useRef(true);
  const mounted = useRef(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [releasePending, setReleasePending] =
    useState<PrescriptionCandidateId | null>(null);
  const [notice, setNotice] = useState('');
  const [today, setToday] = useState(localDate);

  async function reload() {
    try {
      const next = await prescriptionService.getState();
      if (mounted.current) {
        setWallet(next);
        setLoadFailed(false);
        setEditor(current =>
          current?.mode === 'migrate' && !next.legacyDocumentId
            ? null
            : current,
        );
      }
    } catch {
      if (mounted.current) {
        setWallet(null);
        setLoadFailed(true);
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
    const timer = setInterval(() => setToday(localDate()), 60_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        setToday(localDate());
      }
    });
    return () => {
      mounted.current = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  async function run(operation: () => Promise<void>) {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setNotice('');
    try {
      await operation();
    } catch (error) {
      const uncertain =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'prescription_documents_commit_uncertain';
      const cancelled =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'prescription_documents_authentication_cancelled';
      if (uncertain) {
        setEditor(null);
        setNotice(
          'The change may have been saved. Check the reloaded wallet before trying again.',
        );
      } else if (
        !cancelled &&
        !(
          error instanceof PrescriptionWalletOperationError &&
          error.code === 'busy'
        )
      ) {
        Alert.alert(
          'Unable to complete prescription action',
          'Your prescription could not be accessed or changed. Please try again.',
        );
      }
    } finally {
      await reload();
      if (mounted.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function handleImport(result: PrescriptionImportResult) {
    const outcome =
      result.status === 'candidate-release-failed' ? result.outcome : result;
    if (result.status === 'candidate-release-failed') {
      setReleasePending(result.candidate);
      setNotice('Temporary import cleanup needs to be retried.');
    }
    if (outcome.status === 'saved' || outcome.status === 'cleanup-pending') {
      setEditor(null);
      if (result.status !== 'candidate-release-failed') {
        setNotice(
          outcome.status === 'saved'
            ? 'Prescription saved.'
            : 'Prescription saved. Document cleanup needs to be retried.',
        );
      }
    } else if (outcome.status === 'verification-required') {
      setEditor(null);
      setNotice(
        'The change may have been saved. Check the reloaded wallet before trying again.',
      );
    } else if (outcome.status === 'failed') {
      Alert.alert(
        'Unable to save prescription',
        'The prescription was not saved. Please try again.',
      );
    }
  }

  async function saveDetails(metadata: PrescriptionMetadata) {
    await run(async () => {
      if (editor?.mode === 'add') {
        handleImport(await prescriptionService.addPrescription(metadata));
      } else if (editor?.mode === 'edit') {
        await prescriptionService.updatePrescription(
          editor.record.id,
          metadata,
        );
        setEditor(null);
        setNotice('Prescription details saved.');
      } else if (editor?.mode === 'migrate' && wallet?.legacyDocumentId) {
        await prescriptionService.completeLegacyMigration(
          wallet.legacyDocumentId,
          metadata,
        );
        setEditor(null);
        setNotice('Saved prescription details completed.');
      }
    });
  }

  const mutationDisabled =
    busy ||
    wallet === null ||
    !!wallet.legacyDocumentId ||
    !!wallet.pendingCleanup.length ||
    releasePending !== null;
  const textStyle = [typography.body, { color: theme.colours.textPrimary }];
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colours.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: goldenScreenPadding(width) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <WalletAction
          label="Back to Library"
          onPress={onBack}
          disabled={busy}
        />
        <Text
          accessibilityRole="header"
          style={[
            typography.screenTitle,
            styles.title,
            { color: theme.colours.textPrimary },
          ]}
        >
          Prescriptions
        </Text>
        {loadFailed && (
          <AppCard style={styles.card}>
            <Text style={textStyle}>
              Prescriptions could not be loaded. Your saved documents have not
              been removed.
            </Text>
            <WalletAction
              label="Retry loading prescriptions"
              disabled={busy}
              onPress={() => run(async () => {})}
            />
          </AppCard>
        )}
        {busy && wallet === null && !loadFailed && (
          <Text style={textStyle}>Loading prescriptions…</Text>
        )}
        {notice !== '' && (
          <Text accessibilityRole="alert" style={textStyle}>
            {notice}
          </Text>
        )}
        {wallet && wallet.pendingCleanup.length > 0 && (
          <AppCard style={styles.card}>
            <Text style={textStyle}>
              A saved change needs document cleanup. You can still view retained
              prescriptions.
            </Text>
            <WalletAction
              label="Retry document cleanup"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  if (!(await prescriptionService.retryCleanup())) {
                    setNotice('Cleanup could not finish. Please try again.');
                  }
                })
              }
            />
          </AppCard>
        )}
        {releasePending && (
          <WalletAction
            label="Retry temporary cleanup"
            disabled={busy}
            onPress={() =>
              run(async () => {
                await prescriptionService.retryCandidateRelease(releasePending);
                setReleasePending(null);
              })
            }
          />
        )}
        {wallet?.legacyDocumentId && (
          <AppCard style={styles.card}>
            <Text
              style={[
                typography.cardTitle,
                { color: theme.colours.textPrimary },
              ]}
            >
              Saved prescription — details needed
            </Text>
            <Text style={textStyle}>
              Your saved document is still available. Choose its type and enter
              the expiry date shown on it.
            </Text>
            <WalletAction
              label="View saved prescription"
              disabled={busy}
              onPress={() =>
                run(async () => prescriptionService.viewLegacyPrescription())
              }
            />
            {editor === null && (
              <WalletAction
                label="Complete prescription details"
                disabled={busy || wallet.pendingCleanup.length > 0}
                onPress={() => setEditor({ mode: 'migrate' })}
              />
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
                ? 'Add prescription'
                : 'Prescription details'}
            </Text>
            <PrescriptionMetadataForm
              busy={
                busy ||
                wallet === null ||
                !!wallet.pendingCleanup.length ||
                releasePending !== null
              }
              initial={editor.mode === 'edit' ? editor.record : undefined}
              onSave={saveDetails}
              onCancel={() => setEditor(null)}
            />
          </AppCard>
        ) : (
          <>
            {wallet && (
              <WalletAction
                label="Add prescription"
                disabled={mutationDisabled}
                onPress={() => setEditor({ mode: 'add' })}
              />
            )}
            {wallet?.records.length === 0 && !wallet.legacyDocumentId && (
              <Text style={textStyle}>
                No prescriptions saved. Add one to keep it available here.
              </Text>
            )}
            {wallet?.records.map((record, index) => (
              <AppCard key={record.id} style={styles.card}>
                <Text
                  accessibilityRole="header"
                  style={[
                    typography.cardTitle,
                    { color: theme.colours.textPrimary },
                  ]}
                >
                  {record.kind === 'standard' ? 'Standard' : 'Temporary'}{' '}
                  prescription {index + 1}
                </Text>
                <Text style={textStyle}>Expires: {record.expiresOn}</Text>
                {isPrescriptionExpired(record, today) && (
                  <Text style={textStyle}>Expired</Text>
                )}
                {record.issuedOn && (
                  <Text style={textStyle}>Issued: {record.issuedOn}</Text>
                )}
                {record.startsOn && (
                  <Text style={textStyle}>Starts: {record.startsOn}</Text>
                )}
                <View style={styles.actions}>
                  <WalletAction
                    label={'View prescription ' + (index + 1)}
                    disabled={busy}
                    onPress={() =>
                      run(async () =>
                        prescriptionService.viewPrescription(record.id),
                      )
                    }
                  />
                  <WalletAction
                    label={'Edit details for prescription ' + (index + 1)}
                    disabled={mutationDisabled}
                    onPress={() => setEditor({ mode: 'edit', record })}
                  />
                  <WalletAction
                    label={'Replace document for prescription ' + (index + 1)}
                    disabled={mutationDisabled}
                    onPress={() =>
                      run(async () =>
                        handleImport(
                          await prescriptionService.replaceDocument(record.id),
                        ),
                      )
                    }
                  />
                  <WalletAction
                    label={'Delete prescription ' + (index + 1)}
                    disabled={mutationDisabled}
                    onPress={() =>
                      run(async () => {
                        const result =
                          await prescriptionService.deletePrescription(
                            record.id,
                          );
                        if (result.status !== 'cancelled') {
                          setNotice(
                            result.status === 'deleted'
                              ? 'Prescription deleted.'
                              : 'Prescription deleted. Document cleanup needs to be retried.',
                          );
                        }
                      })
                    }
                  />
                </View>
              </AppCard>
            ))}
          </>
        )}
        <Text
          style={[typography.caption, { color: theme.colours.textSecondary }]}
        >
          Documents are stored privately on this device. Expiry does not delete
          a prescription.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { paddingBottom: spacing.xxl },
  title: { marginTop: spacing.sm, marginBottom: spacing.xl },
  card: { marginVertical: spacing.md },
  actions: { gap: spacing.sm },
  action: { minHeight: layout.minimumTouchTarget, justifyContent: 'center' },
});
