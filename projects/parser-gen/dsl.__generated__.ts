
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { parseRegex } from '../regex-compiler/parser';
import { charSeq } from '../nfa-to-dfa/regex-nfa';
import { ConstNFA } from '../nfa-to-dfa/nfa';

const re = (s: string) => parseRegex(s).nfa();

export enum Token {
  ID="ID",
  EQUALS="EQUALS",
  _COMMENT="_COMMENT",
  STRING="STRING",
  REGEX="REGEX",
  _WS="_WS",
  _NEWLINE="_NEWLINE",
}

const patterns: OrderedMap<Token, {nfa:ConstNFA, ignore:boolean}> = new OrderedMap([
  [Token.ID, {nfa: re("[a-zA-Z_]([a-zA-Z0-9_]*)"), ignore: false}],
  [Token.EQUALS, {nfa: charSeq("="), ignore: false}],
  [Token._COMMENT, {nfa: re("//([^\n]*)"), ignore: true}],
  [Token.STRING, {nfa: re("\"(((\\\")|[^\"\n])*)\""), ignore: false}],
  [Token.REGEX, {nfa: re("r\"(((\\\")|[^\"\n])*)\""), ignore: false}],
  [Token._WS, {nfa: re("( |\t)"), ignore: true}],
  [Token._NEWLINE, {nfa: charSeq("\n"), ignore: true}],
])

import { PatternLexer } from '../lexer-gen/recognizer';
export const lexer = new PatternLexer(patterns);
