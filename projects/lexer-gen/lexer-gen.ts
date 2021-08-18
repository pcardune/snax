import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { PatternLexer } from './recognizer';
import { colors } from '../utils/debug';
import { ConstNFA } from '../nfa-to-dfa/nfa';

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
