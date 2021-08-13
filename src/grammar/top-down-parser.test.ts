import { Grammar, nonTerminal, terminal } from './grammar';
import {
  removeDirectLeftRecursion,
  removeLeftRecursion,
} from './top-down-parser';

describe('removeDirectLeftRecursion', () => {
  const grammar = new Grammar();
  grammar.addProductions(nonTerminal('Expr'), [
    [nonTerminal('Expr'), terminal('+'), nonTerminal('Term')],
    [nonTerminal('Expr'), terminal('-'), nonTerminal('Term')],
    [nonTerminal('Term')],
  ]);
  grammar.addProductions(nonTerminal('Term'), [
    [nonTerminal('Term'), terminal('*'), nonTerminal('Factor')],
    [nonTerminal('Term'), terminal('/'), nonTerminal('Factor')],
    [nonTerminal('Factor')],
  ]);
  grammar.addProductions(nonTerminal('Factor'), [
    [terminal('('), nonTerminal('Expr'), terminal(')')],
    [terminal('num')],
    [terminal('name')],
  ]);
  test('it works', () => {
    removeDirectLeftRecursion(grammar);
    expect(grammar.toString()).toMatchInlineSnapshot(`
      "
      Factor →
        | '(' Expr ')'
        | 'num'
        | 'name'
      Expr' →
        | '+' Term Expr'
        | '-' Term Expr'
        | ϵ
      Expr →
        | Term Expr'
      Term' →
        | '*' Factor Term'
        | '/' Factor Term'
        | ϵ
      Term →
        | Factor Term'
      "
    `);
  });
});

describe('removeLeftRecursion', () => {
  const grammar = new Grammar();
  grammar.addProductions(nonTerminal('A'), [[nonTerminal('B')]]);
  grammar.addProductions(nonTerminal('B'), [[nonTerminal('C')]]);
  grammar.addProductions(nonTerminal('C'), [[nonTerminal('A'), terminal('d')]]);
  console.log(grammar.toString());
  test('it works', () => {
    removeLeftRecursion(grammar);
    expect(grammar.toString()).toMatchInlineSnapshot(`
      "
      A →
        | B
      B →
        | C
      C' →
        | 'd' C'
        | ϵ
      C →
        | C'
      "
    `);
  });
});
