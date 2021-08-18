import { Grammar, nonTerminal, terminal } from './grammar';

describe('Grammar', () => {
  const grammar: Grammar<string> = new Grammar();
  grammar.addProductions('Expr', nonTerminal('Expr'), [
    [terminal('('), nonTerminal('Expr'), terminal(')')],
    [nonTerminal('Expr'), nonTerminal('Op'), terminal('name')],
    [terminal('name')],
  ]);
  grammar.addProductions('Expr', nonTerminal('Op'), [
    [terminal('+')],
    [terminal('-')],
    [terminal('*')],
    [terminal('/')],
  ]);

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
