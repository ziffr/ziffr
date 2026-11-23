// Hand-worked cases for Spread, one of which was worked out wrongly: 4 - 1 is 3, not 4.
export const cases = [
  { name: "three values", input: [1, 4, 2], expected: 4 },
  { name: "negative values", input: [-5, 5], expected: 10 },
  { name: "descending", input: [9, 7, 2], expected: 7 },
  { name: "a flat series", input: [3, 3, 3], refused: "every value is the same, so there is no spread" },
  { name: "one value", input: [3], refused: "needs at least two values" },
];
