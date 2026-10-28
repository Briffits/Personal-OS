// Sum the decimal representations of finite count quantities before converting
// the result back to a number. This avoids 0.3 - 0.1 - 0.2 becoming a false
// negative stock balance, without rounding any dose to a chosen precision.
// Inputs are validated quantities; JS numbers still define input/output limits.
export function sumCounts(values: readonly number[]): number {
  const parts = values.map(value => {
    const [mantissa, exponent = '0'] = value.toString().split('e');
    const [whole, fraction = ''] = mantissa.split('.');
    return {
      coefficient: BigInt(whole + fraction),
      scale: fraction.length - Number(exponent),
    };
  });
  const scale = parts.reduce(
    (maximum, part) => Math.max(maximum, part.scale),
    0,
  );
  const coefficient = parts.reduce(
    (sum, part) =>
      sum + part.coefficient * BigInt(10) ** BigInt(scale - part.scale),
    BigInt(0),
  );
  return Number(`${coefficient}e-${scale}`);
}

// User input must survive conversion to number without changing its decimal
// value (apart from insignificant leading/trailing zeros).
export function sameDecimal(input: string, value: number): boolean {
  const [whole, fraction = ''] = input.split('.');
  const [mantissa, exponent = '0'] = value.toString().split('e');
  const [representedWhole, representedFraction = ''] = mantissa.split('.');
  const representedScale = representedFraction.length - Number(exponent);
  const scale = Math.max(fraction.length, representedScale);
  return (
    BigInt(whole + fraction) * BigInt(10) ** BigInt(scale - fraction.length) ===
    BigInt(representedWhole + representedFraction) *
      BigInt(10) ** BigInt(scale - representedScale)
  );
}
