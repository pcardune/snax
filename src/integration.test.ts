import { OrderedMap } from './data-structures/OrderedMap';
import { buildParser } from './grammar/top-down-parser';
import { charCodes } from './iter';
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
    new OrderedMap([
      [MT.NUM, '\\d\\d*'],
      [MT.ID, '\\w\\w*'],
      [MT.LPAREN, '\\('],
      [MT.RPAREN, '\\)'],
      [MT.PLUS, '\\+'],
      [MT.MINUS, '-'],
      [MT.WS, '( |\t)+'],
    ]),
    [MT.WS]
  );

  let parser = buildParser({
    Root: [['Expr']],
    Expr: [['Expr', MT.PLUS, 'Term'], ['Expr', MT.MINUS, 'Term'], ['Term']],
    Term: [[MT.NUM], [MT.ID]],
  });

  test('stuff2', () => {
    let chars = charCodes('34 + 5-4');
    let tokens = [...lexer.parse(chars)];
    expect(tokens.map((t) => t.toString())).toMatchInlineSnapshot(`
      Array [
        "<NUM>34</NUM>",
        "<+>+</+>",
        "<NUM>5</NUM>",
        "<->-</->",
        "<NUM>4</NUM>",
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
      |  |  |  |  <-><->-</-></->
      |  |  |  |  <Term>
      |  |  |  |  |  <NUM><NUM>4</NUM></NUM>
      |  |  |  |  </Term>
      |  |  |  |  <ExprP>
      |  |  |  |  |  <ϵ>undefined</ϵ>
      |  |  |  |  </ExprP>
      |  |  |  </ExprP>
      |  |  </ExprP>
      |  </Expr>
      </Root>
      "
    `);
  });
});
