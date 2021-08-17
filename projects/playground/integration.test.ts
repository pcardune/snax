import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { buildParser } from '../grammar/top-down-parser';
import { charCodes } from '../utils/iter';
import { buildLexer } from '../lexer-gen';
import { parseRegex } from '../regex-compiler/parser';

describe('integration test', () => {
  enum MT {
    NUM = 'NUM',
    ID = 'ID',
    LPAREN = '(',
    RPAREN = ')',
    PLUS = '+',
    MINUS = '-',
    WS = 'WS',
  }
  let lexer = buildLexer(
    new OrderedMap([
      [MT.NUM, parseRegex('\\d\\d*').nfa()],
      [MT.ID, parseRegex('\\w\\w*').nfa()],
      [MT.LPAREN, parseRegex('\\(').nfa()],
      [MT.RPAREN, parseRegex('\\)').nfa()],
      [MT.PLUS, parseRegex('\\+').nfa()],
      [MT.MINUS, parseRegex('-').nfa()],
      [MT.WS, parseRegex('( |\t)+').nfa()],
    ]),
    [MT.WS]
  );

  let parser = buildParser({
    Root: [['Expr']],
    Expr: [['Expr', MT.PLUS, 'Term'], ['Expr', MT.MINUS, 'Term'], ['Term']],
    Term: [[MT.NUM], [MT.ID], [MT.LPAREN, 'Expr', MT.RPAREN]],
  });

  test('stuff2', () => {
    expect(parser.grammar.toString()).toMatchInlineSnapshot(`
      "
      Root →
        | Expr
      Term →
        | 'NUM'
        | 'ID'
        | '(' Expr ')'
      ExprP →
        | '+' Term ExprP
        | '-' Term ExprP
        | ϵ
      Expr →
        | Term ExprP
      "
    `);
    let chars = charCodes('34 + (5-something)');
    let tokens = [...lexer.parse(chars)];
    expect(tokens.map((t) => t.toString())).toMatchInlineSnapshot(`
      Array [
        "<NUM>34</NUM>",
        "<+>+</+>",
        "<(>(</(>",
        "<NUM>5</NUM>",
        "<->-</->",
        "<ID>something</ID>",
        "<)>)</)>",
      ]
    `);
    let result = parser.parseTokensOrThrow(tokens);
    expect(result.pretty()).toMatchInlineSnapshot(`
      "
      <Root>
      |  <Expr>
      |  |  <Term>
      |  |  |  <NUM>34</NUM>
      |  |  </Term>
      |  |  <ExprP>
      |  |  |  <+>+</+>
      |  |  |  <Term>
      |  |  |  |  <(>(</(>
      |  |  |  |  <Expr>
      |  |  |  |  |  <Term>
      |  |  |  |  |  |  <NUM>5</NUM>
      |  |  |  |  |  </Term>
      |  |  |  |  |  <ExprP>
      |  |  |  |  |  |  <->-</->
      |  |  |  |  |  |  <Term>
      |  |  |  |  |  |  |  <ID>something</ID>
      |  |  |  |  |  |  </Term>
      |  |  |  |  |  |  <ExprP>
      |  |  |  |  |  |  </ExprP>
      |  |  |  |  |  </ExprP>
      |  |  |  |  </Expr>
      |  |  |  |  <)>)</)>
      |  |  |  </Term>
      |  |  |  <ExprP>
      |  |  |  </ExprP>
      |  |  </ExprP>
      |  </Expr>
      </Root>
      "
    `);
  });
});
