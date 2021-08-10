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

/**
 * Assumptions: each of the nfas
 * has one start node (the first one)
 * and one accepting node (the last one)
 *
 * See page 169 of the dragon book.
 */
function combineNFAs<Key>(nfas: [Key, NFA<undefined>][]): NFA<Key | undefined> {
  let startId = 1;
  let startEdges: Edge<number>[] = [];
  let states: NFAState<Key | undefined>[] = [];
  nfas.forEach(([i, nfa]) => {
    states = [...states, ...reindexed(nfa, startId)];
    states[states.length - 1].data = i;
    startEdges.push(edge(EPSILON, startId));
    startId += nfa.states.length;
  });
  for (let i = 0; i < nfas.length; i++) {}
  states = [state(0, false, startEdges, undefined), ...states];
  return new NFA(states);
}

class MultiPatternMatcher<T> {
  private dfa: DFA<(number | undefined)[]>;
  private tokens: T[];
  constructor(patterns: Pattern<T>[]) {
    let tokens: T[] = [];
    let nfa = combineNFAs(
      patterns.map((pattern, index): [number, NFA<undefined>] => {
        tokens.push(pattern.token);
        return [index, pattern.pattern];
      })
    );
    this.tokens = tokens;
    this.dfa = DFA.fromNFA(nfa);
  }
  match(input: string): { span: Span; token: T } | undefined {
    let result = matchDFA(this.dfa, input, true);
    if (result != undefined) {
      let earliest = Infinity;
      for (const index of result.data) {
        if (index != undefined && index < earliest) {
          earliest = index;
        }
      }
      if (earliest != Infinity) {
        return { span: result.span, token: this.tokens[earliest] };
      }
    }
  }
}

class Tokenizer<T> {
  matcher: MultiPatternMatcher<T>;
  input: string;
  index: number = 0;
  constructor(patterns: Pattern<T>[], input: string) {
    this.matcher = new MultiPatternMatcher(patterns);
    this.input = input;
  }
  getNextToken(): { span: Span; token: T } | undefined {
    let result = this.matcher.match(this.input.slice(this.index));
    if (result != undefined) {
      let length = result.span.to - result.span.from;
      result.span.from += this.index;
      result.span.to += this.index;
      this.index += length;
    }
    return result;
  }
}

class Pattern<T> {
  token: T;
  pattern: NFA<undefined>;
  constructor(token: T, pattern: NFA<undefined> | string) {
    this.token = token;
    if (typeof pattern == 'string') {
      pattern = nfaForNode(parseRegex(pattern));
    }
    this.pattern = pattern;
  }
}

describe('lexer', () => {
  test('patterns', () => {
    const patterns: [string, NFA<undefined>][] = [
      // a
      ['a', labelNFA('a')],
      // abb
      [
        'abb',
        concatNFA(concatNFA(labelNFA('a'), labelNFA('b')), labelNFA('b')),
      ],
      // a*bb*
      [
        'a*bb',
        concatNFA(
          concatNFA(starNFA(labelNFA('a')), labelNFA('b')),
          starNFA(labelNFA('b'))
        ),
      ],
    ];
    const combined = combineNFAs(patterns);
    const dfa = DFA.fromNFA(combined);
    let result = matchDFA(dfa, 'abb', true);
  });

  enum Token {
    ADD = 'ADD',
    SUB = 'SUB',
    DIGIT = 'DIGIT',
    DIGITS = 'DIGITS',
  }
  const patterns = [
    new Pattern(Token.ADD, '+'),
    new Pattern(Token.SUB, '-'),
    new Pattern(Token.DIGIT, '0|1|2|3|4|5|6|7|8|9'),
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
