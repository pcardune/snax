import { rewindable, RewindableIterator } from '../iter';
import {
  DFA,
  edge,
  Edge,
  EPSILON,
  matchDFA,
  NFA,
  NFAState,
  Span,
  state,
} from '../nfa-to-dfa';
import {
  nfaForNode,
  reindexed,
  stringNFA,
  parseRegex,
} from '../regex-compiler';

/**
 * Combines a list of NFAs cr
 *
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

export class MultiPatternMatcher<T> {
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
  match(input: Iterator<number>): { token: T; substr: string } | undefined {
    let result = matchDFA(this.dfa, input, true);
    if (result) {
      let earliest = Infinity;
      for (const index of result.data) {
        if (index != undefined && index < earliest) {
          earliest = index;
        }
      }
      if (earliest != Infinity) {
        return { substr: result.substr, token: this.tokens[earliest] };
      }
    }
  }
}

export type LexToken<T> = {
  token: T;
  span: Span;
  substr: string;
};

export class TokenIterator<T> implements Iterator<LexToken<T>> {
  private matcher: MultiPatternMatcher<T>;
  private chars: RewindableIterator<number>;
  private from: number = 0;
  constructor(matcher: MultiPatternMatcher<T>, input: Iterator<number>) {
    this.matcher = matcher;
    this.chars = rewindable(input);
  }

  next(): IteratorResult<LexToken<T>> {
    let result = this.matcher.match(this.chars);
    if (result != undefined) {
      let token = {
        span: { from: this.from, to: this.from + result.substr.length },
        token: result.token,
        substr: result.substr,
      };
      this.from += result.substr.length;
      this.chars.reset(result.substr.length);
      return { done: false, value: token };
    }
    this.chars.reset(0);
    if (this.chars.buffered > 0) {
      throw new Error('Ran out of tokens before reaching end of stream');
    }
    return { done: true, value: undefined };
  }
}

export class PatternLexer<T> {
  private matcher: MultiPatternMatcher<T>;
  constructor(patterns: Pattern<T>[]) {
    this.matcher = new MultiPatternMatcher(patterns);
  }
  parse(input: Iterator<number>) {
    return new TokenIterator(this.matcher, input);
  }
}

export class Pattern<T> {
  token: T;
  pattern: NFA<undefined>;
  constructor(token: T, pattern: NFA<undefined>) {
    this.token = token;
    if (typeof pattern == 'string') {
      pattern = nfaForNode(parseRegex(pattern));
    }
    this.pattern = pattern;
  }
}
export function nfaPattern<T>(token: T, pattern: NFA<undefined>): Pattern<T> {
  return new Pattern(token, pattern);
}
export function stringPattern<T>(token: T, pattern: string): Pattern<T> {
  return new Pattern(token, stringNFA(pattern));
}

export function regexPattern<T>(token: T, pattern: string): Pattern<T> {
  return new Pattern(token, nfaForNode(parseRegex(pattern)));
}
