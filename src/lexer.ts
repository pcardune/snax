import { peakable } from './iter';

export enum Token {
  STAR,
  OR,
  OPEN_PAREN,
  CLOSE_PAREN,
  CHAR,
}

export type Lexeme = {
  kind: Token;
  char: string;
};

export class Lexer implements Iterator<Lexeme> {
  charIter: Iterator<string>;

  constructor(input: string | Iterator<string>) {
    if (typeof input == 'string') {
      this.charIter = peakable(input[Symbol.iterator]());
    } else {
      this.charIter = peakable(input);
    }
  }

  next(): IteratorResult<Lexeme> {
    let { value: char, done } = this.charIter.next();
    if (done) {
      return { done, value: undefined };
    }

    let token: { kind: Token; char: string };

    switch (char) {
      case '\\':
        const { value: nextChar, done } = this.charIter.next();
        if (done) {
          throw new Error('End of Input');
        }
        token = { kind: Token.CHAR, char: nextChar };
        break;
      case '*':
        token = { kind: Token.STAR, char };
        break;
      case '|':
        token = { kind: Token.OR, char };
        break;
      case '(':
        token = { kind: Token.OPEN_PAREN, char };
        break;
      case ')':
        token = { kind: Token.CLOSE_PAREN, char };
        break;
      default:
        token = { kind: Token.CHAR, char };
        break;
    }
    return { done: false, value: token };
  }
}
