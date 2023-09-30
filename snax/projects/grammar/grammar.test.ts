import {
  buildGrammar,
  calcFirst,
  calcFollow,
  findLongestPrefix,
  Grammar,
  isBacktrackFree,
  leftFactor,
  type ParseNodeGrammar,
  startsWith,
} from './grammar.js';
import { Parser } from './top-down-parser.js';

describe('Grammar', () => {
  const grammar: Grammar<string> = new Grammar();
  grammar.addProductions('Expr', [
    ['(', 'Expr', ')'],
    ['Expr', 'Op', 'name'],
    ['name'],
  ]);
  grammar.addProductions('Op', [['+'], ['-'], ['*'], ['/']]);

  test('getTerminals()', () => {
    const terminals = grammar.getTerminals();
    expect([...terminals].sort()).toEqual([
      '(',
      ')',
      '*',
      '+',
      '-',
      '/',
      'name',
    ]);
  });

  test('getNonTerminals()', () => {
    const nonTerminals = grammar.getNonTerminals();
    expect([...nonTerminals].sort()).toEqual(['Expr', 'Op']);
  });

  test('toString()', () => {
    expect(grammar.toString()).toMatchInlineSnapshot(`
"
Expr →
  | '(' Expr ')'
  | Expr Op 'name'
  | 'name'
Op →
  | '+'
  | '-'
  | '*'
  | '/'
"
`);
  });
});

let backtrackFreeGrammar: ParseNodeGrammar;
beforeAll(() => {
  // prettier-ignore
  backtrackFreeGrammar = buildGrammar({
    'Goal': [['Expr']],
    'Expr': [['Term', 'ExprP']],
    'ExprP': [
      ['+', 'Term', 'ExprP'],
      ['-', 'Term', 'ExprP'],
      [],
    ],
    'Term': [['Factor', 'TermP']],
    'TermP': [
      ['*', 'Factor', 'TermP'],
      ['/', 'Factor', 'TermP'],
      [],
    ],
    'Factor': [
      ['(', 'Expr', ')'],
      ['num'],
      ['name'],
    ]
  })
});
describe('first and follow set calculation', () => {
  const toObject = (m: Map<any, ReadonlySet<any>>) => {
    let out = {} as { [i: string]: any[] };
    for (let [k, v] of m.entries()) {
      out[k.toString()] = [...v].map((v) => v.toString()).sort();
    }
    return out;
  };

  it('should calculate the first map correctly', () => {
    const first = calcFirst(backtrackFreeGrammar);
    expect(toObject(first)).toEqual({
      '(': ['('],
      ')': [')'],
      '*': ['*'],
      '+': ['+'],
      '-': ['-'],
      '/': ['/'],
      Expr: ['(', 'name', 'num'],
      ExprP: ['+', '-', 'Symbol(ϵ)'],
      Factor: ['(', 'name', 'num'],
      Goal: ['(', 'name', 'num'],
      Term: ['(', 'name', 'num'],
      TermP: ['*', '/', 'Symbol(ϵ)'],
      name: ['name'],
      num: ['num'],
      'Symbol(EOF)': ['Symbol(EOF)'],
      'Symbol(ϵ)': ['Symbol(ϵ)'],
    });
  });

  it('should calculate the follow map correctly', () => {
    const first = calcFirst(backtrackFreeGrammar);
    const follow = calcFollow(backtrackFreeGrammar, first, 'Goal');
    expect(toObject(follow)).toEqual({
      Expr: [')', 'Symbol(EOF)'],
      ExprP: [')', 'Symbol(EOF)'],
      Factor: [')', '*', '+', '-', '/', 'Symbol(EOF)'],
      Goal: ['Symbol(EOF)'],
      Term: [')', '+', '-', 'Symbol(EOF)'],
      TermP: [')', '+', '-', 'Symbol(EOF)'],
    });
  });
});

let backtrackingGrammar: ParseNodeGrammar;
beforeAll(() => {
  // prettier-ignore
  backtrackingGrammar = buildGrammar({
    'Goal': [['Expr']],
    'Expr': [['Term', 'ExprP']],
    'ExprP': [
      ['+', 'Term', 'ExprP'],
      ['-', 'Term', 'ExprP'],
      [],
    ],
    'Term': [['Factor', 'TermP']],
    'TermP': [
      ['*', 'Factor', 'TermP'],
      ['/', 'Factor', 'TermP'],
      [],
    ],
    'Factor': [
      ['(', 'Expr', ')'],
      ['num'],
      ['name'],
      ['name', '[', 'ArgList', ']'],
      ['name', '(', 'ArgList', ')'],
    ],
    'ArgList': [['Expr', 'MoreArgs']],
    'MoreArgs': [
      [',', 'Expr', 'MoreArgs'],
      [],
    ],
  });
});

describe('isBacktrackFree', () => {
  it('should be backtrack free...', () => {
    expect(isBacktrackFree(backtrackFreeGrammar, 'Goal')).toBe(true);
  });
  it('a non-backtrack free grammar should return false', () => {
    expect(isBacktrackFree(backtrackingGrammar, 'Goal')).toBe(false);
  });
});

describe('startsWith', () => {
  it('returns true for matching prefix', () => {
    expect(startsWith([1, 2, 3], [1])).toBe(true);
    expect(startsWith([1, 2, 3], [1, 2])).toBe(true);
  });
  it('returns false for non-matching prefix', () => {
    expect(startsWith([1, 2, 3], [3])).toBe(false);
  });
  it('does not blow up when the prefix is longer than the string', () => {
    expect(startsWith([1], [1, 2, 3])).toBe(false);
  });
});

describe('findLongestPrefix', () => {
  it('returns an empty prefix for an empty list of strings', () => {
    expect(findLongestPrefix([])).toEqual([]);
  });
  it('returns an empty prefix for when there are no common prefixes', () => {
    expect(
      findLongestPrefix([
        [1, 2],
        [2, 3],
        [4, 5],
      ])
    ).toEqual([]);
  });
  it('returns the correct longest prefix', () => {
    expect(findLongestPrefix([[1], [1]])).toEqual([1]);
    expect(findLongestPrefix([[1], [1], [1, 2]])).toEqual([1]);
    expect(findLongestPrefix([[1], [1], [1, 2], [1, 2]])).toEqual([1, 2]);
    expect(
      findLongestPrefix([[1], [1], [1, 2], [1, 2], [1, 2, 3], [4]])
    ).toEqual([1, 2]);
    expect(
      findLongestPrefix([[4], [1], [1, 2], [4, 3], [1, 2], [1, 2, 3], [4]])
    ).toEqual([1, 2]);
  });
});

describe('leftFactor', () => {
  let factored: ParseNodeGrammar;
  beforeAll(() => {
    factored = leftFactor(backtrackingGrammar);
  });
  it('will turn the backtracking grammar into a backtrack free grammar', () => {
    expect(isBacktrackFree(backtrackingGrammar, 'Goal')).toBe(false);
    expect(isBacktrackFree(factored, 'Goal')).toBe(true);
  });
  xit('it correctly preserves actions associated with the productions', () => {
    const root = new Parser(backtrackingGrammar, 'Goal').parseOrThrow([
      'name',
      '(',
      ')',
    ]);
    if (!root) fail();
    expect(root.pretty()).toMatchInlineSnapshot();
  });
});
