import { OrderedMap } from '../../utils/data-structures/OrderedMap.js';
import { charSeq } from '../../nfa-to-dfa/regex-nfa.js';
import { ConstNFA } from '../../nfa-to-dfa/nfa.js';

export enum Token {
  IMPLICIT_0 = '0',
  IMPLICIT_1 = '1',
}

const patterns: OrderedMap<Token, { nfa: ConstNFA; ignore: boolean }> =
  new OrderedMap([
    [Token.IMPLICIT_0, { nfa: charSeq('0'), ignore: false }],
    [Token.IMPLICIT_1, { nfa: charSeq('1'), ignore: false }],
  ]);

import { PatternLexer } from '../../lexer-gen/recognizer.js';
export const lexer = new PatternLexer(patterns);

import { buildParser } from '../../grammar/top-down-parser.js';
import { GrammarSpec, Production } from '../../grammar/grammar.js';
export enum Rules {
  Root = 'Root',
  List = 'List',
  Bit = 'Bit',
}

const foo = {
  [Rules.Root]: [{ symbols: [Rules.List] }],
  [Rules.List]: [[Rules.Bit, Rules.List], [Rules.Bit], []],
  [Rules.Bit]: [[Token.IMPLICIT_0], [Token.IMPLICIT_1]],
};

const grammarSpec: GrammarSpec = {
  [Rules.Root]: [[Rules.List]],
  [Rules.List]: [[Rules.Bit, Rules.List], [Rules.Bit], []],
  [Rules.Bit]: [[Token.IMPLICIT_0], [Token.IMPLICIT_1]],
};
export const parser = buildParser(grammarSpec);
