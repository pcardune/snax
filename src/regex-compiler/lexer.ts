import { charCodes, peakable } from '../iter';
import {
  nfaPattern,
  stringPattern,
  TokenIterator,
  PatternLexer,
} from '../lexer-gen';
import { anyCharNFA, concatNFA, labelNFA } from './regex-compiler';

export enum Token {
  PLUS,
  STAR,
  OR,
  OPEN_PAREN,
  CLOSE_PAREN,
  ESCAPE,
  CHAR,
  ANY_CHAR,
}

export type Lexeme = {
  kind: Token;
  char: string;
};

function makeLexer() {
  const patterns = [
    nfaPattern(Token.ESCAPE, concatNFA(labelNFA('\\'), anyCharNFA())),
    stringPattern(Token.ANY_CHAR, '.'),
    stringPattern(Token.PLUS, '+'),
    stringPattern(Token.STAR, '*'),
    stringPattern(Token.OR, '|'),
    stringPattern(Token.OPEN_PAREN, '('),
    stringPattern(Token.CLOSE_PAREN, ')'),
    nfaPattern(Token.CHAR, anyCharNFA()),
  ];
  return new PatternLexer(patterns);
}

export class Lexer implements Iterator<Lexeme> {
  private charIter: Iterator<number, number>;
  private static tokenizer?: PatternLexer<Token>;
  private tokenIter?: TokenIterator<Token>;

  constructor(input: string | Iterator<number>) {
    if (typeof input == 'string') {
      this.charIter = peakable(charCodes(input));
    } else {
      this.charIter = peakable(input);
    }
  }

  private get tokens() {
    if (!Lexer.tokenizer) {
      Lexer.tokenizer = makeLexer();
    }
    if (!this.tokenIter) {
      this.tokenIter = Lexer.tokenizer.parse(this.charIter);
    }
    return this.tokenIter;
  }

  next(): IteratorResult<Lexeme> {
    const nextToken = this.tokens.next();
    if (nextToken.done) {
      return { done: true, value: undefined };
    }
    return {
      done: false,
      value: { kind: nextToken.value.token, char: nextToken.value.substr },
    };
  }
}
