import * as dsl from './dsl.js';
import {
  compileLexerToTypescript,
  compileGrammarToTypescript,
  compileLexer,
  compileGrammarToParser,
} from './dsl.js';

const grammar = `
TOKEN_A = "a"
TOKEN_B = "b"

Root =
  | [TOKEN_A]
  | [TOKEN_B Rule]

Rule = 
  | [TOKEN_A "some string"]
  | []
`;

xdescribe('dsl', () => {
  let root: any;
  beforeAll(() => {
    root = dsl.parseOrThrow(grammar);
  });

  test('compileLexerToTypescript', () => {
    const ts = compileLexerToTypescript(root, '/importRoot')._unsafeUnwrap();
    expect(ts).toMatchSnapshot();
  });

  test('compileParserToTypescript', () => {
    const ts = compileGrammarToTypescript(root, '/importRoot')._unsafeUnwrap();
    expect(ts).toMatchSnapshot();
  });

  test('compileLexer', () => {
    const lexer = compileLexer(root)._unsafeUnwrap();
    expect([...lexer.parse('a')].map((t) => t.token)).toEqual(['TOKEN_A']);
    expect([...lexer.parse('b')].map((t) => t.token)).toEqual(['TOKEN_B']);
    expect([...lexer.parse('bsome string')].map((t) => t.token)).toEqual([
      'TOKEN_B',
      'IMPLICIT_2',
    ]);
  });

  test('compileGrammarToParser', () => {
    const lexer = compileLexer(root)._unsafeUnwrap();
    const parser = compileGrammarToParser(root)._unsafeUnwrap();
    let tree = parser.parseTokensOrThrow(lexer.parse('a'));
    if (!tree) {
      fail();
    }
    expect(tree.pretty()).toMatchInlineSnapshot(`
      "
      <Root>
      |  <TOKEN_A>a</TOKEN_A>
      </Root>
      "
    `);

    tree = parser.parseTokensOrThrow(lexer.parse('basome string'));
    if (!tree) {
      fail();
    }
    expect(tree.pretty()).toMatchInlineSnapshot(`
      "
      <Root>
      |  <TOKEN_B>b</TOKEN_B>
      |  <Rule>
      |  |  <TOKEN_A>a</TOKEN_A>
      |  |  <IMPLICIT_2>some string</IMPLICIT_2>
      |  </Rule>
      </Root>
      "
    `);
  });
});
