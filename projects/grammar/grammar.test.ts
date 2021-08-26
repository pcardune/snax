import {
  calcFirst,
  calcFollow,
  EPSILON,
  Grammar,
  isBacktrackFree,
} from './grammar';

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

let backtrackFreeGrammar: Grammar<string | typeof EPSILON>;
beforeAll(() => {
  backtrackFreeGrammar = new Grammar();
  backtrackFreeGrammar.addProductions('Goal', [['Expr']]);
  backtrackFreeGrammar.addProductions('Expr', [['Term', 'ExprP']]);
  backtrackFreeGrammar.addProductions('ExprP', [
    ['+', 'Term', 'ExprP'],
    ['-', 'Term', 'ExprP'],
    [EPSILON],
  ]);
  backtrackFreeGrammar.addProductions('Term', [['Factor', 'TermP']]);
  backtrackFreeGrammar.addProductions('TermP', [
    ['*', 'Factor', 'TermP'],
    ['/', 'Factor', 'TermP'],
    [EPSILON],
  ]);
  backtrackFreeGrammar.addProductions('Factor', [
    ['(', 'Expr', ')'],
    ['num'],
    ['name'],
  ]);
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
      'Symbol(ϵ)': ['Symbol(ϵ)'],
    });
  });

  it('should calculate the follow map correctly', () => {
    const first = calcFirst(backtrackFreeGrammar);
    const follow = calcFollow(backtrackFreeGrammar, first);
    expect(toObject(follow)).toEqual({
      Expr: [')'],
      ExprP: [')'],
      Factor: [')', '*', '+', '-', '/'],
      Goal: [],
      Term: [')', '+', '-'],
      TermP: [')', '+', '-'],
    });
  });
});

let backtrackingGrammar: Grammar<string | typeof EPSILON>;
beforeAll(() => {
  backtrackingGrammar = new Grammar();
  backtrackingGrammar.addProductions('Goal', [['Expr']]);
  backtrackingGrammar.addProductions('Expr', [['Term', 'ExprP']]);
  backtrackingGrammar.addProductions('ExprP', [
    ['+', 'Term', 'ExprP'],
    ['-', 'Term', 'ExprP'],
    [EPSILON],
  ]);
  backtrackingGrammar.addProductions('Term', [['Factor', 'TermP']]);
  backtrackingGrammar.addProductions('TermP', [
    ['*', 'Factor', 'TermP'],
    ['/', 'Factor', 'TermP'],
    [EPSILON],
  ]);
  backtrackingGrammar.addProductions('Factor', [
    ['(', 'Expr', ')'],
    ['num'],
    ['name'],
    ['name', '[', 'ArgList', ']'],
    ['name', '(', 'ArgList', ')'],
  ]);
  backtrackingGrammar.addProductions('ArgList', [['Expr', 'MoreArgs']]);
  backtrackingGrammar.addProductions('MoreArgs', [
    [',', 'Expr', 'MoreArgs'],
    [EPSILON],
  ]);
});
describe('isBacktrackFree', () => {
  it('should be backtrack free...', () => {
    expect(isBacktrackFree(backtrackFreeGrammar)).toBe(true);
  });
  fit('a non-backtrack free grammar should return false', () => {
    expect(isBacktrackFree(backtrackingGrammar)).toBe(false);
  });
});
