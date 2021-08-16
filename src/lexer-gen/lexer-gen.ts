import { OrderedMap } from '../data-structures/OrderedMap';
import { parseRegex } from '../regex-compiler';
import { PatternLexer } from './recognizer';

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
    return `<${this.token}>${this.substr}</${this.token}>`;
  }
}

export function buildLexer<T>(
  patternSpecs: OrderedMap<T, string>,
  ignore: T[] = []
) {
  let patterns = patternSpecs.map((pattern) => parseRegex(pattern).nfa());
  return new PatternLexer(patterns, ignore);
}
