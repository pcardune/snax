import { buildGrammar, Grammar } from '../grammar';
import {
  buildParser,
  ParseErrorType,
  Parser,
  removeDirectLeftRecursion,
  removeLeftRecursion,
} from '../top-down-parser';

describe('removeDirectLeftRecursion', () => {
  const grammar: Grammar<string> = new Grammar();
  grammar.addProductions('Expr', [
    ['Expr', '+', 'Term'],
    ['Expr', '-', 'Term'],
    ['Term'],
  ]);
  grammar.addProductions('Term', [
    ['Term', '*', 'Factor'],
    ['Term', '/', 'Factor'],
    ['Factor'],
  ]);
  grammar.addProductions('Factor', [['(', 'Expr', ')'], ['num'], ['name']]);
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
  const grammar: Grammar<string> = new Grammar();
  grammar.addProductions('A', [['B']]);
  grammar.addProductions('B', [['C']]);
  grammar.addProductions('C', [['A', 'd']]);
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
  describe('simple grammar', () => {
    // Root -> num
    const grammar = buildGrammar({ Root: [['num']] });
    const parser = new Parser(grammar, 'Root');
    test('parse', () => {
      const tree = parser.parseOrThrow(['num']);
      expect(tree.pretty()).toMatchInlineSnapshot(`
        "
        <Root>
        |  <num>num</num>
        </Root>
        "
      `);
      expect(() => parser.parseOrThrow(['bad'])).toThrow();
      expect(() => parser.parseOrThrow([])).toThrow();
    });
  });

  describe('sequence grammar', () => {
    const parser = buildParser({
      Root: [['first', 'second', 'third']],
    });
    test('parse', () => {
      const tokens = ['first', 'second', 'third'];
      expect(parser.parseOrThrow(tokens).pretty()).toMatchInlineSnapshot(`
        "
        <Root>
        |  <first>first</first>
        |  <second>second</second>
        |  <third>third</third>
        </Root>
        "
      `);
      expect(() => parser.parseOrThrow(['second', 'third', 'first'])).toThrow();
      expect(() => parser.parseOrThrow(['first', 'second'])).toThrow();
      expect(() =>
        parser.parseOrThrow(['first', 'second', 'third', 'first'])
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
      expect(parser.parseOrThrow(['child-1', 'after-child-1']).pretty())
        .toMatchInlineSnapshot(`
        "
        <Root>
        |  <Child1>
        |  |  <child-1>child-1</child-1>
        |  </Child1>
        |  <after-child-1>after-child-1</after-child-1>
        </Root>
        "
      `);
      expect(parser.parseOrThrow(['child-2', 'after-child-2']).pretty())
        .toMatchInlineSnapshot(`
        "
        <Root>
        |  <Child2>
        |  |  <child-2>child-2</child-2>
        |  </Child2>
        |  <after-child-2>after-child-2</after-child-2>
        </Root>
        "
      `);
    });
  });

  describe('Putting back tokens while backtracking', () => {
    const parser = buildParser({
      Root: [
        ['before-A', 'A', 'after-A'],
        ['before-B', 'B', 'after-B'],
      ],
      A: [['a'], ['an']],
      B: [['be'], ['been']],
    });
    test('parses', () => {
      expect(parser.parseOrThrow(['before-B', 'been', 'after-B']).pretty())
        .toMatchInlineSnapshot(`
        "
        <Root>
        |  <before-B>before-B</before-B>
        |  <B>
        |  |  <been>been</been>
        |  </B>
        |  <after-B>after-B</after-B>
        </Root>
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
      const tokens = ['num'];
      const result = parser.parseOrThrow(tokens);
      expect(result.pretty()).toMatchInlineSnapshot(`
        "
        <Root>
        |  <Expr>
        |  |  <Term>
        |  |  |  <Factor>
        |  |  |  |  <num>num</num>
        |  |  |  </Factor>
        |  |  |  <Term>
        |  |  |  </Term>
        |  |  </Term>
        |  |  <Expr>
        |  |  </Expr>
        |  </Expr>
        </Root>
        "
      `);
    });
    test('num+num', () => {
      const tokens = ['num', '+', 'num'];
      const result = parser.parseOrThrow(tokens);
      expect(result.pretty()).toMatchSnapshot();
    });
    test('(num+num)', () => {
      const tokens = ['(', 'num', '+', 'num', ')'];
      const result = parser.parseOrThrow(tokens);
      expect(result.pretty()).toMatchSnapshot();
    });
    test('num+num+(num-num)', () => {
      const tokens = ['num', '+', 'num', '+', '(', 'num', '-', 'num', ')'];
      const result = parser.parseOrThrow(tokens);
      expect(result.pretty()).toMatchSnapshot();
    });
    describe('error handling', () => {
      test('+ should not parse', () => {
        const tokens = ['+'];
        const result = parser.parse(tokens);
        if (result.isOk()) {
          fail();
        }
        expect(result.error.type).toBe(ParseErrorType.TOKENS_REMAIN);
      });
      test('num+ should not parse', () => {
        const tokens = ['num', '+'];
        const result = parser.parse(tokens);
        if (result.isOk()) {
          fail();
        }
        expect(result.error.type).toBe(ParseErrorType.TOKENS_REMAIN);
      });
    });
  });
});
