import { calcFirst, calcFollow, EPSILON, Grammar } from './grammar';

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

describe('first and follow set calculation', () => {
  const grammar: Grammar<string | typeof EPSILON> = new Grammar();
  grammar.addProductions('Goal', [['Expr']]);
  grammar.addProductions('Expr', [['Term', 'ExprP']]);
  grammar.addProductions('ExprP', [
    ['+', 'Term', 'ExprP'],
    ['-', 'Term', 'ExprP'],
    [EPSILON],
  ]);
  grammar.addProductions('Term', [['Factor', 'TermP']]);
  grammar.addProductions('TermP', [
    ['*', 'Factor', 'TermP'],
    ['/', 'Factor', 'TermP'],
    [EPSILON],
  ]);
  grammar.addProductions('Factor', [['(', 'Expr', ')'], ['num'], ['name']]);

  const toObject = (m: Map<any, ReadonlySet<any>>) => {
    let out = {} as { [i: string]: any[] };
    for (let [k, v] of m.entries()) {
      out[k.toString()] = [...v].map((v) => v.toString()).sort();
    }
    return out;
  };

  it('should calculate the first map correctly', () => {
    const first = calcFirst(grammar);
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
    const first = calcFirst(grammar);
    const follow = calcFollow(grammar, first);
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
