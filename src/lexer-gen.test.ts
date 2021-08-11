import {
  MultiPatternMatcher,
  Pattern,
  regexPattern,
  stringPattern,
  Tokenizer,
} from './lexer-gen';
import {
  DFA,
  edge,
  Edge,
  EPSILON,
  label,
  matchDFA,
  NFA,
  NFAState,
  Span,
  state,
} from './nfa-to-dfa';
import { parseRegex } from './parser';
import { concatNFA, labelNFA, nfaForNode, reindexed, starNFA } from './regex';

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
      expect(matcher.match(input)?.token).toEqual(expectedToken);
    });
  });

  describe('Tokenizer', () => {
    test('getNextToken', () => {
      let tokenizer = new Tokenizer(patterns, '123+456-78');
      let result = tokenizer.getNextToken();
      let results: typeof result[] = [];
      while (result != undefined) {
        results.push(result);
        result = tokenizer.getNextToken();
      }
      let tokens = results.map((r) => r?.token);
      expect(tokens).toEqual([
        Token.DIGITS,
        Token.ADD,
        Token.DIGITS,
        Token.SUB,
        Token.DIGITS,
      ]);
    });
  });
});
