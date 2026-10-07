import React from 'react';
import { ActionSheetIOS, Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import PrescriptionWalletScreen from '../src/screens/PrescriptionWalletScreen';
import { NativePrescriptionDocuments } from '../src/native/NativePrescriptionDocuments';
import {
  loadMedicationStock,
  saveMedicationStock,
} from '../src/storage/medicationStockStorage';
import type {
  PrescriptionRecord,
  PrescriptionMetadata,
  PrescriptionDocumentId,
  PrescriptionCandidateId,
} from '../src/prescriptions/prescription';
import type { PrescriptionWalletState } from '../src/prescriptions/prescriptionService';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/native/NativePrescriptionDocuments', () => ({
  NativePrescriptionDocuments: {
    read: jest.fn(),
    select: jest.fn(),
    create: jest.fn(),
    replace: jest.fn(),
    remove: jest.fn(),
    updateMetadata: jest.fn(),
    migrateLegacy: jest.fn(),
    cleanup: jest.fn(),
    release: jest.fn(),
    open: jest.fn(),
  },
}));
jest.mock('../src/storage/medicationStockStorage', () => ({
  loadMedicationStock: jest.fn(),
  saveMedicationStock: jest.fn(),
}));

const native = jest.mocked(NativePrescriptionDocuments);
const metadata: PrescriptionMetadata = {
  kind: 'standard',
  medicationIds: [],
  expiresOn: '2099-01-01',
};
const first = {
  ...metadata,
  id: 'record-one',
  documentId: 'document-one',
} as PrescriptionRecord;
const second = {
  ...metadata,
  kind: 'temporary',
  expiresOn: '2000-01-01',
  id: 'record-two',
  documentId: 'document-two',
} as PrescriptionRecord;
const candidate = 'candidate' as PrescriptionCandidateId;
let state: PrescriptionWalletState;
let screen: ReactTestRenderer.ReactTestRenderer;
let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(native).forEach(method => method.mockReset());
  state = { records: [first, second], pendingCleanup: [] };
  native.read.mockImplementation(async () => state);
  native.select.mockResolvedValue(candidate);
  native.release.mockResolvedValue(undefined);
  native.open.mockResolvedValue(undefined);
  native.create.mockImplementation(async (_candidate, details) => {
    const record = {
      ...details,
      id: 'record-new',
      documentId: 'document-new',
    } as PrescriptionRecord;
    state = { ...state, records: [...state.records, record] };
    return record;
  });
  native.replace.mockImplementation(async (_candidate, expected) => {
    const record = {
      ...expected,
      documentId: 'document-replaced' as PrescriptionDocumentId,
    };
    state = {
      records: state.records.map(item =>
        item.id === expected.id ? record : item,
      ),
      pendingCleanup: [expected.documentId],
    };
    return record;
  });
  native.remove.mockImplementation(async expected => {
    state = {
      records: state.records.filter(item => item.id !== expected.id),
      pendingCleanup: [expected.documentId],
    };
  });
  native.updateMetadata.mockImplementation(async (expected, details) => {
    const record = {
      ...details,
      id: expected.id,
      documentId: expected.documentId,
    };
    state = {
      ...state,
      records: state.records.map(item =>
        item.id === record.id ? record : item,
      ),
    };
    return record;
  });
  native.migrateLegacy.mockImplementation(async (documentId, details) => {
    const record = {
      ...details,
      id: 'migrated',
      documentId,
    } as PrescriptionRecord;
    state = { records: [record], pendingCleanup: [] };
    return record;
  });
  native.cleanup.mockImplementation(async () => {
    state = { ...state, pendingCleanup: [] };
  });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(async () => {
  if (screen) {
    await act(async () => screen.unmount());
  }
  jest.restoreAllMocks();
});

async function renderScreen() {
  await act(async () => {
    screen = ReactTestRenderer.create(
      <PrescriptionWalletScreen onBack={() => {}} />,
    );
  });
}
async function press(label: string) {
  await act(async () =>
    screen.root.findByProps({ accessibilityLabel: label }).props.onPress(),
  );
}
function card(id: string) {
  return screen.root.findByProps({ testID: `prescription-card-${id}` });
}
async function tapCard(id: string) {
  await act(async () => card(id).props.onPress());
}
async function accessibleAction(id: string, actionName: string) {
  await act(async () =>
    card(id).props.onAccessibilityAction({
      nativeEvent: { actionName },
    }),
  );
}
async function input(label: string, value: string) {
  await act(async () =>
    screen.root
      .findByProps({ accessibilityLabel: label })
      .props.onChangeText(value),
  );
}
function content() {
  return JSON.stringify(screen.toJSON());
}

test('new prescriptions reject missing or blank names before opening Files', async () => {
  await renderScreen();
  await press('Add prescription');
  await press('Standard');
  await input('Expiry date (required)', '2099-01-01');
  for (const name of ['', '  \n ']) {
    await input('Prescription name (required)', name);
    await press('Save prescription details');
    expect(content()).toContain('Enter a prescription name');
    expect(native.select).not.toHaveBeenCalled();
    expect(native.create).not.toHaveBeenCalled();
  }
});

test('named records prefill editing and save only metadata when renamed', async () => {
  state = {
    records: [{ ...first, displayName: 'Example label' }],
    pendingCleanup: [],
  };
  await renderScreen();
  expect(card(first.id).props.accessibilityLabel).toContain('Example label');
  await accessibleAction(first.id, 'edit');
  expect(
    screen.root.findByProps({
      accessibilityLabel: 'Prescription name (required)',
    }).props.value,
  ).toBe('Example label');
  await input('Prescription name (required)', 'Changed label');
  await press('Save prescription details');
  expect(native.updateMetadata).toHaveBeenCalledWith(
    { ...first, displayName: 'Example label' },
    { ...metadata, displayName: 'Changed label' },
  );
  expect(state.records).toEqual([{ ...first, displayName: 'Changed label' }]);
  expect(card(first.id).props.accessibilityLabel).toContain('Changed label');
  await act(async () => screen.unmount());
  await renderScreen();
  expect(card(first.id).props.accessibilityLabel).toContain('Changed label');
  await accessibleAction(first.id, 'edit');
  expect(
    screen.root.findByProps({
      accessibilityLabel: 'Prescription name (required)',
    }).props.value,
  ).toBe('Changed label');
  expect(native.replace).not.toHaveBeenCalled();
  expect(native.select).not.toHaveBeenCalled();
  expect(native.cleanup).not.toHaveBeenCalled();
});

test.each([0, 1, 2, 3])(
  'long press exposes native actions and handles selection %s',
  async index => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    await renderScreen();
    await act(async () => card(first.id).props.onLongPress());
    expect(sheet).toHaveBeenCalledWith(
      expect.objectContaining({
        options: ['Edit details', 'Replace document', 'Delete', 'Cancel'],
        cancelButtonIndex: 3,
        destructiveButtonIndex: 2,
      }),
      expect.any(Function),
    );
    expect(native.open).not.toHaveBeenCalled();
    alert.mockImplementation((_title, _message, buttons) =>
      buttons[0].onPress(),
    );
    await act(async () => sheet.mock.calls[0][1](index));
    if (index === 0) {
      expect(
        screen.root.findByProps({
          accessibilityLabel: 'Save prescription details',
        }),
      ).toBeDefined();
    } else if (index === 1 || index === 2) {
      expect(alert.mock.calls[0][0]).toBe(
        index === 1 ? 'Replace Prescription' : 'Delete Prescription',
      );
    } else {
      expect(alert).not.toHaveBeenCalled();
      expect(native.select).not.toHaveBeenCalled();
    }
    expect(native.replace).not.toHaveBeenCalled();
    expect(native.remove).not.toHaveBeenCalled();
  },
);

test('cards expose accessible View and mutation actions without visible action buttons', async () => {
  await renderScreen();
  expect(card(second.id).props.accessibilityRole).toBe('button');
  expect(card(second.id).props.accessibilityActions).toEqual([
    { name: 'activate', label: 'View prescription' },
    { name: 'edit', label: 'Edit details' },
    { name: 'replace', label: 'Replace document' },
    { name: 'delete', label: 'Delete' },
  ]);
  await accessibleAction(second.id, 'activate');
  expect(native.open).toHaveBeenCalledWith(second.documentId);
  // Only the name, compact metadata and derived badge are rendered as card text.
  const cardText = card(second.id)
    .findAllByType(require('react-native').Text)
    .map(node => node.props.children);
  expect(cardText).toEqual([
    'Unnamed prescription',
    'Temporary · Expires 1 Jan 2000',
    'EXPIRED',
  ]);
});

test('pending cleanup blocks long-press mutations and accessibility mutations while retaining View', async () => {
  state = { ...state, pendingCleanup: ['old' as PrescriptionDocumentId] };
  const sheet = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => {});
  await renderScreen();
  expect(card(first.id).props.accessibilityActions).toEqual([
    { name: 'activate', label: 'View prescription' },
  ]);
  await act(async () => card(first.id).props.onLongPress());
  for (const action of ['edit', 'replace', 'delete']) {
    await accessibleAction(first.id, action);
  }
  expect(sheet).not.toHaveBeenCalled();
  expect(native.select).not.toHaveBeenCalled();
  expect(native.remove).not.toHaveBeenCalled();
  await accessibleAction(first.id, 'activate');
  expect(native.open).toHaveBeenCalledWith(first.documentId);
});

test('lists multiple prescriptions, distinguishes kind/expiry and never loads stock or opens documents on entry', async () => {
  await renderScreen();
  expect(content()).toContain('Standard');
  expect(content()).toContain('Temporary');
  expect(content()).toContain('1 Jan 2000');
  expect(content()).toContain('EXPIRED');
  expect(content()).toContain('Unnamed prescription');
  expect(card(first.id).props.accessibilityLabel).not.toContain('EXPIRED');
  expect(card(second.id).props.accessibilityLabel).toContain('EXPIRED');
  for (const label of ['Add Stock', 'Correct Stock']) {
    expect(
      screen.root.findAllByProps({ accessibilityLabel: label }),
    ).toHaveLength(0);
  }
  expect(loadMedicationStock).not.toHaveBeenCalled();
  expect(saveMedicationStock).not.toHaveBeenCalled();
  expect(native.open).not.toHaveBeenCalled();
  expect(native.remove).not.toHaveBeenCalled();
});

test('Add requires explicitly chosen type and expiry, then retains existing records', async () => {
  await renderScreen();
  await press('Add prescription');
  expect(
    screen.root.findByProps({ accessibilityLabel: 'Expiry date (required)' })
      .props.value,
  ).toBe('');
  await press('Save prescription details');
  expect(content()).toContain('Choose Standard or Temporary');
  expect(native.select).not.toHaveBeenCalled();
  await press('Temporary');
  await input('Prescription name (required)', '  Example label  ');
  await input('Expiry date (required)', '2099-02-28');
  await input('Start date (optional)', '2099-01-01');
  await press('Save prescription details');
  expect(native.create).toHaveBeenCalledWith(candidate, {
    displayName: 'Example label',
    kind: 'temporary',
    medicationIds: [],
    expiresOn: '2099-02-28',
    startsOn: '2099-01-01',
  });
  expect(state.records).toHaveLength(3);
  expect(native.release).toHaveBeenCalledWith(candidate);
});

test('invalid dates do not open the picker or mutate the wallet', async () => {
  await renderScreen();
  await press('Add prescription');
  await press('Standard');
  await input('Prescription name (required)', 'Example label');
  await input('Expiry date (required)', '2027-02-29');
  await press('Save prescription details');
  expect(native.select).not.toHaveBeenCalled();
  expect(content()).toContain('Enter a valid expiry date');
});

test('View resolves the selected document, including an expired prescription', async () => {
  await renderScreen();
  await tapCard(second.id);
  expect(native.open).toHaveBeenCalledWith(second.documentId);
  expect(state.records).toEqual([first, second]);
  expect(native.remove).not.toHaveBeenCalled();
  expect(native.select).not.toHaveBeenCalled();
});

test.each([false, true])('Replace requires confirmation: %p', async confirm => {
  await renderScreen();
  alert.mockImplementation((title, _message, buttons) => {
    if (title === 'Replace Prescription') {
      expect(native.replace).not.toHaveBeenCalled();
      buttons[confirm ? 1 : 0].onPress();
    }
  });
  await accessibleAction(first.id, 'replace');
  expect(alert.mock.calls[0][0]).toBe('Replace Prescription');
  if (confirm) {
    expect(native.replace).toHaveBeenCalledWith(candidate, first);
    expect(state.records[0]).toEqual({
      ...first,
      documentId: 'document-replaced',
    });
  } else {
    expect(native.replace).not.toHaveBeenCalled();
    expect(state.records[0]).toEqual(first);
  }
  expect(native.release).toHaveBeenCalledWith(candidate);
});

test.each([false, true])(
  'Delete requires confirmation and affects only the selected item: %p',
  async confirm => {
    await renderScreen();
    alert.mockImplementation((title, _message, buttons) => {
      if (title === 'Delete Prescription') {
        expect(native.remove).not.toHaveBeenCalled();
        buttons[confirm ? 1 : 0].onPress();
      }
    });
    await accessibleAction(second.id, 'delete');
    expect(alert.mock.calls[0][0]).toBe('Delete Prescription');
    expect(native.select).not.toHaveBeenCalled();
    if (confirm) {
      expect(native.remove).toHaveBeenCalledWith(second);
      expect(state.records).toEqual([first]);
    } else {
      expect(native.remove).not.toHaveBeenCalled();
      expect(state.records).toEqual([first, second]);
    }
  },
);

test('Edit details preserves document identity and existing medication relationships', async () => {
  state = {
    records: [{ ...first, medicationIds: ['synthetic-id'] }],
    pendingCleanup: [],
  };
  await renderScreen();
  await accessibleAction(first.id, 'edit');
  expect(
    screen.root.findByProps({
      accessibilityLabel: 'Prescription name (required)',
    }).props.value,
  ).toBe('');
  await input('Prescription name (required)', 'Renamed example');
  await input('Expiry date (required)', '2099-03-01');
  await press('Save prescription details');
  expect(state.records[0]).toEqual({
    ...first,
    displayName: 'Renamed example',
    medicationIds: ['synthetic-id'],
    expiresOn: '2099-03-01',
  });
  expect(card(first.id).props.accessibilityLabel).toBe(
    'Renamed example, Standard · Expires 1 Mar 2099',
  );
  await act(async () => screen.unmount());
  await renderScreen();
  expect(card(first.id).props.accessibilityLabel).toBe(
    'Renamed example, Standard · Expires 1 Mar 2099',
  );
  expect(native.select).not.toHaveBeenCalled();
  expect(native.replace).not.toHaveBeenCalled();
});

test('legacy document stays viewable while required metadata is missing or migration fails', async () => {
  state = {
    records: [],
    pendingCleanup: [],
    legacyDocumentId: first.documentId,
  };
  await renderScreen();
  expect(content()).toContain('details needed');
  expect(native.migrateLegacy).not.toHaveBeenCalled();
  expect(
    screen.root.findByProps({ accessibilityLabel: 'Add prescription' }).props
      .disabled,
  ).toBe(true);
  await press('View saved prescription');
  expect(native.open).toHaveBeenCalledWith(first.documentId);
  await press('Complete prescription details');
  await press('Save prescription details');
  expect(native.migrateLegacy).not.toHaveBeenCalled();
  await press('Standard');
  await input('Prescription name (required)', 'Example label');
  await input('Expiry date (required)', '2099-01-01');
  native.migrateLegacy.mockRejectedValueOnce(new Error('Commit failed'));
  await press('Save prescription details');
  expect(state.legacyDocumentId).toBe(first.documentId);
  expect(native.remove).not.toHaveBeenCalled();
  await press('View saved prescription');
  expect(native.open).toHaveBeenCalledTimes(2);
  await press('Save prescription details');
  expect(native.migrateLegacy).toHaveBeenLastCalledWith(first.documentId, {
    ...metadata,
    displayName: 'Example label',
  });
  expect(state.records).toHaveLength(1);
  expect(state.legacyDocumentId).toBeUndefined();
});

test.each([false, true])(
  'authentication failure/cancellation never imports or changes documents; quiet cancellation: %p',
  async cancelled => {
    await renderScreen();
    native.open.mockRejectedValue({
      code: cancelled
        ? 'prescription_documents_authentication_cancelled'
        : 'prescription_documents_authentication_failed',
    });
    await tapCard(first.id);
    expect(native.select).not.toHaveBeenCalled();
    expect(native.create).not.toHaveBeenCalled();
    expect(native.replace).not.toHaveBeenCalled();
    if (cancelled) {
      expect(alert).not.toHaveBeenCalled();
    } else {
      expect(alert).toHaveBeenCalledWith(
        'Unable to complete prescription action',
        expect.any(String),
      );
    }
  },
);

test('cleanup-pending allows view, blocks mutations and offers retry', async () => {
  state = {
    ...state,
    pendingCleanup: ['old-document' as PrescriptionDocumentId],
  };
  await renderScreen();
  expect(
    screen.root.findByProps({ accessibilityLabel: 'Add prescription' }).props
      .disabled,
  ).toBe(true);
  await tapCard(first.id);
  expect(native.open).toHaveBeenCalled();
  await press('Retry document cleanup');
  expect(native.cleanup).toHaveBeenCalled();
  expect(
    screen.root.findByProps({ accessibilityLabel: 'Add prescription' }).props
      .disabled,
  ).toBe(false);
});

test('failed reads show retry without enabling mutation or pretending the wallet is empty', async () => {
  native.read.mockRejectedValueOnce(new Error('Unavailable'));
  await renderScreen();
  expect(content()).toContain('could not be loaded');
  expect(content()).not.toContain('No prescriptions saved');
  expect(
    screen.root.findAllByProps({ accessibilityLabel: 'Add prescription' }),
  ).toHaveLength(0);
  await press('Retry loading prescriptions');
  expect(card(first.id)).toBeDefined();
});

test('candidate release failure preserves a saved import and exposes explicit retry', async () => {
  await renderScreen();
  await press('Add prescription');
  await press('Standard');
  await input('Prescription name (required)', 'Example label');
  await input('Expiry date (required)', '2099-01-01');
  native.release.mockRejectedValueOnce(new Error('Release'));
  await press('Save prescription details');
  expect(state.records).toHaveLength(3);
  await press('Retry temporary cleanup');
  expect(native.release).toHaveBeenCalledTimes(2);
});

test.each([false, true])(
  'legacy viewing remains protected and quiet on cancellation: %p',
  async cancelled => {
    state = {
      records: [],
      pendingCleanup: [],
      legacyDocumentId: first.documentId,
    };
    await renderScreen();
    native.open.mockRejectedValue({
      code: cancelled
        ? 'prescription_documents_authentication_cancelled'
        : 'prescription_documents_authentication_failed',
    });
    await press('View saved prescription');
    expect(native.open).toHaveBeenCalledWith(first.documentId);
    expect(native.migrateLegacy).not.toHaveBeenCalled();
    expect(native.select).not.toHaveBeenCalled();
    if (cancelled) {
      expect(alert).not.toHaveBeenCalled();
    } else {
      expect(alert).toHaveBeenCalled();
    }
  },
);

test('cancelled selection preserves the collection and entered details', async () => {
  native.select.mockResolvedValue(null);
  await renderScreen();
  await press('Add prescription');
  await press('Standard');
  await input('Prescription name (required)', 'Example label');
  await input('Expiry date (required)', '2099-01-01');
  await press('Save prescription details');
  expect(native.create).not.toHaveBeenCalled();
  expect(state.records).toEqual([first, second]);
  expect(
    screen.root.findByProps({ accessibilityLabel: 'Expiry date (required)' })
      .props.value,
  ).toBe('2099-01-01');
});

test('uncertain publication reloads the collection without claiming the save failed', async () => {
  await renderScreen();
  await press('Add prescription');
  await press('Standard');
  await input('Prescription name (required)', 'Example label');
  await input('Expiry date (required)', '2099-01-01');
  const create = native.create.getMockImplementation()!;
  native.create.mockImplementationOnce(async (...args) => {
    await create(...args);
    throw { code: 'prescription_documents_commit_uncertain' };
  });
  await press('Save prescription details');
  expect(state.records).toHaveLength(3);
  expect(content()).toContain('The change may have been saved');
  expect(native.release).toHaveBeenCalledWith(candidate);
  expect(alert).not.toHaveBeenCalled();
  expect(card('record-new')).toBeDefined();
});

test('lost migration response reloads the committed record while keeping the original document accessible', async () => {
  state = {
    records: [],
    pendingCleanup: [],
    legacyDocumentId: first.documentId,
  };
  const migrate = native.migrateLegacy.getMockImplementation()!;
  native.migrateLegacy.mockImplementationOnce(async (...args) => {
    await migrate(...args);
    throw { code: 'prescription_documents_commit_uncertain' };
  });
  await renderScreen();
  await press('Complete prescription details');
  await press('Standard');
  await input('Prescription name (required)', 'Example label');
  await input('Expiry date (required)', '2099-01-01');
  await press('Save prescription details');
  expect(state.records).toHaveLength(1);
  expect(content()).toContain('The change may have been saved');
  await tapCard('migrated');
  expect(native.open).toHaveBeenCalledWith(first.documentId);
  expect(native.migrateLegacy).toHaveBeenCalledTimes(1);
});
