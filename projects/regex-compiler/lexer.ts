import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { charCodes, peakable } from '../utils/iter';
import { buildLexer, LexToken } from '../lexer-gen/lexer-gen';
import { PatternLexer, NewTokenIterator } from '../lexer-gen/recognizer';
import { ConstNFA } from '../nfa-to-dfa/nfa';
import { asciiChars, notChars, SingleCharNFA } from '../nfa-to-dfa/regex-nfa';
import { memoize } from '../utils/utils';

export enum Token {
  PLUS,
  STAR,
  OR,
  OPEN_PAREN,
  CLOSE_PAREN,
  OPEN_BRACKET,
  CLOSE_BRACKET,
  ESCAPE,
  CHAR,
  ANY_CHAR,
}

export type Lexeme = LexToken<Token>;

const getNewLexer = memoize(() => {
  const patterns: OrderedMap<Token, ConstNFA> = new OrderedMap([
    [Token.ESCAPE, new SingleCharNFA('\\').concat(notChars('\n\r'))],
    [Token.ANY_CHAR, new SingleCharNFA('.')],
    [Token.PLUS, new SingleCharNFA('+')],
    [Token.STAR, new SingleCharNFA('*')],
    [Token.OR, new SingleCharNFA('|')],
    [Token.OPEN_PAREN, new SingleCharNFA('(')],
    [Token.CLOSE_PAREN, new SingleCharNFA(')')],
    [Token.OPEN_BRACKET, new SingleCharNFA('[')],
    [Token.CLOSE_BRACKET, new SingleCharNFA(']')],
    [Token.CHAR, asciiChars()],
  ]);
  return buildLexer(patterns);
});

export class Lexer implements Iterator<Lexeme, Lexeme> {
  private charIter: Iterator<number, number>;
  private tokenIter?: NewTokenIterator<Token>;

  constructor(input: string | Iterator<number>) {
    if (typeof input == 'string') {
      this.charIter = peakable(charCodes(input));
    } else {
      this.charIter = peakable(input);
    }
  }

  private get tokens() {
    if (!this.tokenIter) {
      this.tokenIter = getNewLexer().parse(this.charIter);
    }
    return this.tokenIter;
  }

  next(): IteratorResult<Lexeme, Lexeme> {
    return this.tokens.next();
  }
}
