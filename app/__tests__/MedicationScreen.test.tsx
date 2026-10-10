import React from 'react';
import { ActionSheetIOS, Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import MedicationScreen from '../src/screens/MedicationScreen';
import MedicationForm from '../src/components/MedicationForm';
import { NativeMedicationStorage } from '../src/native/NativeMedicationStorage';
import { NativePrescriptionDocuments } from '../src/native/NativePrescriptionDocuments';
import type {
  PrescriptionRecordId,
  PrescriptionDocumentId,
} from '../src/prescriptions/prescription';
import {
  firstId,
  secondId,
  prescriptionId,
  otherPrescriptionId,
  initialCollection,
  medicationFixture,
} from '../test-utils/medicationFixture';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/native/NativeMedicationStorage', () => ({
  NativeMedicationStorage: { read: jest.fn(), mutate: jest.fn() },
}));
jest.mock('../src/native/NativePrescriptionDocuments', () => ({
  NativePrescriptionDocuments: { read: jest.fn() },
}));
let screen: ReactTestRenderer.ReactTestRenderer;
let fixture: ReturnType<typeof medicationFixture>;
const back = jest.fn();
let prompt: jest.SpyInstance;
let alert: jest.SpyInstance;
let sheet: jest.SpyInstance;
const prescriptions = [prescriptionId, otherPrescriptionId].map((id, i) => ({
  id: id as PrescriptionRecordId,
  documentId: firstId as PrescriptionDocumentId,
  displayName: `Example prescription ${i + 1}`,
  kind: 'standard' as const,
  expiresOn: '2028-01-01',
  medicationIds: [secondId],
}));

beforeEach(() => {
  jest.clearAllMocks();
  fixture = medicationFixture();
  jest
    .mocked(NativeMedicationStorage.read)
    .mockReset()
    .mockImplementation(() => fixture.read());
  jest
    .mocked(NativeMedicationStorage.mutate)
    .mockReset()
    .mockImplementation((revision, command) =>
      fixture.mutate(revision, command),
    );
  jest
    .mocked(NativePrescriptionDocuments.read)
    .mockReset()
    .mockResolvedValue({ records: prescriptions, pendingCleanup: [] });
  prompt = jest.spyOn(Alert, 'prompt').mockImplementation(() => {});
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  sheet = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => {});
});
afterEach(async () => {
  if (screen) {
    await act(async () => screen.unmount());
  }
  jest.restoreAllMocks();
});
async function render() {
  await act(async () => {
    screen = ReactTestRenderer.create(<MedicationScreen onBack={back} />);
  });
}
function card(id = firstId) {
  return screen.root.findByProps({ testID: `medication-card-${id}` });
}
function button(label: string) {
  return screen.root.findByProps({ accessibilityLabel: label });
}
async function press(label: string) {
  await act(async () => button(label).props.onPress());
}
async function action(actionName: string, id = firstId) {
  await act(async () =>
    card(id).props.onAccessibilityAction({ nativeEvent: { actionName } }),
  );
}
async function name(value: string) {
  await act(async () =>
    button('Medication name (required)').props.onChangeText(value),
  );
}
async function choose(id: string | null) {
  await act(async () =>
    screen.root
      .findByProps({ testID: `medication-prescription-${id ?? 'none'}` })
      .props.onPress(),
  );
}
function promptButtons() {
  return prompt.mock.calls[prompt.mock.calls.length - 1][2] as {
    onPress: (value?: string) => Promise<void>;
  }[];
}
function rendered() {
  return JSON.stringify(screen.toJSON());
}

test('visible Add, multiple compact cards, no prescription calls, and normal tap never mutates', async () => {
  await render();
  expect(button('Add medication').props.disabled).toBe(false);
  expect(card().props.onPress).toBeUndefined();
  expect(card(secondId).props.onPress).toBeUndefined();
  expect(card().props.accessibilityLabel).toBe(
    'Example one, Recorded stock: 12 tablets',
  );
  expect(card(secondId).props.accessibilityLabel).toBe(
    'Example two, Stock not recorded',
  );
  expect(NativeMedicationStorage.mutate).not.toHaveBeenCalled();
  expect(NativePrescriptionDocuments.read).not.toHaveBeenCalled();
  expect(rendered()).not.toMatch(/days remaining|dose|schedule/i);
});

test.each([firstId, secondId])(
  'long press and accessibility actions match for %s',
  async id => {
    await render();
    const actions = card(id).props.accessibilityActions;
    for (let index = 0; index <= actions.length; index++) {
      await act(async () => {
        card(id).props.onLongPress();
        card(id).props.onLongPress();
      });
      expect(sheet).toHaveBeenCalledTimes(index + 1);
      const [options, select] = sheet.mock.calls[index];
      expect(options.options).toEqual([
        ...actions.map((item: { label: string }) => item.label),
        'Cancel',
      ]);
      expect(options.destructiveButtonIndex).toBe(3);
      expect(options.cancelButtonIndex).toBe(actions.length);
      await act(async () => {
        select(index);
        select(index);
      });
      if (index < 2) {
        expect(prompt).toHaveBeenCalledTimes(index + 1);
        expect(prompt.mock.calls[index][0]).toBe(
          id === secondId ? 'Record current stock' : actions[index].label,
        );
        await act(async () => promptButtons()[0].onPress());
      } else if (index === 2) {
        expect(button('Medication name (required)').props.value).toBe(
          fixture.state().records.find(record => record.id === id)!.displayName,
        );
        await press('Cancel medication details');
      } else if (index === 3) {
        expect(alert).toHaveBeenCalledTimes(1);
        expect(alert.mock.calls[0][0]).toBe('Delete medication');
        await act(async () => alert.mock.calls[0][2][0].onPress());
      }
    }
    expect(prompt).toHaveBeenCalledTimes(2);
    expect(screen.root.findAllByType(MedicationForm)).toHaveLength(0);
    expect(fixture.mutate).not.toHaveBeenCalled();
  },
);

test('adding medication selects exactly one prescription or None; legacy medicationIds are ignored', async () => {
  await render();
  await press('Add medication');
  await name(' Example three ');
  await choose(prescriptionId);
  await choose(otherPrescriptionId);
  const radios = screen.root.findAllByProps({ accessibilityRole: 'radio' });
  // Host and composite representations may both appear; inspect explicit test IDs.
  expect(
    screen.root.findByProps({
      testID: `medication-prescription-${prescriptionId}`,
    }).props.accessibilityState.checked,
  ).toBe(false);
  expect(
    screen.root.findByProps({
      testID: `medication-prescription-${otherPrescriptionId}`,
    }).props.accessibilityState.checked,
  ).toBe(true);
  expect(radios.length).toBeGreaterThan(0);
  await press('Save medication');
  expect(fixture.state().records[2]).toMatchObject({
    displayName: 'Example three',
    stock: null,
    prescriptionId: otherPrescriptionId,
  });
  expect(fixture.state().records[1].prescriptionId).toBeNull();
  await press('Add medication');
  await name('Example four');
  await choose(prescriptionId);
  await choose(null);
  await press('Save medication');
  expect(fixture.state().records[3].prescriptionId).toBeNull();
});

test('edit rename/link/unlink keeps ID, stock and other records', async () => {
  await render();
  await action('edit');
  await name('Renamed example');
  await choose(prescriptionId);
  await press('Save medication');
  expect(fixture.state().records[0]).toEqual({
    id: firstId,
    displayName: 'Renamed example',
    stock: 12,
    prescriptionId,
  });
  await action('add');
  await act(async () => promptButtons()[1].onPress('3'));
  await action('edit');
  await choose(null);
  await press('Save medication');
  expect(fixture.state().records[0]).toEqual({
    id: firstId,
    displayName: 'Renamed example',
    stock: 15,
    prescriptionId: null,
  });
  expect(fixture.state().records[1]).toEqual(initialCollection().records[1]);
});

test('correcting unrecorded stock records zero without assuming a previous balance', async () => {
  await render();
  await action('correct', secondId);
  expect(prompt.mock.calls[0][0]).toBe('Record current stock');
  await act(async () => promptButtons()[1].onPress('0'));
  expect(card(secondId).props.accessibilityLabel).toContain(
    'Recorded stock: 0 tablets',
  );
  await action('add', secondId);
  await act(async () => promptButtons()[1].onPress('2'));
  expect(fixture.state().records.map(record => record.stock)).toEqual([12, 2]);
});

test.each(['', '-1', '1.5', '0', '9007199254740992'])(
  'invalid addition %p never writes',
  async value => {
    await render();
    await action('add');
    await act(async () => promptButtons()[1].onPress(value));
    expect(fixture.mutate).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Invalid amount', expect.any(String));
  },
);

test('delete requires confirmation, cancellation is inert and prescription remains independent', async () => {
  const initial = initialCollection();
  fixture = medicationFixture({
    ...initial,
    records: [{ ...initial.records[0], prescriptionId }, initial.records[1]],
  });
  await render();
  await action('delete');
  const cancelled = alert.mock.calls[0][2];
  expect(fixture.mutate).not.toHaveBeenCalled();
  await act(async () => {
    cancelled[0].onPress();
    cancelled[1].onPress();
  });
  expect(fixture.mutate).not.toHaveBeenCalled();
  await action('delete');
  const confirm = alert.mock.calls[1][2][1].onPress;
  await act(async () => {
    await confirm();
    await confirm();
  });
  expect(fixture.mutate).toHaveBeenCalledTimes(1);
  expect(fixture.state().records.map(record => record.id)).toEqual([secondId]);
  expect(NativePrescriptionDocuments.read).not.toHaveBeenCalled();
});

test('load failure blocks edits until retry and is distinct from empty', async () => {
  fixture.read.mockRejectedValueOnce(new Error('Unavailable'));
  await render();
  expect(button('Add medication').props.disabled).toBe(true);
  expect(rendered()).not.toContain('No medications saved');
  await press('Add medication');
  expect(screen.root.findAllByType(MedicationForm)).toHaveLength(0);
  await press('Retry loading medications');
  expect(card()).toBeDefined();
});

test('empty collection has Add but no fabricated medication', async () => {
  fixture = medicationFixture({ ...initialCollection(), records: [] });
  await render();
  expect(rendered()).toContain('No medications saved');
  expect(rendered()).not.toContain('Medication A');
  expect(button('Add medication').props.disabled).toBe(false);
});

test('pending legacy preserves stock, requires a name, and completes unlinked with the same ID', async () => {
  fixture = medicationFixture({
    schemaVersion: 1,
    revision: 0,
    records: [],
    pendingLegacy: { id: firstId, stock: 0, prescriptionId: null },
  });
  await render();
  expect(button('Add medication').props.disabled).toBe(true);
  await press('Complete medication details');
  await press('Cancel medication details');
  expect(fixture.mutate).not.toHaveBeenCalled();
  await press('Complete medication details');
  await press('Save medication');
  expect(fixture.mutate).not.toHaveBeenCalled();
  await name('Saved example');
  await press('Save medication');
  expect(fixture.state().records).toEqual([
    {
      id: firstId,
      displayName: 'Saved example',
      stock: 0,
      prescriptionId: null,
    },
  ]);
  expect(NativePrescriptionDocuments.read).not.toHaveBeenCalled();
});

test('prescription read failure does not clear saved link and retry can load choices', async () => {
  const initial = initialCollection();
  fixture = medicationFixture({
    ...initial,
    records: [{ ...initial.records[0], prescriptionId }, initial.records[1]],
  });
  jest
    .mocked(NativePrescriptionDocuments.read)
    .mockRejectedValueOnce(new Error('Unavailable'));
  await render();
  await action('edit');
  expect(rendered()).toContain('Current prescription selection retained');
  await press('Retry prescription choices');
  expect(
    screen.root.findByProps({
      testID: `medication-prescription-${prescriptionId}`,
    }).props.accessibilityState.checked,
  ).toBe(true);
  await name('Renamed example');
  await press('Save medication');
  expect(fixture.state().records[0].prescriptionId).toBe(prescriptionId);
});

test('deleted prescription cannot be newly linked from stale form choices', async () => {
  await render();
  await action('edit');
  await choose(prescriptionId);
  jest
    .mocked(NativePrescriptionDocuments.read)
    .mockResolvedValue({ records: [], pendingCleanup: [] });
  await press('Save medication');
  expect(alert).toHaveBeenCalledWith(
    'Prescription unavailable',
    expect.any(String),
  );
  expect(fixture.mutate).not.toHaveBeenCalled();
  await choose(null);
  await press('Save medication');
  expect(fixture.state().records[0].prescriptionId).toBeNull();
});

test('duplicate prompt submission and overlapping actions are blocked during writes', async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => {
    finish = resolve;
  });
  jest
    .mocked(NativeMedicationStorage.mutate)
    .mockImplementationOnce(async (revision, command) => {
      await pending;
      return fixture.mutate(revision, command);
    });
  await render();
  await action('add');
  const confirm = promptButtons()[1].onPress;
  let write!: Promise<void>;
  await act(async () => {
    write = confirm('3');
    confirm('3');
  });
  await press('Add medication');
  await press('Back to Library');
  await action('correct', secondId);
  expect(back).not.toHaveBeenCalled();
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(card().props.accessibilityActions).toEqual([]);
  await act(async () => {
    finish();
    await write;
  });
  expect(NativeMedicationStorage.mutate).toHaveBeenCalledTimes(1);
  expect(fixture.state().records[0].stock).toBe(15);
});

test('lost write response reloads committed stock and does not retry the addition', async () => {
  jest
    .mocked(NativeMedicationStorage.mutate)
    .mockImplementationOnce(async (revision, command) => {
      await fixture.mutate(revision, command);
      throw { code: 'commit-uncertain' };
    });
  await render();
  await action('add');
  await act(async () => promptButtons()[1].onPress('3'));
  expect(card().props.accessibilityLabel).toContain('15 tablets');
  expect(rendered()).toContain('Check the reloaded medication list');
  expect(NativeMedicationStorage.mutate).toHaveBeenCalledTimes(1);
});

test('failed write with failed reload blocks mutations until retry', async () => {
  await render();
  jest
    .mocked(NativeMedicationStorage.mutate)
    .mockRejectedValueOnce({ code: 'write-failed' });
  fixture.read.mockRejectedValueOnce(new Error('Unavailable'));
  await action('add');
  await act(async () => promptButtons()[1].onPress('3'));
  expect(button('Add medication').props.disabled).toBe(true);
  await press('Retry loading medications');
  expect(card().props.accessibilityLabel).toContain('12 tablets');
});

test('cancelled form and unmounted prompt callbacks cannot write', async () => {
  await render();
  await action('edit');
  const save = screen.root.findByType(MedicationForm).props.onSave;
  await press('Cancel medication details');
  await act(async () => save({ displayName: 'Stale', prescriptionId: null }));
  await action('add');
  const confirm = promptButtons()[1].onPress;
  await act(async () => screen.unmount());
  await act(async () => confirm('3'));
  expect(fixture.mutate).not.toHaveBeenCalled();
});

test.each(['0', '7'])(
  'recording current stock %s persists an absolute count and offers Add',
  async value => {
    await render();
    await action('record', secondId);
    await act(async () => promptButtons()[1].onPress(value));
    expect(fixture.state().records[1].stock).toBe(Number(value));
    expect(card(secondId).props.accessibilityActions).toContainEqual({
      name: 'add',
      label: 'Add stock',
    });
  },
);

test('zero stock supports successive additions and correction replaces rather than adds', async () => {
  await render();
  await action('correct');
  expect(promptButtons()[1]).toMatchObject({ text: 'Replace total' });
  expect(prompt.mock.calls[0][1]).toContain('recorded total');
  await act(async () => promptButtons()[1].onPress('0'));
  for (const value of ['3', '2']) {
    await action('add');
    await act(async () => promptButtons()[1].onPress(value));
  }
  expect(fixture.state().records[0].stock).toBe(5);
  await action('correct');
  await act(async () => promptButtons()[1].onPress(' 7 '));
  expect(fixture.state().records[0].stock).toBe(7);
});

test.each([
  '',
  '   ',
  undefined,
  '-1',
  '1.5',
  'abc',
  'Infinity',
  '9007199254740992',
  '1e2',
  '0x10',
])(
  'invalid absolute count %p cannot change recorded or unrecorded stock',
  async value => {
    await render();
    for (const [id, operation] of [
      [firstId, 'correct'],
      [secondId, 'record'],
    ]) {
      await action(operation, id);
      await act(async () => promptButtons()[1].onPress(value));
    }
    expect(fixture.mutate).not.toHaveBeenCalled();
    expect(fixture.state().records.map(record => record.stock)).toEqual([
      12,
      null,
    ]);
    expect(alert).toHaveBeenCalledWith('Invalid amount', expect.any(String));
  },
);

test.each([null, 0, 12])(
  'rename preserves stock %p and further stock operations preserve the name',
  async stock => {
    const initial = initialCollection();
    fixture = medicationFixture({
      ...initial,
      records: [{ ...initial.records[0], stock }, initial.records[1]],
    });
    await render();
    await action('edit');
    expect(button('Medication name (required)').props.value).toBe(
      'Example one',
    );
    await name('  Renamed example  ');
    await press('Save medication');
    expect(fixture.state().records[0]).toEqual({
      ...initial.records[0],
      stock,
      displayName: 'Renamed example',
    });
    await action(stock === null ? 'record' : 'add');
    await act(async () => promptButtons()[1].onPress('3'));
    expect(fixture.state().records[0]).toMatchObject({
      displayName: 'Renamed example',
      stock: stock === null ? 3 : stock + 3,
    });
  },
);

test.each(['', '   '])(
  'blank name %p cannot create or rename a medication',
  async value => {
    await render();
    await press('Add medication');
    await name(value);
    await press('Save medication');
    expect(rendered()).toContain('Enter a medication name');
    await press('Cancel medication details');
    await action('edit');
    await name(value);
    await press('Save medication');
    expect(fixture.mutate).not.toHaveBeenCalled();
  },
);

test('initial loading and duplicate retries block every mutation until the one read finishes', async () => {
  let resolve!: (value: ReturnType<typeof initialCollection>) => void;
  fixture.read.mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  await render();
  await press('Add medication');
  expect(rendered()).toContain('Loading medications');
  expect(screen.root.findAllByType(MedicationForm)).toHaveLength(0);
  await act(async () => resolve(initialCollection()));
  // A failed write/reload provides the retry entry point.
  jest
    .mocked(NativeMedicationStorage.mutate)
    .mockRejectedValueOnce({ code: 'write-failed' });
  fixture.read.mockRejectedValueOnce(new Error('Unavailable'));
  await action('add');
  await act(async () => promptButtons()[1].onPress('3'));
  fixture.read.mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  const retry = button('Retry loading medications').props.onPress;
  let pending!: Promise<void>;
  await act(async () => {
    pending = retry();
    retry();
  });
  await press('Add medication');
  expect(fixture.read).toHaveBeenCalledTimes(3);
  expect(screen.root.findAllByType(MedicationForm)).toHaveLength(0);
  await act(async () => {
    resolve(initialCollection());
    await pending;
  });
  expect(card().props.accessibilityLabel).toContain('12 tablets');
});

test('repeated read failures stay blocked until a successful unrecorded collection read', async () => {
  fixture.read
    .mockRejectedValueOnce(new Error('Invalid'))
    .mockRejectedValueOnce(new Error('Invalid'));
  await render();
  await press('Retry loading medications');
  expect(button('Add medication').props.disabled).toBe(true);
  await press('Retry loading medications');
  expect(card(secondId).props.accessibilityLabel).toContain(
    'Stock not recorded',
  );
});

test.each(['record', 'correct', 'edit'])(
  'failed %s preserves saved values, reloads and allows a fresh attempt',
  async operation => {
    await render();
    const id = operation === 'record' ? secondId : firstId;
    jest
      .mocked(NativeMedicationStorage.mutate)
      .mockRejectedValueOnce({ code: 'write-failed' });
    async function submit() {
      await action(operation, id);
      if (operation === 'edit') {
        await name('Renamed');
        await press('Save medication');
      } else {
        await act(async () => promptButtons()[1].onPress('7'));
      }
    }
    await submit();
    expect(fixture.state().records).toEqual(initialCollection().records);
    await submit();
    expect(
      fixture.state().records.find(record => record.id === id),
    ).toMatchObject(
      operation === 'edit'
        ? { displayName: 'Renamed', stock: 12 }
        : { stock: 7 },
    );
  },
);

test('cancelled stock prompt cannot submit later and a new prompt remains usable', async () => {
  await render();
  await action('add');
  const stale = promptButtons();
  await act(async () => {
    stale[0].onPress();
    stale[1].onPress('3');
  });
  expect(fixture.mutate).not.toHaveBeenCalled();
  await action('add');
  await act(async () => promptButtons()[1].onPress('2'));
  expect(fixture.state().records[0].stock).toBe(14);
});

test('rename save blocks duplicate submission, cancellation and Back; stale form cannot save after success', async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => {
    finish = resolve;
  });
  jest
    .mocked(NativeMedicationStorage.mutate)
    .mockImplementationOnce(async (revision, command) => {
      await pending;
      return fixture.mutate(revision, command);
    });
  await render();
  await action('edit');
  const form = screen.root.findByType(MedicationForm).props;
  let write!: Promise<void>;
  await act(async () => {
    write = form.onSave({ displayName: 'Renamed', prescriptionId: null });
    form.onSave({ displayName: 'Duplicate', prescriptionId: null });
    form.onCancel();
  });
  await press('Back to Library');
  expect(back).not.toHaveBeenCalled();
  await act(async () => {
    finish();
    await write;
  });
  await act(async () =>
    form.onSave({ displayName: 'Stale', prescriptionId: null }),
  );
  expect(NativeMedicationStorage.mutate).toHaveBeenCalledTimes(1);
  await action('add');
  await act(async () => promptButtons()[1].onPress('3'));
  expect(fixture.state().records[0]).toMatchObject({
    displayName: 'Renamed',
    stock: 15,
  });
});

test('unmounted medication form cannot start a rename', async () => {
  await render();
  await action('edit');
  const save = screen.root.findByType(MedicationForm).props.onSave;
  await act(async () => screen.unmount());
  await act(async () => save({ displayName: 'Stale', prescriptionId: null }));
  expect(fixture.mutate).not.toHaveBeenCalled();
});
