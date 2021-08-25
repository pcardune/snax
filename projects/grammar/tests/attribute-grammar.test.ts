import { lexer, Rules, Token } from './numbers.__generated__';
import { parseFlow, ParseNode } from '../top-down-parser';
import { Grammar } from '../grammar';
import { LexToken } from '../../lexer-gen/lexer-gen';

describe('attribute grammar', () => {
  test('other stuff', () => {
    type Symbol = Rules | Token;
    const grammar: Grammar<Symbol, number> = new Grammar();

    grammar.createProduction(Rules.Root, [Rules.List], ([list]) => list);
    grammar.createProduction(
      Rules.List,
      [Rules.Bit, Rules.List],
      ([bit, list]) => bit + list * 2
    );
    grammar.createProduction(Rules.List, [Rules.Bit], ([n]) => n);
    grammar.createProduction(Rules.List, [], () => 0);
    grammar.createProduction(Rules.Bit, [Token.IMPLICIT_0], () => 0);
    grammar.createProduction(Rules.Bit, [Token.IMPLICIT_1], () => 1);

    const tokens = lexer.parse('100101').toArray();
    const result = parseFlow(grammar, Rules.Root, tokens);
    expect(result._unsafeUnwrap()).toEqual(41);
  });

  test('parse tree attributes', () => {
    type Symbol = Rules | Token;
    const grammar: Grammar<
      Symbol,
      ParseNode<Symbol, LexToken<any>>
    > = new Grammar();
    grammar.createProduction(
      Rules.Root,
      [Rules.List],
      (children) => new ParseNode(Rules.Root, children)
    );
    grammar.createProduction(
      Rules.List,
      [Rules.Bit, Rules.List],
      (children) => new ParseNode(Rules.List, children)
    );
    grammar.createProduction(
      Rules.List,
      [Rules.Bit],
      (children) => new ParseNode(Rules.List, children)
    );
    grammar.createProduction(
      Rules.List,
      [],
      () => new ParseNode(Rules.List, [])
    );
    grammar.createProduction(
      Rules.Bit,
      [Token.IMPLICIT_0],
      (_, tokens) => new ParseNode(Rules.Bit, [ParseNode.forToken(tokens[0])])
    );
    grammar.createProduction(
      Rules.Bit,
      [Token.IMPLICIT_1],
      (_, tokens) => new ParseNode(Rules.Bit, [ParseNode.forToken(tokens[0])])
    );

    const tokens = lexer.parse('100101').toArray();
    const node = parseFlow(grammar, Rules.Root, tokens)._unsafeUnwrap();
    expect(node.pretty()).toMatchInlineSnapshot(`
        "
        <Root>
        |  <List>
        |  |  <Bit>
        |  |  |  <1>1</1>
        |  |  </Bit>
        |  |  <List>
        |  |  |  <Bit>
        |  |  |  |  <0>0</0>
        |  |  |  </Bit>
        |  |  |  <List>
        |  |  |  |  <Bit>
        |  |  |  |  |  <0>0</0>
        |  |  |  |  </Bit>
        |  |  |  |  <List>
        |  |  |  |  |  <Bit>
        |  |  |  |  |  |  <1>1</1>
        |  |  |  |  |  </Bit>
        |  |  |  |  |  <List>
        |  |  |  |  |  |  <Bit>
        |  |  |  |  |  |  |  <0>0</0>
        |  |  |  |  |  |  </Bit>
        |  |  |  |  |  |  <List>
        |  |  |  |  |  |  |  <Bit>
        |  |  |  |  |  |  |  |  <1>1</1>
        |  |  |  |  |  |  |  </Bit>
        |  |  |  |  |  |  |  <List>
        |  |  |  |  |  |  |  </List>
        |  |  |  |  |  |  </List>
        |  |  |  |  |  </List>
        |  |  |  |  </List>
        |  |  |  </List>
        |  |  </List>
        |  </List>
        </Root>
        "
      `);
  });
});
