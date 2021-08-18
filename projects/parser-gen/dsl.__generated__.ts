
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { parseRegex } from '../regex-compiler/parser';
import { charSeq } from '../nfa-to-dfa/regex-nfa';
import { ConstNFA } from '../nfa-to-dfa/nfa';

const re = (s: string) => parseRegex(s).nfa();

export enum Token {
  ID,
  EQUALS,
  COMMENT,
  STRING,
  REGEX,
  WS,
  NEWLINE,
}

const patterns: OrderedMap<Token, ConstNFA> = new OrderedMap([
  [Token.ID, re("[a-zA-Z_]([a-zA-Z0-9_]*)")],
  [Token.EQUALS, charSeq("=")],
  [Token.COMMENT, re("//([^\n]*)")],
  [Token.STRING, re("\"(((\\\")|[^\\\"])*)\"")],
  [Token.REGEX, re("r\"(((\\\")|[^\\\"])*)\"")],
  [Token.WS, re("( |\t)")],
  [Token.NEWLINE, charSeq("\n")],
])

import { buildLexer } from '../lexer-gen';
export const lexer = buildLexer(patterns);
