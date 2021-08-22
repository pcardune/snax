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
import {
  parser,
  lexer,
  compileLexerToTypescript,
  compileGrammarToTypescript,
} from './dsl';
describe('dsl', () => {
  const tokens = lexer.parse(grammar);
  const root = parser.parseTokensOrThrow(tokens);
  test('compileLexerToTypescript', () => {
    const ts = compileLexerToTypescript(root, '/importRoot')._unsafeUnwrap();
    expect(ts).toMatchSnapshot();
  });

  test('compileParserToTypescript', () => {
    const ts = compileGrammarToTypescript(root, '/importRoot')._unsafeUnwrap();
    expect(ts).toMatchSnapshot();
  });
});
