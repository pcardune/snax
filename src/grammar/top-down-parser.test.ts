import { Grammar, nonTerminal, terminal } from './grammar';
import {
  removeDirectLeftRecursion,
  removeIndirectLeftRecursion,
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
Expr ->
  | Term Expr'
Term ->
  | Factor Term'
Factor ->
  | '(' Expr ')'
  | 'num'
  | 'name'
Expr' ->
  | '+' Term Expr'
  | '-' Term Expr'
  | ϵ
Term' ->
  | '*' Factor Term'
  | '/' Factor Term'
  | ϵ
"
`);
  });
});

// describe('removeIndirectLeftRecursion', () => {
//   const grammar = new Grammar();
//   grammar.addProductions(nonTerminal('A'), [[nonTerminal('B')]]);
//   grammar.addProductions(nonTerminal('B'), [[nonTerminal('C')]]);
//   grammar.addProductions(nonTerminal('C'), [[nonTerminal('D')]]);
//   grammar.addProductions(nonTerminal('D'), [
//     [nonTerminal('A'), terminal('theend')],
//   ]);
//   console.log(grammar.toString());
//   test('it works', () => {
//     console.log(removeIndirectLeftRecursion(grammar).toString());
//   });
// });
