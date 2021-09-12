import { charCodes, collect } from '../utils/iter.js';
import { buildLexer } from './lexer-gen.js';
import type { LexToken } from './LexToken';
import { MultiPatternMatcher, PatternLexer } from './recognizer.js';
import { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import { charRange, chars, SingleCharNFA } from '../nfa-to-dfa/regex-nfa.js';

export function token<T>(
  token: T,
  substr: string,
  from: number,
  to: number
): LexToken<T> {
  return { token, substr, span: { from, to } };
}

describe('lexer-gen', () => {
  enum Token {
    ADD = 'ADD',
    SUB = 'SUB',
    DIGIT = 'DIGIT',
    DIGITS = 'DIGITS',
  }
  const patterns = new OrderedMap([
    [Token.ADD, new SingleCharNFA('+')],
    [Token.SUB, new SingleCharNFA('-')],
    [Token.DIGIT, chars('0123456789')],
    [Token.DIGITS, chars('0123456789').concat(chars('0123456789').star())],
  ]);

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
    let tokenizer = buildLexer(patterns);
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
      expect(tokens.next.bind(tokens)).toThrow();
    });
  });
});

describe('buildLexer', () => {
  enum MT {
    NUM = 'NUM',
    ID = 'ID',
    LPAREN = '(',
    RPAREN = ')',
    PLUS = '+',
    MINUS = '-',
    WS = 'WS',
  }
  const char = (char: string) => new SingleCharNFA(char);
  let digit = charRange('0', '9');
  let word = charRange('a', 'z').or(charRange('A', 'Z').or(digit));

  let patterns = new OrderedMap([
    [MT.NUM, digit.clone().concat(digit.clone().star())],
    [MT.ID, word.clone().concat(word.clone().star())],
    [MT.LPAREN, char('(')],
    [MT.RPAREN, char(')')],
    [MT.PLUS, char('+')],
    [MT.MINUS, char('-')],
    [MT.WS, chars(' \t').concat(chars(' \t').star())],
  ]);
  let lexer: PatternLexer<MT>;
  beforeAll(() => {
    lexer = buildLexer(patterns, [MT.WS]);
  });
  test('should lex the right tokens', () => {
    let chars = charCodes('34+5-(4 - something)');
    let tokens = [...lexer.parse(chars)];
    expect(tokens.map((t) => t.toString()).join('\n')).toMatchInlineSnapshot(`
      "<NUM>34</NUM>
      <+>+</+>
      <NUM>5</NUM>
      <->-</->
      <(>(</(>
      <NUM>4</NUM>
      <->-</->
      <ID>something</ID>
      <)>)</)>"
    `);
  });
});
