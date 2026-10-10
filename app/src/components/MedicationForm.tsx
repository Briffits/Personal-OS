import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  layout,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';
import {
  validateDetails,
  type MedicationDetails,
} from '../medications/medication';
import { NativePrescriptionDocuments } from '../native/NativePrescriptionDocuments';
import type { PrescriptionRecord } from '../prescriptions/prescription';

export default function MedicationForm({
  initial,
  busy,
  migration = false,
  onSave,
  onCancel,
}: {
  initial?: MedicationDetails;
  busy: boolean;
  migration?: boolean;
  onSave: (details: MedicationDetails) => Promise<void>;
  onCancel: () => void;
}) {
  const theme = usePersonalOSTheme();
  const [displayName, setName] = useState(initial?.displayName ?? '');
  const [prescriptionId, setPrescriptionId] = useState(
    initial?.prescriptionId ?? null,
  );
  const [choices, setChoices] = useState<PrescriptionRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const reading = useRef(false);
  async function loadChoices() {
    if (reading.current || migration) {
      return;
    }
    reading.current = true;
    setStatus('loading');
    try {
      const state = await NativePrescriptionDocuments.read();
      if (mounted.current) {
        setChoices([...state.records]);
        setStatus('ready');
      }
    } catch {
      if (mounted.current) {
        setStatus('error');
      }
    } finally {
      reading.current = false;
    }
  }
  useEffect(() => {
    mounted.current = true;
    loadChoices();
    return () => {
      mounted.current = false;
    };
    // A form is mounted once per edit session; selection is never reset on reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const text = { color: theme.colours.textPrimary };
  function button(label: string, action: () => void) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={action}
        style={styles.action}
      >
        <Text style={[typography.bodyStrong, { color: theme.colours.primary }]}>
          {label}
        </Text>
      </Pressable>
    );
  }
  function option(id: string | null, label: string) {
    return (
      <Pressable
        key={id ?? 'none'}
        testID={`medication-prescription-${id ?? 'none'}`}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ checked: prescriptionId === id, disabled: busy }}
        disabled={busy}
        onPress={() => setPrescriptionId(id)}
        style={styles.action}
      >
        <Text style={[typography.body, text]}>
          {prescriptionId === id ? '✓ ' : ''}
          {label}
        </Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.form}>
      <Text style={[typography.bodyStrong, text]}>
        Medication name (required)
      </Text>
      <TextInput
        accessibilityLabel="Medication name (required)"
        value={displayName}
        onChangeText={setName}
        editable={!busy}
        style={[
          typography.body,
          styles.input,
          text,
          { borderColor: theme.colours.textSecondary },
        ]}
      />
      {!migration && (
        <>
          <Text style={[typography.bodyStrong, text]}>
            Prescription (optional)
          </Text>
          {option(null, 'None / Unlinked')}
          {status === 'loading' && (
            <Text style={[typography.body, text]}>Loading prescriptions…</Text>
          )}
          {status === 'error' && (
            <>
              <Text accessibilityRole="alert" style={[typography.body, text]}>
                Prescriptions could not be loaded. You can keep the current
                selection or choose None / Unlinked.
              </Text>
              {button('Retry prescription choices', loadChoices)}
            </>
          )}
          {status === 'ready' && choices.length === 0 && (
            <Text style={[typography.body, text]}>
              No saved prescriptions to select.
            </Text>
          )}
          {choices.map((record, index) =>
            option(
              record.id,
              `${index + 1}. ${
                record.displayName ?? 'Unnamed prescription'
              } · ${record.kind} · Expires ${record.expiresOn}`,
            ),
          )}
          {prescriptionId !== null &&
            !choices.some(record => record.id === prescriptionId) && (
              <Text style={[typography.body, text]}>
                Current prescription selection retained; details unavailable.
              </Text>
            )}
        </>
      )}
      {error !== '' && (
        <Text accessibilityRole="alert" style={[typography.body, text]}>
          {error}
        </Text>
      )}
      {button('Save medication', async () => {
        if (busy) {
          return;
        }
        let details: MedicationDetails;
        try {
          details = validateDetails({ displayName, prescriptionId });
        } catch {
          setError('Enter a medication name.');
          return;
        }
        setError('');
        await onSave(details);
      })}
      {button('Cancel medication details', onCancel)}
    </View>
  );
}
const styles = StyleSheet.create({
  form: { gap: spacing.sm },
  action: { minHeight: layout.minimumTouchTarget, justifyContent: 'center' },
  input: {
    minHeight: layout.minimumTouchTarget,
    borderWidth: 1,
    padding: spacing.sm,
  },
});
