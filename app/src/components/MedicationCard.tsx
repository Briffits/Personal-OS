import {
  calculateStock,
  canChangeStock,
  recordedQuantity,
} from '../medications/medicationStock';
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
  const stockActions = canChangeStock(record)
    ? [
        recordedQuantity(record) === null
          ? { name: 'record' as const, label: 'Record current stock' }
          : { name: 'add' as const, label: 'Add stock' },
        { name: 'correct' as const, label: 'Correct stock' },
      ]
    : [];
  return [
    ...stockActions,
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
  const stock = calculateStock(record);
  const description =
    'quantity' in stock
      ? `Recorded stock: ${stock.quantity} units`
      : stock.status === 'unrecorded'
      ? 'Stock not recorded'
      : stock.status === 'health-unavailable'
      ? 'Current stock unavailable — linked stock is not calculated in this version.'
      : stock.status === 'confirmation-required'
      ? 'Stock needs confirmation — its saved source is not supported in this version.'
      : 'Saved stock could not be read.';
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
        <Text
          style={[
            typography.body,
            { color: theme.colours.textSecondaryOnSurface },
          ]}
        >
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
