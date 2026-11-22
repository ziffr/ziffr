// Hand-worked cases for Spread, in which the author thinks a flat series has a spread of 0.
export const cases = [
  { name: "three values", input: [1, 4, 2], expected: 3 },
  { name: "negative values", input: [-5, 5], expected: 10 },
  { name: "descending", input: [9, 7, 2], expected: 7 },
  { name: "a flat series", input: [3, 3, 3], expected: 0 },
  { name: "one value", input: [3], refused: "needs at least two values" },
];
