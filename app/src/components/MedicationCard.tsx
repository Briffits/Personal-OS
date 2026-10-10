import { Pressable, StyleSheet, Text } from 'react-native';
import AppCard from '../design-system/components/AppCard';
import {
  layout,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';
import type { MedicationRecord } from '../medications/medication';

export type MedicationAction = 'add' | 'record' | 'correct' | 'edit' | 'delete';
export function medicationActions(record: MedicationRecord) {
  return [
    record.stock === null
      ? { name: 'record' as const, label: 'Record current stock' }
      : { name: 'add' as const, label: 'Add stock' },
    { name: 'correct' as const, label: 'Correct stock' },
    { name: 'edit' as const, label: 'Edit medication' },
    { name: 'delete' as const, label: 'Delete medication' },
  ];
}

export default function MedicationCard({
  record,
  disabled,
  onAction,
  onLongPress,
}: {
  record: MedicationRecord;
  disabled: boolean;
  onAction: (action: MedicationAction) => void;
  onLongPress: () => void;
}) {
  const theme = usePersonalOSTheme();
  const description =
    record.stock === null
      ? 'Stock not recorded'
      : `Recorded stock: ${record.stock} tablets`;
  const actions = disabled ? [] : medicationActions(record);
  return (
    <AppCard style={styles.card}>
      <Pressable
        testID={`medication-card-${record.id}`}
        accessible
        accessibilityLabel={`${record.displayName}, ${description}`}
        accessibilityHint="Touch and hold for medication actions, or use accessibility actions."
        accessibilityState={{ disabled }}
        accessibilityActions={actions}
        onAccessibilityAction={event => {
          const action = actions.find(
            item => item.name === event.nativeEvent.actionName,
          );
          if (action) {
            onAction(action.name);
          }
        }}
        disabled={disabled}
        onLongPress={onLongPress}
        style={styles.summary}
      >
        <Text
          style={[typography.cardTitle, { color: theme.colours.textPrimary }]}
        >
          {record.displayName}
        </Text>
        <Text style={[typography.body, { color: theme.colours.textSecondary }]}>
          {description}
        </Text>
      </Pressable>
    </AppCard>
  );
}
const styles = StyleSheet.create({
  card: { marginVertical: spacing.sm },
  summary: { minHeight: layout.minimumTouchTarget, justifyContent: 'center' },
});
