import { buildParser } from '../grammar/top-down-parser';
import { buildLexer } from '../lexer-gen';
import { parseRegex } from '../regex-compiler/parser';
import { OrderedMap } from '../utils/data-structures/OrderedMap';

console.log('Hello World');

enum MT {
  NUM = 'NUM',
  ID = 'ID',
  LPAREN = '(',
  RPAREN = ')',
  PLUS = '+',
  MINUS = '-',
  WS = 'WS',
}
let lexer = buildLexer(
  new OrderedMap([
    [MT.NUM, parseRegex('\\d\\d*').nfa()],
    [MT.ID, parseRegex('\\w\\w*').nfa()],
    [MT.LPAREN, parseRegex('\\(').nfa()],
    [MT.RPAREN, parseRegex('\\)').nfa()],
    [MT.PLUS, parseRegex('\\+').nfa()],
    [MT.MINUS, parseRegex('-').nfa()],
    [MT.WS, parseRegex('( |\t)+').nfa()],
  ]),
  [MT.WS]
);

let parser = buildParser({
  Root: [['Expr']],
  Expr: [['Expr', MT.PLUS, 'Term'], ['Expr', MT.MINUS, 'Term'], ['Term']],
  Term: [[MT.NUM], [MT.ID], [MT.LPAREN, 'Expr', MT.RPAREN]],
});

console.log(parser.grammar.toString());
