import { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import { buildParser } from '../grammar/top-down-parser.js';
import { charCodes } from '../utils/iter.js';
import { buildLexer } from '../lexer-gen/index.js';
import { parseRegex } from '../regex-compiler/parser.js';
import { charSeq } from '../nfa-to-dfa/regex-nfa.js';

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
Expr →
  | Term ExprP
ExprP →
  | '+' Term ExprP
  | '-' Term ExprP
  | ϵ
Term →
  | 'NUM'
  | 'ID'
  | '(' Expr ')'
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
