import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { buildParser } from '../grammar/top-down-parser';
import { charCodes } from '../utils/iter';
import { buildLexer } from '../lexer-gen';
import { parseRegex } from '../regex-compiler/parser';
import { charSeq } from '../nfa-to-dfa/regex-nfa';

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
      [MT.LPAREN, charSeq('(')],
      [MT.RPAREN, charSeq(')')],
      [MT.PLUS, charSeq('+')],
      [MT.MINUS, charSeq('-')],
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
    if (!result) {
      fail();
    }
    expect(result.pretty()).toMatchInlineSnapshot(`
      "
      <Root>
      |  <Expr>
      |  |  <Term>
      |  |  |  <NUM>34</NUM>
      |  |  </Term>
      |  |  <Expr>
      |  |  |  <+>+</+>
      |  |  |  <Term>
      |  |  |  |  <(>(</(>
      |  |  |  |  <Expr>
      |  |  |  |  |  <Term>
      |  |  |  |  |  |  <NUM>5</NUM>
      |  |  |  |  |  </Term>
      |  |  |  |  |  <Expr>
      |  |  |  |  |  |  <->-</->
      |  |  |  |  |  |  <Term>
      |  |  |  |  |  |  |  <ID>something</ID>
      |  |  |  |  |  |  </Term>
      |  |  |  |  |  |  <Expr>
      |  |  |  |  |  |  </Expr>
      |  |  |  |  |  </Expr>
      |  |  |  |  </Expr>
      |  |  |  |  <)>)</)>
      |  |  |  </Term>
      |  |  |  <Expr>
      |  |  |  </Expr>
      |  |  </Expr>
      |  </Expr>
      </Root>
      "
    `);
  });
});
