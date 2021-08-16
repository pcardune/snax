import { OrderedMap } from '../data-structures/OrderedMap';
import { Span } from '../nfa-to-dfa';
import { ConstNFA } from '../nfa-to-dfa/nfa';
import { parseRegex } from '../regex-compiler';
import { NewPatternLexer } from './recognizer';

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

export function buildLexer<T>(
  patternSpecs: OrderedMap<T, string>,
  ignore: T[] = []
) {
  let patterns = patternSpecs.map((pattern) => parseRegex(pattern).nfa());
  return new NewPatternLexer(patterns, ignore);
}
