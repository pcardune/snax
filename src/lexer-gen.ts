import { rewindable, RewindableIterator } from './iter';
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
} from './nfa-to-dfa';
import { parseRegex } from './parser';
import { nfaForNode, reindexed, stringNFA } from './regex';

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

type Lexeme<T> = {
  token: T;
  substr: string;
};

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
  match(input: Iterator<number>): Lexeme<T> | undefined {
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

export class Tokenizer<T> {
  matcher: MultiPatternMatcher<T>;
  input: RewindableIterator<number>;
  from: number = 0;
  constructor(patterns: Pattern<T>[], input: Iterator<number>) {
    this.matcher = new MultiPatternMatcher(patterns);
    this.input = rewindable(input);
  }
  getNextToken(): { span: Span; token: T; substr: string } | undefined {
    let result = this.matcher.match(this.input);
    if (result != undefined) {
      let token = {
        span: { from: this.from, to: this.from + result.substr.length },
        token: result.token,
        substr: result.substr,
      };
      this.from += result.substr.length;
      this.input.reset(result.substr.length);
      return token;
    }
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
