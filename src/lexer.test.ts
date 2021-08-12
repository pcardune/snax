import { Lexer, Token } from './lexer';
import { collect } from './iter';

describe('lexer', () => {
  const { CHAR, STAR, OPEN_PAREN, CLOSE_PAREN, OR, ANY_CHAR } = Token;
  const cases: [string, Token[]][] = [
    ['abc*', [CHAR, CHAR, CHAR, STAR]],
    ['(a|b)*', [OPEN_PAREN, CHAR, OR, CHAR, CLOSE_PAREN, STAR]],
    ['(\\(a|b)*', [OPEN_PAREN, CHAR, CHAR, OR, CHAR, CLOSE_PAREN, STAR]],
    ['a.*b', [CHAR, ANY_CHAR, STAR, CHAR]],
  ];
  test.each(cases)('%p lexes to %p', (input, expected) => {
    let tokens = collect(new Lexer(input)).map((t) => t.kind);
    expect(tokens).toEqual(expected);
  });
});
