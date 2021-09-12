import { colors } from '../utils/debug.js';

type Pos = number;
export type Span = { from: Pos; to: Pos };

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
