// Hand-worked cases for Spread: the input and the answer worked out on paper.
export const cases = [
  { name: "three values", input: [1, 4, 2], expected: 3 },
  { name: "negative values", input: [-5, 5], expected: 10 },
  { name: "descending", input: [9, 7, 2], expected: 7 },
  { name: "a flat series", input: [3, 3, 3], refused: "every value is the same, so there is no spread" },
  { name: "one value", input: [3], refused: "needs at least two values" },
  { name: "a value that is not a number", input: [1, NaN, 3], refused: "a value is not a number" },
];
