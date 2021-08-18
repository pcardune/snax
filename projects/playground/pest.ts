import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { buildParser } from '../grammar/top-down-parser';
import { charCodes } from '../utils/iter';
import { buildLexer } from '../lexer-gen';
import { parseRegex } from '../regex-compiler/parser';
import { notChars, SingleCharNFA } from '../nfa-to-dfa/regex-nfa';

const re = (s: string) => parseRegex(s).nfa();
const char = (s: string) => new SingleCharNFA(s);

export const lexer = buildLexer(
  new OrderedMap([
    ['ID', re('[a-zA-Z_]([a-zA-Z0-9_]*)')],
    ['=', char('=')],
    ['(', char('(')],
    [')', char(')')],
    ['{', char('{')],
    ['}', char('}')],
    ['~', char('~')],
    ['|', char('|')],
    ['*', char('*')],
    ['+', char('+')],
    ['?', char('?')],
    ['COMMENT', char('/').concat(char('/')).concat(notChars('\n').star())],
    ['STRING', char('"').concat(notChars('"').star()).concat(char('"'))],
    ['WS', re('( |\t)')],
    ['NEWLINE', char('\n')],
  ]),
  ['WS', 'NEWLINE', 'COMMENT']
);

// prettier-ignore
export const parser = buildParser({
  Root: [['Rules']],
  Rules: [
    ['Rule', 'Rules'],
    ['Rule'],
    []
  ],
  Rule: [
    ['ID', '=', '{', 'Expr', '}']
  ],
  Expr: [
    ['Unary', '|', 'Expr'],
    ['Unary', '~', 'Expr'],
    ['Unary']
  ],
  Unary: [
    ['Term', '+'],
    ['Term', '*'],
    ['Term', '?'],
    ['Term']
  ],
  Term: [
    ['(', 'Expr', ')'],
    ['STRING'],
    ['ID']
  ],
});

export class PestParser {
  static parseStr(input: string) {
    return parser.parseTokensOrThrow(lexer.parse(charCodes(input)));
  }
}
