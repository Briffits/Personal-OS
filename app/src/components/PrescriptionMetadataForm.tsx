import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  layout,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';
import {
  validatePrescriptionMetadata,
  type PrescriptionMetadata,
} from '../prescriptions/prescription';

type Props = {
  initial?: PrescriptionMetadata;
  busy: boolean;
  onSave: (metadata: PrescriptionMetadata) => Promise<void>;
  onCancel: () => void;
};

export default function PrescriptionMetadataForm({
  initial,
  busy,
  onSave,
  onCancel,
}: Props) {
  const theme = usePersonalOSTheme();
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [kind, setKind] = useState<PrescriptionMetadata['kind'] | null>(
    initial?.kind ?? null,
  );
  const [expiresOn, setExpiresOn] = useState(initial?.expiresOn ?? '');
  const [issuedOn, setIssuedOn] = useState(initial?.issuedOn ?? '');
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? '');
  const [error, setError] = useState('');

  const save = async () => {
    let metadata: PrescriptionMetadata;
    try {
      if (kind === null) {
        setError('Choose Standard or Temporary.');
        return;
      }
      if (!displayName.trim()) {
        setError('Enter a prescription name.');
        return;
      }
      metadata = validatePrescriptionMetadata({
        displayName: displayName.trim(),
        kind,
        // Preserve existing relationships on edits. Linking has no Medication UI yet.
        medicationIds: initial?.medicationIds ?? [],
        expiresOn: expiresOn.trim(),
        ...(issuedOn.trim() ? { issuedOn: issuedOn.trim() } : {}),
        ...(kind === 'temporary' && startsOn.trim()
          ? { startsOn: startsOn.trim() }
          : {}),
      });
    } catch {
      setError(
        'Enter a valid expiry date. Optional dates must be valid and no later than expiry.',
      );
      return;
    }
    setError('');
    await onSave(metadata);
  };

  return (
    <View style={styles.form}>
      <Text style={[typography.body, { color: theme.colours.textSecondary }]}>
        Choose a name to help you identify this prescription. Enter the dates
        shown on it using YYYY-MM-DD.
      </Text>
      <Text
        style={[typography.bodyStrong, { color: theme.colours.textPrimary }]}
      >
        Prescription name (required)
      </Text>
      <TextInput
        accessibilityLabel="Prescription name (required)"
        value={displayName}
        onChangeText={setDisplayName}
        editable={!busy}
        style={[
          typography.body,
          styles.input,
          {
            color: theme.colours.textPrimary,
            borderColor: theme.colours.textSecondary,
          },
        ]}
      />
      <Text
        style={[typography.bodyStrong, { color: theme.colours.textPrimary }]}
      >
        Prescription type
      </Text>
      <View style={styles.types}>
        {(['standard', 'temporary'] as const).map(value => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={value === 'standard' ? 'Standard' : 'Temporary'}
            accessibilityState={{ checked: kind === value, disabled: busy }}
            disabled={busy}
            onPress={() => setKind(value)}
            style={styles.action}
          >
            <Text
              style={[typography.bodyStrong, { color: theme.colours.primary }]}
            >
              {kind === value ? '✓ ' : ''}
              {value === 'standard' ? 'Standard' : 'Temporary'}
            </Text>
          </Pressable>
        ))}
      </View>
      {[
        {
          label: 'Expiry date (required)',
          value: expiresOn,
          update: setExpiresOn,
        },
        {
          label: 'Issue date (optional)',
          value: issuedOn,
          update: setIssuedOn,
        },
        ...(kind === 'temporary'
          ? [
              {
                label: 'Start date (optional)',
                value: startsOn,
                update: setStartsOn,
              },
            ]
          : []),
      ].map(field => (
        <View key={field.label}>
          <Text
            style={[
              typography.bodyStrong,
              { color: theme.colours.textPrimary },
            ]}
          >
            {field.label}
          </Text>
          <TextInput
            accessibilityLabel={field.label}
            value={field.value}
            onChangeText={field.update}
            editable={!busy}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colours.textSecondary}
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            style={[
              typography.body,
              styles.input,
              {
                color: theme.colours.textPrimary,
                borderColor: theme.colours.textSecondary,
              },
            ]}
          />
        </View>
      ))}
      {error !== '' && (
        <Text
          accessibilityRole="alert"
          style={[typography.body, { color: theme.colours.textPrimary }]}
        >
          {error}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save prescription details"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={save}
        style={styles.action}
      >
        <Text style={[typography.bodyStrong, { color: theme.colours.primary }]}>
          Save details
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel prescription details"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onCancel}
        style={styles.action}
      >
        <Text style={[typography.bodyStrong, { color: theme.colours.primary }]}>
          Cancel
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  action: { minHeight: layout.minimumTouchTarget, justifyContent: 'center' },
  input: {
    minHeight: layout.minimumTouchTarget,
    borderWidth: 1,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
});
