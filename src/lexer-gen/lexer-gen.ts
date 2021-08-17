import { OrderedMap } from '../data-structures/OrderedMap';
import { parseRegex } from '../regex-compiler';
import { PatternLexer } from './recognizer';
import { colors } from '../debug';

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

export function buildLexer<T>(
  patternSpecs: OrderedMap<T, string>,
  ignore: T[] = []
) {
  let patterns = patternSpecs.map((pattern) => parseRegex(pattern).nfa());
  return new PatternLexer(patterns, ignore);
}
