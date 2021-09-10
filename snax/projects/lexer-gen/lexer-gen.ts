import { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import { PatternLexer } from './recognizer.js';
import { colors } from '../utils/debug.js';
import { ConstNFA } from '../nfa-to-dfa/nfa.js';

type Pos = number;
type Span = { from: Pos; to: Pos };

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
    return (
      colors.green(`<${this.token}>`) +
      this.substr +
      colors.green(`</${this.token}>`)
    );
  }
}

/**
 * @deprecated use {@link PatternLexer} directly
 */
export function buildLexer<T>(
  patterns: OrderedMap<T, ConstNFA>,
  ignoreTokens: T[] = []
) {
  return new PatternLexer(
    patterns.map((nfa, index, key) => ({
      nfa,
      ignore: ignoreTokens.indexOf(key) >= 0,
    }))
  );
}
