import { charCodes, collect, iterable } from './iter';
import {
  MultiPatternMatcher,
  Pattern,
  regexPattern,
  stringPattern,
  Token,
  TokenIterator,
  Tokenizer,
} from './lexer-gen';
import { parseRegex } from './parser';
import { concatNFA, nfaForNode } from './regex';

export function token<T>(
  token: T,
  substr: string,
  from: number,
  to: number
): Token<T> {
  return { token, substr, span: { from, to } };
}

describe('lexer-gen', () => {
  enum Token {
    ADD = 'ADD',
    SUB = 'SUB',
    DIGIT = 'DIGIT',
    DIGITS = 'DIGITS',
  }
  const patterns = [
    stringPattern(Token.ADD, '+'),
    stringPattern(Token.SUB, '-'),
    regexPattern(Token.DIGIT, '0|1|2|3|4|5|6|7|8|9'),
    new Pattern(
      Token.DIGITS,
      concatNFA(
        nfaForNode(parseRegex('0|1|2|3|4|5|6|7|8|9')),
        nfaForNode(parseRegex('(0|1|2|3|4|5|6|7|8|9)*'))
      )
    ),
  ];

  describe('MultiPatternMatcher', () => {
    let matcher = new MultiPatternMatcher(patterns);
    const cases: [string, Token | undefined][] = [
      ['+', Token.ADD],
      ['-', Token.SUB],
      ['0', Token.DIGIT],
      ['123', Token.DIGITS],
      ['123+456', Token.DIGITS],
      ['foo', undefined],
    ];
    test.each(cases)('%s', (input, expectedToken) => {
      let chars = charCodes(input);
      expect(matcher.match(chars)?.token).toEqual(expectedToken);
    });
  });

  describe('Tokenizer', () => {
    let tokenizer = new Tokenizer(patterns);
    test("parse('123+456-78')", () => {
      let chars = charCodes('123+456-78');
      let tokens = collect(tokenizer.parse(chars));
      expect(tokens).toEqual([
        token(Token.DIGITS, '123', 0, 3),
        token(Token.ADD, '+', 3, 4),
        token(Token.DIGITS, '456', 4, 7),
        token(Token.SUB, '-', 7, 8),
        token(Token.DIGITS, '78', 8, 10),
      ]);
    });
    test("parse('123+fdahj')", () => {
      let chars = charCodes('123+fdahj');
      let tokens = tokenizer.parse(chars);
      expect(tokens.next.bind(tokens)).not.toThrow();
      expect(tokens.next.bind(tokens)).not.toThrow();
      expect(tokens.next.bind(tokens)).toThrowError(
        'Ran out of tokens before reaching end of stream'
      );
    });
  });
});
