import {
  getPrescriptionExpiryStatus,
  PrescriptionValidationError,
} from '../src/prescriptions/prescription';

test.each([
  ['2028-03-01', 'expiring-soon'], // 0 days: valid through expiry day
  ['2028-03-02', 'expiring-soon'], // 1 day
  ['2028-03-31', 'expiring-soon'], // 30 days, across DST in many locales
  ['2028-04-01', 'current'], // 31 days
  ['2028-02-29', 'expired'],
] as const)('derives %s as %s', (expiresOn, expected) => {
  expect(
    getPrescriptionExpiryStatus(
      { kind: 'standard', medicationIds: [], expiresOn },
      '2028-03-01',
    ),
  ).toBe(expected);
});

test.each([
  ['2028-01-30', '2028-02-29', 'expiring-soon'],
  ['2028-01-29', '2028-02-29', 'current'],
  ['2027-12-15', '2028-01-14', 'expiring-soon'],
  ['2027-12-15', '2028-01-15', 'current'],
] as const)('counts calendar days from %s to %s', (on, expiresOn, expected) => {
  expect(
    getPrescriptionExpiryStatus(
      { kind: 'temporary', medicationIds: [], expiresOn },
      on,
    ),
  ).toBe(expected);
});

test.each([
  ['2027-02-29', '2027-02-01'],
  ['2028-02-29', 'invalid'],
])('rejects invalid expiry/today dates: %s, %s', (expiresOn, on) => {
  expect(() =>
    getPrescriptionExpiryStatus(
      { kind: 'standard', medicationIds: [], expiresOn },
      on,
    ),
  ).toThrow(PrescriptionValidationError);
});
