import { ActionSheetIOS, Pressable, StyleSheet, Text } from 'react-native';
import AppCard from '../design-system/components/AppCard';
import {
  layout,
  radius,
  spacing,
  typography,
  usePersonalOSTheme,
} from '../design-system';
import {
  getPrescriptionExpiryStatus,
  type PrescriptionRecord,
} from '../prescriptions/prescription';

type Props = {
  record: PrescriptionRecord;
  today: string;
  busy: boolean;
  mutationDisabled: boolean;
  onView: () => void;
  onEdit: () => void;
  onReplace: () => void;
  onDelete: () => void;
};

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${day} ${months[month - 1]} ${year}`;
}

export default function PrescriptionCard({
  record,
  today,
  busy,
  mutationDisabled,
  onView,
  onEdit,
  onReplace,
  onDelete,
}: Props) {
  const theme = usePersonalOSTheme();
  const name = record.displayName ?? 'Unnamed prescription';
  const metadata = `${
    record.kind === 'standard' ? 'Standard' : 'Temporary'
  } · Expires ${formatDate(record.expiresOn)}`;
  const expiryStatus = getPrescriptionExpiryStatus(record, today);
  const badge =
    expiryStatus === 'expired'
      ? 'EXPIRED'
      : expiryStatus === 'expiring-soon'
      ? 'EXPIRING SOON'
      : null;

  function perform(action: string) {
    if (busy) {
      return;
    }
    if (action === 'activate') {
      onView();
    } else if (!mutationDisabled) {
      if (action === 'edit') {
        onEdit();
      }
      if (action === 'replace') {
        onReplace();
      }
      if (action === 'delete') {
        onDelete();
      }
    }
  }

  function showActions() {
    if (busy || mutationDisabled) {
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: name,
        options: ['Edit details', 'Replace document', 'Delete', 'Cancel'],
        destructiveButtonIndex: 2,
        cancelButtonIndex: 3,
      },
      index => perform(['edit', 'replace', 'delete', 'cancel'][index]),
    );
  }

  return (
    <Pressable
      testID={`prescription-card-${record.id}`}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${metadata}${badge ? `, ${badge}` : ''}`}
      accessibilityHint="Opens the protected prescription viewer."
      accessibilityState={{ disabled: busy }}
      accessibilityActions={[
        { name: 'activate', label: 'View prescription' },
        ...(!mutationDisabled
          ? [
              { name: 'edit', label: 'Edit details' },
              { name: 'replace', label: 'Replace document' },
              { name: 'delete', label: 'Delete' },
            ]
          : []),
      ]}
      onAccessibilityAction={event => perform(event.nativeEvent.actionName)}
      disabled={busy}
      onPress={() => perform('activate')}
      onLongPress={showActions}
      style={styles.card}
    >
      <AppCard
        variant={
          expiryStatus === 'expired' || expiryStatus === 'expiring-soon'
            ? 'attention'
            : 'standard'
        }
      >
        <Text
          style={[typography.cardTitle, { color: theme.colours.textPrimary }]}
        >
          {name}
        </Text>
        <Text
          style={[
            typography.body,
            { color: theme.colours.textSecondaryOnSurface },
          ]}
        >
          {metadata}
        </Text>
        {badge && (
          <Text
            style={[
              typography.bodyStrong,
              styles.expiryBadge,
              {
                color: theme.colours.textPrimary,
                borderColor: theme.colours.textPrimary,
              },
            ]}
          >
            {badge}
          </Text>
        )}
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginVertical: spacing.md, minHeight: layout.minimumTouchTarget },
  expiryBadge: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderRadius: radius.badge,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
});
