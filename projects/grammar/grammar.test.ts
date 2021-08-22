import { Grammar } from './grammar';

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
