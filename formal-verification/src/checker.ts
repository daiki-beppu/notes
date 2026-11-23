/** Signed 8-bit absolute value, with two's-complement wrap on overflow. */

export const INT8_MIN = -128;
export const INT8_MAX = 127;
export const DOMAIN_SIZE = INT8_MAX - INT8_MIN + 1; // 256

export function toInt8(n: number): number {
  let x = n % 256;
  if (x < 0) x += 256;
  return x >= 128 ? x - 256 : x;
}

/** Buggy abs: `-x` wraps when x is -128, so the result stays negative. */
export function abs8(x: number): number {
  if (x >= 0) return x;
  return toInt8(-x);
}

/** Safety property: the result is never negative. */
export function satisfiesSpec(x: number): boolean {
  return abs8(x) >= 0;
}

export type UnitTest = {
  x: number;
  expected: number;
};

export const UNIT_TESTS: readonly UnitTest[] = [
  { x: 5, expected: 5 },
  { x: -3, expected: 3 },
  { x: 0, expected: 0 },
];

export type TestResult = {
  x: number;
  expected: number | null;
  got: number;
  pass: boolean;
};

export function runAgainstExpected(x: number, expected: number): TestResult {
  const got = abs8(x);
  return { x, expected, got, pass: got === expected };
}

export function runAgainstSpec(x: number): TestResult {
  const got = abs8(x);
  return { x, expected: null, got, pass: satisfiesSpec(x) };
}

export function allInputs(): number[] {
  const xs: number[] = [];
  for (let i = INT8_MIN; i <= INT8_MAX; i++) xs.push(i);
  return xs;
}

/** Scan all values except the known bug first, so the red cell appears last. */
export function exhaustiveOrder(): number[] {
  return allInputs()
    .filter((x) => x !== INT8_MIN)
    .concat(INT8_MIN);
}

export function isInt8(n: number): boolean {
  return Number.isInteger(n) && n >= INT8_MIN && n <= INT8_MAX;
}
