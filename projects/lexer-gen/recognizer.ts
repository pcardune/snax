import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { charCodes, Iter, rewindable, RewindableIterator } from '../utils/iter';
import { ConstNFA } from '../nfa-to-dfa/nfa';
import { CombinedDFA } from '../nfa-to-dfa/regex-nfa';
import { LexToken } from './lexer-gen';

export class MultiPatternMatcher<T> {
  private dfa: CombinedDFA;
  private tokens: T[];
  constructor(patterns: OrderedMap<T, ConstNFA>) {
    this.dfa = CombinedDFA.fromNFAs([...patterns.values()]);
    this.tokens = [...patterns.keys()];
  }
  match(input: Iterable<number>): { token: T; substr: string } | undefined {
    let result = this.dfa.match(input);
    if (result != null) {
      let earliest = Infinity;
      for (const index of result.sourceIndeces) {
        if (index < earliest) {
          earliest = index;
        }
      }
      if (earliest != Infinity) {
        return { substr: result.substr, token: this.tokens[earliest] };
      }
    }
  }
}

export class NewTokenIterator<T> extends Iter<LexToken<T>> {
  private matcher: MultiPatternMatcher<T>;
  private chars: RewindableIterator<number>;
  private from: number = 0;
  private ignore: T[] = [];
  constructor(
    matcher: MultiPatternMatcher<T>,
    input: Iterator<number>,
    ignore: T[] = []
  ) {
    super();
    this.matcher = matcher;
    this.chars = rewindable(input);
    this.ignore = ignore;
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
          const nextSubstring = this.chars.buffer
            .map((c) => String.fromCharCode(c))
            .join('');
          throw new Error(
            `Could not match token at ${this.from} starting with "${nextSubstring}"`
          );
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
  readonly patternDescriptions: OrderedMap<T, string>;
  constructor(patterns: OrderedMap<T, { nfa: ConstNFA; ignore?: boolean }>) {
    this.matcher = new MultiPatternMatcher(patterns.map((v) => v.nfa));
    this.patternDescriptions = patterns.map((v) => v.nfa.getDescription());
    this.ignore = patterns
      .entries()
      .filter(([_i, _k, v]) => !!v.ignore)
      .map(([_i, k]) => k)
      .toArray();
  }
  parse(input: Iterator<number> | string) {
    if (typeof input === 'string') {
      input = charCodes(input);
    }
    return new NewTokenIterator(this.matcher, input, this.ignore);
  }
}
