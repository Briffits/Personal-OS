import React from 'react';
import { Alert } from 'react-native';
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

test('lists multiple prescriptions, distinguishes kind/expiry and never loads stock or opens documents on entry', async () => {
  await renderScreen();
  expect(content()).toContain('Standard');
  expect(content()).toContain('Temporary');
  expect(content()).toContain('2000-01-01');
  expect(content()).toContain('Expired');
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
  await input('Expiry date (required)', '2099-02-28');
  await input('Start date (optional)', '2099-01-01');
  await press('Save prescription details');
  expect(native.create).toHaveBeenCalledWith(candidate, {
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
  await input('Expiry date (required)', '2027-02-29');
  await press('Save prescription details');
  expect(native.select).not.toHaveBeenCalled();
  expect(content()).toContain('Enter a valid expiry date');
});

test('View resolves the selected document, including an expired prescription', async () => {
  await renderScreen();
  await press('View prescription 2');
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
  await press('Replace document for prescription 1');
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
    await press('Delete prescription 2');
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
  await press('Edit details for prescription 1');
  await input('Expiry date (required)', '2099-03-01');
  await press('Save prescription details');
  expect(state.records[0]).toEqual({
    ...first,
    medicationIds: ['synthetic-id'],
    expiresOn: '2099-03-01',
  });
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
  await input('Expiry date (required)', '2099-01-01');
  native.migrateLegacy.mockRejectedValueOnce(new Error('Commit failed'));
  await press('Save prescription details');
  expect(state.legacyDocumentId).toBe(first.documentId);
  expect(native.remove).not.toHaveBeenCalled();
  await press('View saved prescription');
  expect(native.open).toHaveBeenCalledTimes(2);
  await press('Save prescription details');
  expect(native.migrateLegacy).toHaveBeenLastCalledWith(
    first.documentId,
    metadata,
  );
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
    await press('View prescription 1');
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
  await press('View prescription 1');
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
  expect(
    screen.root.findByProps({ accessibilityLabel: 'View prescription 1' }),
  ).toBeDefined();
});

test('candidate release failure preserves a saved import and exposes explicit retry', async () => {
  await renderScreen();
  await press('Add prescription');
  await press('Standard');
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
  expect(
    screen.root.findByProps({ accessibilityLabel: 'View prescription 3' }),
  ).toBeDefined();
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
  await input('Expiry date (required)', '2099-01-01');
  await press('Save prescription details');
  expect(state.records).toHaveLength(1);
  expect(content()).toContain('The change may have been saved');
  await press('View prescription 1');
  expect(native.open).toHaveBeenCalledWith(first.documentId);
  expect(native.migrateLegacy).toHaveBeenCalledTimes(1);
});
