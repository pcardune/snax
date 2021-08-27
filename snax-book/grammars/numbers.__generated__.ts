
import { OrderedMap } from '../../utils/data-structures/OrderedMap';
import { RegexParser } from '../../regex-compiler/parser';
import { charSeq } from '../../nfa-to-dfa/regex-nfa';
import { ConstNFA } from '../../nfa-to-dfa/nfa';

const re = (s: string) => RegexParser.parseOrThrow(s).nfa();

export enum Token {
  ZERO="ZERO",
  ONE="ONE",
}

const patterns: OrderedMap<Token, {nfa:ConstNFA, ignore:boolean}> = new OrderedMap([
  [Token.ZERO, {nfa: charSeq("0"), ignore: false}],
  [Token.ONE, {nfa: charSeq("1"), ignore: false}],
])

import { PatternLexer } from '../../lexer-gen/recognizer';
export const lexer = new PatternLexer(patterns);


import { buildParser, ParseNode } from '../../grammar/top-down-parser';

export enum Rules {
  Root = "Root",
  Digits = "Digits",
}

export const parser = buildParser({
  [Rules.Root]:[
    [Token.ZERO, ],
    [Token.ONE, Rules.Digits, ],
  ],
  [Rules.Digits]:[
    [Token.ZERO, Rules.Digits, ],
    [Token.ONE, Rules.Digits, ],
    [],
  ],
});