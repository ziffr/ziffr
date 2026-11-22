// Hand-worked cases for Share of the largest rows: the rows, n, and the answer worked out on paper. A share is part ÷ whole,
// so a share of 3 in 4 is 0.75 and 1 in 3 is the double nearest to a third.
const fewer = "needs at least two rows to say how much of the whole the largest make up";
const nothing = "the rows add up to nothing, so there is no share to give";
const ask = "n must be a whole number from 1 to one fewer than the rows";
const abc = [{ label: "A", value: 20 }, { label: "B", value: 50 }, { label: "C", value: 30 }];

export const cases = [
  { name: "the largest of 20, 50 and 30 is half of 100", input: abc, params: [1], expected: { share: 0.5, percent: 50, top: [{ label: "B", value: 50, share: 0.5, percent: 50 }], rows: 3, total: 100, tied: false } },
  { name: "the two largest of 20, 50 and 30 make 80 of 100", input: abc, params: [2], expected: { share: 0.8, percent: 80, top: [{ label: "B", value: 50, share: 0.5, percent: 50 }, { label: "C", value: 30, share: 0.3, percent: 30 }], rows: 3, total: 100, tied: false } },
  { name: "0.1, 0.2, 0.3 and 0.4 add to exactly 1 and the top two are exactly 0.7", input: [{ label: "A", value: 0.1 }, { label: "B", value: 0.2 }, { label: "C", value: 0.3 }, { label: "D", value: 0.4 }], params: [2], expected: { share: 0.7, percent: 70, top: [{ label: "D", value: 0.4, share: 0.4, percent: 40 }, { label: "C", value: 0.3, share: 0.3, percent: 30 }], rows: 4, total: 1, tied: false } },
  { name: "three rows of 5: the first given is named, and the cut is tied", input: [{ label: "A", value: 5 }, { label: "B", value: 5 }, { label: "C", value: 5 }], params: [1], expected: { share: 1 / 3, percent: 100 / 3, top: [{ label: "A", value: 5, share: 1 / 3, percent: 100 / 3 }], rows: 3, total: 15, tied: true } },
  { name: "rows of the same size below the cut do not tie it", input: [{ label: "A", value: 5 }, { label: "B", value: 3 }, { label: "C", value: 3 }], params: [1], expected: { share: 5 / 11, percent: 500 / 11, top: [{ label: "A", value: 5, share: 5 / 11, percent: 500 / 11 }], rows: 3, total: 11, tied: false } },
  { name: "rows of the same size at the cut tie it, and keep the order given", input: [{ label: "A", value: 5 }, { label: "B", value: 3 }, { label: "C", value: 3 }], params: [2], expected: { share: 8 / 11, percent: 800 / 11, top: [{ label: "A", value: 5, share: 5 / 11, percent: 500 / 11 }, { label: "B", value: 3, share: 3 / 11, percent: 300 / 11 }], rows: 3, total: 11, tied: true } },
  { name: "a row of 0 among the largest has a share of 0", input: [{ label: "A", value: 3 }, { label: "B", value: 0 }, { label: "C", value: 0 }], params: [2], expected: { share: 1, percent: 100, top: [{ label: "A", value: 3, share: 1, percent: 100 }, { label: "B", value: 0, share: 0, percent: 0 }], rows: 3, total: 3, tied: true } },
  { name: "two rows of 1e21: half, and a total too big for 53 bits", input: [{ label: "A", value: 1e21 }, { label: "B", value: 1e21 }], params: [1], expected: { share: 0.5, percent: 50, top: [{ label: "A", value: 1e21, share: 0.5, percent: 50 }], rows: 2, total: 2e21, tied: true } },
  { name: "1e-7 and 3e-7 add to 4e-7 and the larger is three quarters", input: [{ label: "A", value: 1e-7 }, { label: "B", value: 3e-7 }], params: [1], expected: { share: 0.75, percent: 75, top: [{ label: "B", value: 3e-7, share: 0.75, percent: 75 }], rows: 2, total: 4e-7, tied: false } },
  { name: "rows of different sizes: 12 of 13.75 is 48 in 55", input: [{ label: "A", value: 0.5 }, { label: "B", value: 12 }, { label: "C", value: 1.25 }], params: [1], expected: { share: 48 / 55, percent: 960 / 11, top: [{ label: "B", value: 12, share: 48 / 55, percent: 960 / 11 }], rows: 3, total: 13.75, tied: false } },
  { name: "a share exactly between two doubles goes to the even one: 1 less 3 in 2^54 is 1 less 2^-52", input: [{ label: "A", value: 9007199254740991 }, { label: "B", value: 9007199254740990 }, { label: "C", value: 3 }], params: [2], expected: { share: 1 - 2 ** -52, percent: 100 - 2 ** -46, top: [{ label: "A", value: 9007199254740991, share: 0.5 - 2 ** -54, percent: 50 - 100 * 2 ** -54 }, { label: "B", value: 9007199254740990, share: 0.5 - 2 ** -53, percent: 50 - 100 * 2 ** -53 }], rows: 3, total: 2 ** 54, tied: false } },
  { name: "a share exactly between two doubles goes up where the lower one is odd: 1 less 1 in 2^54 is 1", input: [{ label: "A", value: 9007199254740991 }, { label: "B", value: 9007199254740992 }, { label: "C", value: 1 }], params: [2], expected: { share: 1, percent: 100, top: [{ label: "B", value: 9007199254740992, share: 0.5, percent: 50 }, { label: "A", value: 9007199254740991, share: 0.5 - 2 ** -54, percent: 50 - 100 * 2 ** -54 }], rows: 3, total: 2 ** 54, tied: false } },
  { name: "no rows are refused", input: [], params: [1], refused: fewer },
  { name: "one row is refused", input: [{ label: "A", value: 5 }], params: [1], refused: fewer },
  { name: "a row that is not a number is refused", input: [{ label: "A", value: 5 }, { label: "B", value: NaN }], params: [1], refused: "a row is not a number, so nothing is worked out" },
  { name: "an infinite row is refused", input: [{ label: "A", value: 5 }, { label: "B", value: Infinity }], params: [1], refused: "a row is not a number, so nothing is worked out" },
  { name: "a row below zero is refused", input: [{ label: "A", value: 5 }, { label: "B", value: -1 }], params: [1], refused: "a row is below zero, so the rows are not parts of one whole" },
  { name: "rows that add up to nothing are refused", input: [{ label: "A", value: 0 }, { label: "B", value: 0 }], params: [1], refused: nothing },
  { name: "an n of 0 is refused", input: abc, params: [0], refused: ask },
  { name: "an n of all the rows is refused: that is the whole", input: abc, params: [3], refused: ask },
  { name: "an n that is not whole is refused", input: abc, params: [1.5], refused: ask },
  { name: "an n that is not a number is refused", input: abc, params: [NaN], refused: ask },
];
