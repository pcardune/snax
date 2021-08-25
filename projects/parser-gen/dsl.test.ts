import * as dsl from "./dsl";
import {
  compileLexerToTypescript,
  compileGrammarToTypescript,
  compileLexer,
  compileGrammarToParser,
} from "./dsl";

const grammar = `
TOKEN_A = "a"
TOKEN_B = "b"

Root =
  | [TOKEN_A]
  | [TOKEN_B Rule]

Rule = 
  | [TOKEN_A Rule "some string"]
  | []
`;

describe("dsl", () => {
  const root = dsl.parseOrThrow(grammar);
  test("compileLexerToTypescript", () => {
    const ts = compileLexerToTypescript(root, "/importRoot")._unsafeUnwrap();
    expect(ts).toMatchSnapshot();
  });

  test("compileParserToTypescript", () => {
    const ts = compileGrammarToTypescript(root, "/importRoot")._unsafeUnwrap();
    expect(ts).toMatchSnapshot();
  });

  test("compileLexer", () => {
    const lexer = compileLexer(root)._unsafeUnwrap();
    expect([...lexer.parse("a")].map((t) => t.token)).toEqual(["TOKEN_A"]);
    expect([...lexer.parse("b")].map((t) => t.token)).toEqual(["TOKEN_B"]);
    expect([...lexer.parse("bsome string")].map((t) => t.token)).toEqual([
      "TOKEN_B",
      "IMPLICIT_2",
    ]);
  });

  test("compileGrammarToParser", () => {
    const lexer = compileLexer(root)._unsafeUnwrap();
    const parser = compileGrammarToParser(root)._unsafeUnwrap();
    const tree = parser.parseTokensOrThrow(lexer.parse("a"));
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
  });
});
