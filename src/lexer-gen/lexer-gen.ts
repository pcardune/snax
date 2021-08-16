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

export class LexToken<T> {
  token: T;
  span: Span;
  substr: string;
  constructor(token: T, span: Span, substr: string) {
    this.token = token;
    this.span = span;
    this.substr = substr;
  }
  toString() {
    return `<${this.token}>${this.substr}</${this.token}>`;
  }
}

export class TokenIterator<T> implements IterableIterator<LexToken<T>> {
  private matcher: MultiPatternMatcher<T>;
  private chars: RewindableIterator<number>;
  private from: number = 0;
  private ignore: T[] = [];
  constructor(
    matcher: MultiPatternMatcher<T>,
    input: Iterator<number>,
    ignore: T[] = []
  ) {
    this.matcher = matcher;
    this.chars = rewindable(input);
    this.ignore = ignore;
  }

  [Symbol.iterator]() {
    return this;
  }

  next(): IteratorResult<LexToken<T>> {
    let tokenResult: IteratorResult<LexToken<T>> | null = null;
    while (!tokenResult) {
      let match = this.matcher.match(this.chars);
      if (match != undefined) {
        let token = new LexToken(
          match.token,
          { from: this.from, to: this.from + match.substr.length },
          match.substr
        );
        this.from += match.substr.length;
        this.chars.reset(match.substr.length);
        if (this.ignore.indexOf(match.token) == -1) {
          tokenResult = { done: false, value: token };
        } else {
          continue;
        }
      } else {
        this.chars.reset(0);
        if (this.chars.buffered > 0) {
          throw new Error('Ran out of tokens before reaching end of stream');
        }
        tokenResult = { done: true, value: undefined };
      }
    }
    return tokenResult;
  }
}

export class PatternLexer<T> {
  private matcher: MultiPatternMatcher<T>;
  private ignore: T[] = [];
  constructor(patterns: Pattern<T>[], ignore: T[] = []) {
    this.matcher = new MultiPatternMatcher(patterns);
    this.ignore = ignore;
  }
  parse(input: Iterator<number>) {
    return new TokenIterator(this.matcher, input, this.ignore);
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
export function stringPattern<T>(token: T, pattern: string): Pattern<T> {
  return new Pattern(token, stringNFA(pattern));
}

export function regexPattern<T>(token: T, pattern: string): Pattern<T> {
  return new Pattern(token, nfaForNode(parseRegex(pattern)));
}

export function buildLexer<T>(patternSpecs: [T, string][], ignore: T[] = []) {
  return new PatternLexer(
    patternSpecs.map(([token, pattern]) => regexPattern(token, pattern)),
    ignore
  );
}
