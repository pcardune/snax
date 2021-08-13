import {
  Grammar,
  nonTerminal,
  terminal,
  GSymbol,
  EOF,
  buildGrammar,
} from './grammar';
import {
  buildParser,
  parse,
  ParseNode,
  Parser,
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
      ExprP →
        | '+' Term ExprP
        | '-' Term ExprP
        | ϵ
      Expr →
        | Term ExprP
      TermP →
        | '*' Factor TermP
        | '/' Factor TermP
        | ϵ
      Term →
        | Factor TermP
      "
    `);
  });
});

describe('removeLeftRecursion', () => {
  const grammar = new Grammar();
  grammar.addProductions(nonTerminal('A'), [[nonTerminal('B')]]);
  grammar.addProductions(nonTerminal('B'), [[nonTerminal('C')]]);
  grammar.addProductions(nonTerminal('C'), [[nonTerminal('A'), terminal('d')]]);
  // console.log(grammar.toString());
  test('it works', () => {
    removeLeftRecursion(grammar);
    expect(grammar.toString()).toMatchInlineSnapshot(`
      "
      A →
        | B
      B →
        | C
      CP →
        | 'd' CP
        | ϵ
      C →
        | CP
      "
    `);
  });
});

describe('parse', () => {
  function node(symbol: GSymbol, children: (ParseNode | string)[]): ParseNode {
    return new ParseNode(symbol, children);
  }

  describe('simple grammar', () => {
    // Root -> num
    const parser = buildParser({ Root: [['num']] });
    test('parse', () => {
      expect(parser.parse(['num']).pretty()).toMatchInlineSnapshot(`
        "
        |-Root
        |  |-'num'
        "
      `);
      expect(() => parser.parse(['bad'])).toThrow();
      expect(() => parser.parse([])).toThrow();
    });
  });

  describe('sequence grammar', () => {
    const parser = buildParser({
      Root: [['first', 'second', 'third']],
    });
    test('parse', () => {
      const tokens = ['first', 'second', 'third'];
      expect(parser.parse(tokens).pretty()).toMatchInlineSnapshot(`
        "
        |-Root
        |  |-'first'
        |  |-'second'
        |  |-'third'
        "
      `);
      expect(() => parser.parse(['second', 'third', 'first'])).toThrow(
        'No place to backtrack to'
      );
      expect(() => parser.parse(['first', 'second'])).toThrow();
      expect(() =>
        parser.parse(['first', 'second', 'third', 'first'])
      ).toThrow();
    });
  });

  describe('nested grammar', () => {
    const parser = buildParser({
      Root: [
        ['Child1', 'after-child-1'],
        ['Child2', 'after-child-2'],
      ],
      Child1: [['child-1']],
      Child2: [['child-2']],
    });
    test('parse', () => {
      expect(parser.parse(['child-1', 'after-child-1']).pretty())
        .toMatchInlineSnapshot(`
        "
        |-Root
        |  |-Child1
        |  |  |-'child-1'
        |  |-'after-child-1'
        "
      `);
      expect(parser.parse(['child-2', 'after-child-2']).pretty())
        .toMatchInlineSnapshot(`
        "
        |-Root
        |  |-Child2
        |  |  |-'child-2'
        |  |-'after-child-2'
        "
      `);
    });
  });

  describe('complex grammar', () => {
    const parser = buildParser({
      Root: [['Expr']],
      Expr: [['Expr', '+', 'Term'], ['Expr', '-', 'Term'], ['Term']],
      Term: [['Term', '*', 'Factor'], ['Term', '/', 'Factor'], ['Factor']],
      Factor: [['(', 'Expr', ')'], ['num'], ['name']],
    });

    // for the expression 3, we would have the token "num";
    test('num', () => {
      const tokens = ['num', EOF.key];
      const result = parser.parse(tokens);
      expect(result.pretty()).toMatchInlineSnapshot(`
        "
        |-Root
        |  |-Expr
        |  |  |-Term
        |  |  |  |-Factor
        |  |  |  |  |-'num'
        |  |  |  |-TermP
        |  |  |  |  |-ϵ
        |  |  |-ExprP
        |  |  |  |-ϵ
        "
      `);
    });
  });
});