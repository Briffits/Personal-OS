import React from 'react';
import { ActionSheetIOS, Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import MedicationScreen from '../src/screens/MedicationScreen';
import {
  loadMedicationName,
  saveMedicationName,
} from '../src/storage/medicationNameStorage';
import {
  loadMedicationStock,
  saveMedicationStock,
} from '../src/storage/medicationStockStorage';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/storage/medicationStockStorage', () => ({
  loadMedicationStock: jest.fn(),
  saveMedicationStock: jest.fn(),
}));
const loadStock = jest.mocked(loadMedicationStock);
jest.mock('../src/storage/medicationNameStorage', () => ({
  DEFAULT_MEDICATION_NAME: 'Medication A',
  loadMedicationName: jest.fn(),
  saveMedicationName: jest.fn(),
}));
const loadName = jest.mocked(loadMedicationName);
const saveName = jest.mocked(saveMedicationName);
const saveStock = jest.mocked(saveMedicationStock);
let screen: ReactTestRenderer.ReactTestRenderer;
let prompt: jest.SpyInstance;
let alert: jest.SpyInstance;
let sheet: jest.SpyInstance;
const back = jest.fn();

beforeEach(() => {
  loadName.mockReset().mockResolvedValue('Medication A');
  saveName.mockReset().mockResolvedValue(undefined);
  loadStock.mockReset().mockResolvedValue(12);
  saveStock.mockReset().mockResolvedValue(undefined);
  back.mockReset();
  prompt = jest.spyOn(Alert, 'prompt').mockImplementation(() => {});
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  sheet = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => screen.unmount());
  jest.restoreAllMocks();
});
async function renderScreen() {
  await act(async () => {
    screen = ReactTestRenderer.create(<MedicationScreen onBack={back} />);
  });
}
function button(label: string) {
  return screen.root.findByProps({ accessibilityLabel: label });
}
function summary() {
  return screen.root.findByProps({ testID: 'medication-summary' });
}
function rendered() {
  return JSON.stringify(screen.toJSON());
}
function absent(label: string) {
  expect(
    screen.root.findAllByProps({ accessibilityLabel: label }),
  ).toHaveLength(0);
}
async function openPrompt(action: string) {
  const names: Record<string, string> = {
    'Correct stock': 'correct',
    'Add stock': 'add',
    'Record current stock': 'record',
    'Edit medication name': 'rename',
  };
  await act(async () =>
    summary().props.onAccessibilityAction({
      nativeEvent: { actionName: names[action] },
    }),
  );
}
function promptButtons() {
  return prompt.mock.calls[prompt.mock.calls.length - 1][2];
}
async function submit(action: string, value: string | undefined) {
  await openPrompt(action);
  await act(async () => promptButtons()[1].onPress(value));
}
test.each(['0', '7'])(
  'unrecorded stock records absolute count %s then offers Add stock',
  async value => {
    loadStock.mockResolvedValue(null);
    await renderScreen();
    expect(rendered()).toContain('Stock not recorded');
    absent('Add stock');
    absent('More stock actions');
    await submit('Record current stock', value);
    expect(saveStock).toHaveBeenCalledWith(Number(value));
    expect(rendered()).toContain('Recorded stock: ' + value + ' tablets');
    absent('Record current stock');
    expect(summary().props.accessibilityActions).toContainEqual({
      name: 'add',
      label: 'Add stock',
    });
  },
);
test('zero is recorded and successive additions use the updated total', async () => {
  loadStock.mockResolvedValue(0);
  await renderScreen();
  absent('Record current stock');
  await submit('Add stock', '3');
  await submit('Add stock', '2');
  expect(saveStock.mock.calls).toEqual([[3], [5]]);
  expect(rendered()).toContain('Recorded stock: 5 tablets');
});
test.each(['0', ' 7 '])('correction replaces total with %p', async value => {
  await renderScreen();
  absent('Correct stock');
  await submit('Correct stock', value);
  expect(prompt.mock.calls[0][1]).toContain(
    'This replaces the recorded stock total.',
  );
  expect(promptButtons()[1].text).toBe('Replace total');
  expect(saveStock).toHaveBeenCalledWith(Number(value));
  expect(rendered()).toContain('Recorded stock: ' + Number(value) + ' tablets');
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
])('rejects invalid absolute count %p', async value => {
  await renderScreen();
  await submit('Correct stock', value);
  expect(alert).toHaveBeenCalledWith('Invalid amount', expect.any(String));
  expect(saveStock).not.toHaveBeenCalled();
  expect(rendered()).toContain('Recorded stock: 12 tablets');
});
test.each(['', '0', '-1', '1.5', 'abc', 'Infinity', '9007199254740992'])(
  'rejects invalid addition %p',
  async value => {
    await renderScreen();
    await submit('Add stock', value);
    expect(saveStock).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Invalid amount', expect.any(String));
  },
);
test('rejects addition overflow', async () => {
  loadStock.mockResolvedValue(Number.MAX_SAFE_INTEGER);
  await renderScreen();
  await submit('Add stock', '1');
  expect(saveStock).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('Invalid amount', expect.any(String));
});
test('blocks all mutation routes until loading succeeds', async () => {
  let resolve!: (count: number) => void;
  loadStock.mockReturnValue(
    new Promise(done => {
      resolve = done;
    }),
  );
  await renderScreen();
  expect(rendered()).toContain('Loading stock');
  absent('Add stock');
  absent('Record current stock');
  absent('More stock actions');
  await act(async () => {
    summary().props.onLongPress();
    summary().props.onAccessibilityAction({
      nativeEvent: { actionName: 'correct' },
    });
  });
  expect(prompt).not.toHaveBeenCalled();
  expect(sheet).not.toHaveBeenCalled();
  await act(async () => resolve(12));
  await submit('Add stock', '3');
  expect(saveStock).toHaveBeenCalledWith(15);
});
test('load failure stays distinct from unrecorded and Retry establishes the count', async () => {
  loadStock.mockRejectedValueOnce(new Error('Unavailable'));
  await renderScreen();
  expect(rendered()).toContain('Unable to load stock');
  expect(rendered()).not.toContain('Stock not recorded');
  absent('Add stock');
  absent('Record current stock');
  absent('More stock actions');
  await act(async () => {
    summary().props.onLongPress();
    summary().props.onAccessibilityAction({
      nativeEvent: { actionName: 'correct' },
    });
  });
  expect(saveStock).not.toHaveBeenCalled();
  expect(prompt).not.toHaveBeenCalled();
  await act(async () => button('Retry stock loading').props.onPress());
  expect(loadStock).toHaveBeenCalledTimes(2);
  expect(rendered()).toContain('Recorded stock: 12 tablets');
  await submit('Add stock', '3');
  expect(saveStock).toHaveBeenCalledWith(15);
});
test('repeated retry failure stays blocked until a successful absent read', async () => {
  loadStock
    .mockRejectedValueOnce(new Error('Invalid record'))
    .mockRejectedValueOnce(new Error('Invalid record'))
    .mockResolvedValueOnce(null);
  await renderScreen();
  await act(async () => button('Retry stock loading').props.onPress());
  expect(rendered()).toContain('Unable to load stock');
  absent('Record current stock');
  await act(async () => button('Retry stock loading').props.onPress());
  expect(rendered()).toContain('Stock not recorded');
});
test('card tap is not add; long press and VoiceOver offer correction', async () => {
  await renderScreen();
  expect(summary().props.onPress).toBeUndefined();
  expect(summary().props.accessibilityActions).toContainEqual({
    name: 'correct',
    label: 'Correct stock',
  });
  await act(async () => summary().props.onLongPress());
  expect(sheet.mock.calls[0][0].options).toEqual([
    'Add stock',
    'Correct stock',
    'Edit medication name',
    'Cancel',
  ]);
  await act(async () => sheet.mock.calls[0][1](3));
  expect(prompt).not.toHaveBeenCalled();
  await act(async () =>
    summary().props.onAccessibilityAction({
      nativeEvent: { actionName: 'correct' },
    }),
  );
  expect(prompt.mock.calls[0][0]).toBe('Correct stock');
  await act(async () => promptButtons()[1].onPress('4'));
  expect(saveStock).toHaveBeenCalledWith(4);
});
test('prevents duplicate prompts, double submission and overlapping saves', async () => {
  let resolve!: () => void;
  saveStock.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  await renderScreen();
  await openPrompt('Add stock');
  await openPrompt('Add stock');
  expect(prompt).toHaveBeenCalledTimes(1);
  const submitOnce = promptButtons()[1].onPress;
  let pending!: Promise<void>;
  await act(async () => {
    pending = submitOnce('3');
    submitOnce('3');
  });
  expect(saveStock).toHaveBeenCalledTimes(1);
  expect(summary().props.accessibilityActions).toEqual([]);
  expect(button('Back to Library').props.disabled).toBe(true);
  await act(async () => {
    summary().props.onLongPress();
    summary().props.onAccessibilityAction({
      nativeEvent: { actionName: 'correct' },
    });
    button('Back to Library').props.onPress();
  });
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(sheet).not.toHaveBeenCalled();
  expect(back).not.toHaveBeenCalled();
  await act(async () => {
    resolve();
    await pending;
  });
  await act(async () => submitOnce('3'));
  expect(saveStock).toHaveBeenCalledTimes(1);
  await submit('Add stock', '2');
  expect(saveStock.mock.calls).toEqual([[15], [17]]);
});
test('failed save preserves count and allows a fresh attempt', async () => {
  saveStock.mockRejectedValueOnce(new Error('Unavailable'));
  await renderScreen();
  await submit('Correct stock', '7');
  expect(rendered()).toContain('Recorded stock: 12 tablets');
  expect(alert).toHaveBeenCalledWith(
    'Unable to save stock',
    'Your stock amount could not be saved. Please try again.',
  );
  expect(summary().props.accessibilityActions).toContainEqual({
    name: 'add',
    label: 'Add stock',
  });
  await submit('Add stock', '3');
  expect(saveStock).toHaveBeenLastCalledWith(15);
});
test('cancel does not save and allows a fresh prompt', async () => {
  await renderScreen();
  await openPrompt('Add stock');
  const old = promptButtons();
  await act(async () => {
    old[0].onPress();
    old[1].onPress('3');
  });
  expect(saveStock).not.toHaveBeenCalled();
  await submit('Add stock', '2');
  expect(saveStock).toHaveBeenCalledWith(14);
});
test('contains no prescription controls', async () => {
  await renderScreen();
  absent('View Prescription');
  absent('Replace Prescription');
});

test('failed first record stays unrecorded and invalid input cannot establish a count', async () => {
  loadStock.mockResolvedValue(null);
  await renderScreen();
  await submit('Record current stock', '');
  expect(saveStock).not.toHaveBeenCalled();
  saveStock.mockRejectedValueOnce(new Error('Unavailable'));
  await submit('Record current stock', '7');
  expect(rendered()).toContain('Stock not recorded');
  absent('Add stock');
  await submit('Record current stock', '7');
  expect(rendered()).toContain('Recorded stock: 7 tablets');
});

test('duplicate Retry does not overlap reads and pending retry blocks mutation', async () => {
  loadStock.mockRejectedValueOnce(new Error('Unavailable'));
  await renderScreen();
  let resolve!: (count: number) => void;
  loadStock.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  const retry = button('Retry stock loading').props.onPress;
  let pending!: Promise<void>;
  await act(async () => {
    pending = retry();
    retry();
  });
  expect(loadStock).toHaveBeenCalledTimes(2);
  absent('Add stock');
  absent('Record current stock');
  absent('More stock actions');
  await act(async () =>
    summary().props.onAccessibilityAction({
      nativeEvent: { actionName: 'correct' },
    }),
  );
  expect(prompt).not.toHaveBeenCalled();
  await act(async () => {
    resolve(12);
    await pending;
  });
  expect(rendered()).toContain('Recorded stock: 12 tablets');
});

test('a prompt callback after leaving Medication cannot save', async () => {
  await renderScreen();
  await openPrompt('Add stock');
  const confirm = promptButtons()[1].onPress;
  await act(async () => screen.unmount());
  await act(async () => confirm('3'));
  expect(saveStock).not.toHaveBeenCalled();
});

test.each([null, 0, 12])(
  'rename preserves stock %p and uses the saved name',
  async count => {
    loadStock.mockResolvedValue(count);
    loadName.mockResolvedValue('Example medication');
    await renderScreen();
    expect(summary().props.accessibilityLabel).toContain('Example medication');
    await openPrompt('Edit medication name');
    expect(prompt.mock.calls[0][4]).toBe('Example medication');
    await act(async () => promptButtons()[1].onPress('  Renamed example  '));
    expect(saveName).toHaveBeenCalledWith('Renamed example');
    expect(saveStock).not.toHaveBeenCalled();
    expect(summary().props.accessibilityLabel).toContain('Renamed example');
    expect(rendered()).toContain(
      count === null
        ? 'Stock not recorded'
        : `Recorded stock: ${count} tablets`,
    );
    await submit(count === null ? 'Record current stock' : 'Add stock', '3');
    expect(saveStock).toHaveBeenCalledWith(count === null ? 3 : count + 3);
    expect(summary().props.accessibilityLabel).toContain('Renamed example');
  },
);

test.each(['', '   ', undefined])(
  'invalid name %p cannot save',
  async value => {
    await renderScreen();
    await submit('Edit medication name', value);
    expect(saveName).not.toHaveBeenCalled();
    expect(saveStock).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Invalid name', expect.any(String));
  },
);

test('name read failure blocks every mutation until Retry succeeds', async () => {
  loadName.mockRejectedValueOnce(new Error('Unavailable'));
  await renderScreen();
  expect(summary().props.accessibilityActions).toEqual([]);
  await openPrompt('Edit medication name');
  await openPrompt('Add stock');
  await act(async () => summary().props.onLongPress());
  expect(prompt).not.toHaveBeenCalled();
  expect(sheet).not.toHaveBeenCalled();
  await act(async () => button('Retry stock loading').props.onPress());
  await submit('Edit medication name', 'Example');
  expect(saveName).toHaveBeenCalledWith('Example');
});

test('failed rename preserves name and stock and can be retried', async () => {
  saveName.mockRejectedValueOnce(new Error('Unavailable'));
  await renderScreen();
  await submit('Edit medication name', 'Example');
  expect(summary().props.accessibilityLabel).toBe(
    'Medication A, Recorded stock: 12 tablets',
  );
  expect(alert).toHaveBeenCalledWith('Unable to save name', expect.any(String));
  await submit('Edit medication name', 'Example');
  expect(summary().props.accessibilityLabel).toBe(
    'Example, Recorded stock: 12 tablets',
  );
});

test('rename save blocks stock, rename and Back, including duplicate callbacks', async () => {
  let resolve!: () => void;
  saveName.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  await renderScreen();
  await openPrompt('Edit medication name');
  const confirm = promptButtons()[1].onPress;
  let pending!: Promise<void>;
  await act(async () => {
    pending = confirm('Example');
    confirm('Other');
  });
  await openPrompt('Add stock');
  await openPrompt('Edit medication name');
  await act(async () => {
    summary().props.onLongPress();
    button('Back to Library').props.onPress();
  });
  expect(summary().props.accessibilityActions).toEqual([]);
  expect(saveName).toHaveBeenCalledTimes(1);
  expect(saveStock).not.toHaveBeenCalled();
  expect(back).not.toHaveBeenCalled();
  expect(sheet).not.toHaveBeenCalled();
  await act(async () => {
    resolve();
    await pending;
  });
  await act(async () => confirm('Other'));
  expect(saveName).toHaveBeenCalledTimes(1);
  await submit('Add stock', '3');
  expect(saveStock).toHaveBeenCalledWith(15);
});

test.each([null, 12])(
  'long press and accessibility offer equivalent actions for stock %p',
  async count => {
    loadStock.mockResolvedValue(count);
    await renderScreen();
    for (const label of [
      'Add stock',
      'Record current stock',
      'More stock actions',
      'Edit medication name',
    ]) {
      absent(label);
    }
    expect(rendered()).not.toMatch(/days (left|remaining)/i);
    const actions = summary().props.accessibilityActions;
    for (let index = 0; index < actions.length; index++) {
      await act(async () => {
        summary().props.onLongPress();
        summary().props.onLongPress();
      });
      expect(sheet).toHaveBeenCalledTimes(index + 1);
      const [options, select] = sheet.mock.calls[index];
      expect(options.options).toEqual([
        ...actions.map((action: { label: string }) => action.label),
        'Cancel',
      ]);
      await act(async () => {
        select(index);
        select(index);
      });
      expect(prompt).toHaveBeenCalledTimes(index + 1);
      expect(prompt.mock.calls[index][0]).toBe(actions[index].label);
      await act(async () => promptButtons()[0].onPress());
    }
  },
);

test('cancelled and unmounted rename callbacks cannot write', async () => {
  await renderScreen();
  await openPrompt('Edit medication name');
  const old = promptButtons();
  await act(async () => {
    old[0].onPress();
    old[1].onPress('Example');
  });
  await openPrompt('Edit medication name');
  const confirm = promptButtons()[1].onPress;
  await act(async () => screen.unmount());
  await act(async () => confirm('Example'));
  expect(saveName).not.toHaveBeenCalled();
});

test('a rejected read waits for the other read before allowing Retry', async () => {
  let resolve!: (name: string) => void;
  loadStock.mockRejectedValueOnce(new Error('Unavailable'));
  loadName.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  await renderScreen();
  expect(rendered()).toContain('Loading stock');
  absent('Retry stock loading');
  await openPrompt('Edit medication name');
  expect(prompt).not.toHaveBeenCalled();
  await act(async () => resolve('Example'));
  expect(rendered()).toContain('Unable to load stock');
  await act(async () => button('Retry stock loading').props.onPress());
  expect(loadStock).toHaveBeenCalledTimes(2);
  expect(loadName).toHaveBeenCalledTimes(2);
  expect(rendered()).toContain('Recorded stock: 12 tablets');
});
