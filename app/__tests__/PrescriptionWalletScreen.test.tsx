import React from 'react';
import {Alert} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import PrescriptionWalletScreen from '../src/screens/PrescriptionWalletScreen';
import {
  loadMedicationStock,
  saveMedicationStock,
} from '../src/storage/medicationStockStorage';

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('../src/storage/medicationStockStorage', () => ({
  loadMedicationStock: jest.fn(),
  saveMedicationStock: jest.fn(),
}));

const loadStock = jest.mocked(loadMedicationStock);
const saveStock = jest.mocked(saveMedicationStock);
let screen: ReactTestRenderer.ReactTestRenderer;
let prompt: jest.SpyInstance;
let alert: jest.SpyInstance;

beforeEach(() => {
  loadStock.mockReset().mockResolvedValue(12);
  saveStock.mockReset().mockResolvedValue(undefined);
  prompt = jest.spyOn(Alert, 'prompt').mockImplementation(() => {});
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(async () => {
  await act(async () => screen.unmount());
  jest.restoreAllMocks();
});

async function renderScreen() {
  await act(async () => {
    screen = ReactTestRenderer.create(
      <PrescriptionWalletScreen onBack={() => {}} />,
    );
  });
}

function stockButton(label: string) {
  return screen.root.findByProps({accessibilityLabel: label});
}

async function submitStock(label: string, value: string | undefined) {
  await act(async () => stockButton(label).props.onPress());
  const buttons = prompt.mock.calls[prompt.mock.calls.length - 1][2];
  await act(async () => buttons[1].onPress(value));
}

test.each(['', '   ', '\t\n', undefined, '-1', '1.5', 'abc', 'Infinity'])(
  'rejects invalid correction %p without saving or changing stock',
  async value => {
    await renderScreen();
    await submitStock('Correct Stock', value);

    expect(alert).toHaveBeenCalledWith(
      'Invalid amount',
      'Enter a whole number of zero or more.',
    );
    expect(saveStock).not.toHaveBeenCalled();
    expect(JSON.stringify(screen.toJSON())).toContain(
      'Estimated stock: 12 tablets',
    );
  },
);

test.each([
  ['0', 0],
  [' 7 ', 7],
])('saves explicit correction %p', async (value, expected) => {
  await renderScreen();
  await submitStock('Correct Stock', value as string);

  expect(saveStock).toHaveBeenCalledWith(expected);
  expect(alert).not.toHaveBeenCalled();
  expect(JSON.stringify(screen.toJSON())).toContain(
    `Estimated stock: ${expected} tablets`,
  );
});

test('blocks stock actions until saved stock loads, then adds to saved stock', async () => {
  let resolveStock!: (value: number) => void;
  loadStock.mockReturnValue(
    new Promise(resolve => {
      resolveStock = resolve;
    }),
  );
  await renderScreen();

  for (const label of ['Add Stock', 'Correct Stock']) {
    expect(stockButton(label).props.disabled).toBe(true);
    expect(stockButton(label).props.accessibilityState).toEqual({disabled: true});
    await act(async () => stockButton(label).props.onPress());
  }
  expect(prompt).not.toHaveBeenCalled();
  expect(saveStock).not.toHaveBeenCalled();

  await act(async () => resolveStock(12));

  for (const label of ['Add Stock', 'Correct Stock']) {
    expect(stockButton(label).props.disabled).toBe(false);
    expect(stockButton(label).props.accessibilityState).toEqual({disabled: false});
  }
  await submitStock('Add Stock', '3');
  expect(saveStock).toHaveBeenCalledWith(15);
});
