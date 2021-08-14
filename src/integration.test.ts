import { buildParser } from './grammar/top-down-parser';
import { charCodes, collect } from './iter';
import { buildLexer } from './lexer-gen';

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
    [
      [MT.NUM, '\\d\\d*'],
      [MT.ID, '\\w\\w*'],
      [MT.LPAREN, '\\('],
      [MT.RPAREN, '\\)'],
      [MT.PLUS, '\\+'],
      [MT.MINUS, '-'],
      [MT.WS, '( |\t)+'],
    ],
    [MT.WS]
  );

  let parser = buildParser({
    Root: [['Expr']],
    Expr: [['Expr', MT.PLUS, 'Term'], ['Expr', MT.MINUS, 'Term'], ['Term']],
    Term: [[MT.NUM], [MT.ID]],
  });

  test('stuff2', () => {
    let tokens = [...lexer.parse(charCodes('34 + 5'))];
    expect(tokens.map((t) => t.toString())).toMatchInlineSnapshot(`
      Array [
        "<NUM>34</NUM>",
        "<+>+</+>",
        "<NUM>5</NUM>",
      ]
    `);
    let result = parser.parseTokens(tokens);
    expect(result.pretty()).toMatchInlineSnapshot(`
      "
      <Root>
      |  <Expr>
      |  |  <Term>
      |  |  |  <NUM><NUM>34</NUM></NUM>
      |  |  </Term>
      |  |  <ExprP>
      |  |  |  <+><+>+</+></+>
      |  |  |  <Term>
      |  |  |  |  <NUM><NUM>5</NUM></NUM>
      |  |  |  </Term>
      |  |  |  <ExprP>
      |  |  |  |  <ϵ>undefined</ϵ>
      |  |  |  </ExprP>
      |  |  </ExprP>
      |  </Expr>
      </Root>
      "
    `);
  });
});
