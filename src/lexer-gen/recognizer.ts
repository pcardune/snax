import { OrderedMap } from '../data-structures/OrderedMap';
import { rewindable, RewindableIterator } from '../iter';
import { ConstNFA } from '../nfa-to-dfa/nfa';
import { CombinedDFA } from '../nfa-to-dfa/regex-nfa';
import { LexToken } from './lexer-gen';

class MultiPatternMatcher<T> {
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

export class NewTokenIterator<T> implements IterableIterator<LexToken<T>> {
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

export class NewPatternLexer<T> {
  private matcher: MultiPatternMatcher<T>;
  private ignore: T[] = [];
  constructor(patterns: OrderedMap<T, ConstNFA>, ignore: T[] = []) {
    this.matcher = new MultiPatternMatcher(patterns);
    this.ignore = ignore;
  }
  parse(input: Iterator<number>) {
    return new NewTokenIterator(this.matcher, input, this.ignore);
  }
}
