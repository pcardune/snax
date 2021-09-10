import { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import { RegexParser } from '../regex-compiler/parser.js';
import { charSeq } from '../nfa-to-dfa/regex-nfa.js';
import { ConstNFA } from '../nfa-to-dfa/nfa.js';

const re = (s: string) => RegexParser.parseOrThrow(s).nfa();

export enum Token {
  ID = 'ID',
  EQUALS = 'EQUALS',
  _COMMENT = '_COMMENT',
  STRING = 'STRING',
  REGEX = 'REGEX',
  _WS = '_WS',
  _NEWLINE = '_NEWLINE',
  OPEN_BRACKET = 'OPEN_BRACKET',
  CLOSE_BRACKET = 'CLOSE_BRACKET',
  OR = 'OR',
}

const patterns: OrderedMap<Token, { nfa: ConstNFA; ignore: boolean }> =
  new OrderedMap([
    [Token.ID, { nfa: re('[a-zA-Z_]([a-zA-Z0-9_]*)'), ignore: false }],
    [Token.EQUALS, { nfa: charSeq('='), ignore: false }],
    [Token._COMMENT, { nfa: re('//([^\n]*)'), ignore: true }],
    [Token.STRING, { nfa: re('"(((\\")|[^"\n])*)"'), ignore: false }],
    [Token.REGEX, { nfa: re('r"(((\\")|[^"\n])*)"'), ignore: false }],
    [Token._WS, { nfa: re('( |\t)'), ignore: true }],
    [Token._NEWLINE, { nfa: charSeq('\n'), ignore: true }],
    [Token.OPEN_BRACKET, { nfa: charSeq('['), ignore: false }],
    [Token.CLOSE_BRACKET, { nfa: charSeq(']'), ignore: false }],
    [Token.OR, { nfa: charSeq('|'), ignore: false }],
  ]);

import { PatternLexer } from '../lexer-gen/recognizer.js';
export const lexer = new PatternLexer(patterns);

import { buildParser, ParseNode } from '../grammar/top-down-parser.js';

export enum Rules {
  Root = 'Root',
  StatementList = 'StatementList',
  Statement = 'Statement',
  ProductionList = 'ProductionList',
  Production = 'Production',
  Sequence = 'Sequence',
  ElementList = 'ElementList',
  Element = 'Element',
  Literal = 'Literal',
}

export const parser = buildParser({
  [Rules.Root]: [[Rules.StatementList, Rules.ProductionList]],
  [Rules.StatementList]: [
    [Rules.Statement, Rules.StatementList],
    [Rules.Statement],
    [],
  ],
  [Rules.Statement]: [[Token.ID, Token.EQUALS, Rules.Literal]],
  [Rules.ProductionList]: [
    [Rules.Production, Rules.ProductionList],
    [Rules.Production],
    [],
  ],
  [Rules.Production]: [
    [Token.ID, Token.EQUALS, Rules.Sequence],
    [Token.ID, Token.EQUALS, Token.OR, Rules.Sequence],
  ],
  [Rules.Sequence]: [
    [
      Token.OPEN_BRACKET,
      Rules.ElementList,
      Token.CLOSE_BRACKET,
      Token.OR,
      Rules.Sequence,
    ],
    [Token.OPEN_BRACKET, Rules.ElementList, Token.CLOSE_BRACKET],
    [Token.OPEN_BRACKET, Token.CLOSE_BRACKET],
  ],
  [Rules.ElementList]: [
    [Rules.Element, Rules.ElementList],
    [Rules.Element],
    [],
  ],
  [Rules.Element]: [[Token.ID], [Rules.Literal]],
  [Rules.Literal]: [[Token.REGEX], [Token.STRING]],
});
