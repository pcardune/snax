import { ActionFunction, Grammar } from '../grammar/grammar';
import { parseFlow } from '../grammar/top-down-parser';
import { PatternLexer } from '../lexer-gen/recognizer';
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import {
  ASTNode,
  BinaryOp,
  Block,
  Expression,
  LetStatement,
  NumberLiteral,
  SymbolRef,
} from './snax-ast';
import * as AST from './snax-ast';
import { parseRegex } from '../regex-compiler';
import { err, ok, Result } from 'neverthrow';
import { charSeq } from '../nfa-to-dfa/regex-nfa';
import { ConstNFA } from '../nfa-to-dfa/nfa';
import { LexToken } from '../lexer-gen/lexer-gen';

enum T {
  NUMBER = 'T_NUMBER',
  FLOAT_NUMBER = 'T_FLOAT_NUMBER',
  PLUS = '+',
  MINUS = '-',
  TIMES = '*',
  DIVIDE = '/',
  OPEN_PAREN = '(',
  CLOSE_PAREN = ')',
  WHITESPACE = 'T_WHITESPACE',
  ID = 'T_ID',
  LET = 'let',
  EQUALS = '=',
  SEMI = ';',
  COLON = ':',
}
export { T as Token };

let lexer: PatternLexer<T>;
{
  type Entry = [T, { nfa: ConstNFA; ignore: boolean }];
  function p(token: T, chars: string, ignore: boolean = false) {
    return [token, { nfa: charSeq(chars), ignore }] as Entry;
  }
  function re(token: T, regex: string, ignore: boolean = false) {
    return [token, { nfa: parseRegex(regex).nfa(), ignore }] as Entry;
  }
  lexer = new PatternLexer(
    new OrderedMap([
      re(T.FLOAT_NUMBER, '[0-9]+\\.[0-9]+'),
      re(T.NUMBER, '[0-9]+'),
      p(T.OPEN_PAREN, '('),
      p(T.CLOSE_PAREN, ')'),
      p(T.PLUS, '+'),
      p(T.MINUS, '-'),
      p(T.TIMES, '*'),
      p(T.DIVIDE, '/'),
      p(T.LET, 'let'),
      p(T.EQUALS, '='),
      p(T.SEMI, ';'),
      p(T.COLON, ':'),
      re(T.ID, '[_a-zA-Z][_a-zA-Z0-9]*'),
      re(T.WHITESPACE, '[ \t\n]+', true),
    ])
  );
}
export { lexer };

enum R {
  Root = 'R_Root',
  NumberLiteral = 'R_NumberLiteral',
  Expr = 'R_Expr',
  Term = 'R_Term',
  Factor = 'R_Factor',
  BinaryOp = 'R_BinaryOp',
  LetStatement = 'R_LetStatement',
  ExprStatement = 'R_ExprStatement',
  Statement = 'R_Statement',
  StatementList = 'R_StatementList',
}
export { R as Rule };
export type Symbol = T | R;

export const grammar: Grammar<Symbol, ASTNode> = new Grammar();
// Root
grammar.createProduction(R.Root, [R.StatementList], ([child]) => child);

// StatementList
grammar.createProduction(
  R.StatementList,
  [R.Statement, R.StatementList],
  ([statement, rest]) => new Block([statement, ...(rest as Block).statements])
);
grammar.createProduction(R.StatementList, [], () => new Block([]));

// Statement
grammar.createProduction(R.Statement, [R.LetStatement], ([child]) => child);
grammar.createProduction(R.Statement, [R.ExprStatement], ([child]) => child);

// LetStatement
grammar.createProduction(
  R.LetStatement,
  [T.LET, T.ID, T.COLON, T.ID, T.EQUALS, R.Expr, T.SEMI],
  ([_0, _1, _2, _3, _4, expr], [_let, id, _colon, typeId]) => {
    return new LetStatement(id.substr, new AST.TypeRef(typeId.substr), expr);
  }
);
grammar.createProduction(
  R.LetStatement,
  [T.LET, T.ID, T.EQUALS, R.Expr, T.SEMI],
  ([_0, _1, _2, expr], [_let, id]) => {
    return new LetStatement(id.substr, null, expr);
  }
);

// ExprStatement
grammar.createProduction(R.ExprStatement, [R.Expr, T.SEMI], ([expr]) => {
  return new AST.ExprStatement(expr as Expression);
});

// Expr
const opForToken = (token: LexToken<unknown>) => {
  switch (token.token as T) {
    case T.PLUS:
      return BinaryOp.ADD;
    case T.MINUS:
      return BinaryOp.SUB;
    case T.TIMES:
      return BinaryOp.MUL;
    case T.DIVIDE:
      return BinaryOp.DIV;
  }
  throw new Error('unrecognized operator token: ' + token.toString());
};
const makeExpr: ActionFunction<ASTNode> = ([factor, op, expr], [_, op_token]) =>
  new Expression(opForToken(op_token), factor, expr);
grammar.createProduction(R.Expr, [R.Term, T.PLUS, R.Expr], makeExpr);
grammar.createProduction(R.Expr, [R.Term, T.MINUS, R.Expr], makeExpr);
grammar.createProduction(R.Expr, [R.Term], ([term]) => term);

// Term
grammar.createProduction(R.Term, [R.Factor, T.TIMES, R.Term], makeExpr);
grammar.createProduction(R.Term, [R.Factor, T.DIVIDE, R.Term], makeExpr);
grammar.createProduction(R.Term, [R.Factor], ([factor]) => factor);

// Factor
grammar.createProduction(
  R.Factor,
  [T.OPEN_PAREN, R.Expr, T.CLOSE_PAREN],
  ([_, expr]) => expr
);
grammar.createProduction(R.Factor, [R.NumberLiteral], ([literal]) => literal);
grammar.createProduction(
  R.Factor,
  [T.ID],
  (_, [id]) => new SymbolRef(id.substr)
);

// Number Literal
grammar.createProduction(R.NumberLiteral, [T.NUMBER], (_, [token]) => {
  const value = parseInt((token as LexToken<unknown>).substr);
  return new NumberLiteral(value, AST.NumberLiteralType.Integer);
});
grammar.createProduction(R.NumberLiteral, [T.FLOAT_NUMBER], (_, [token]) => {
  const value = parseFloat((token as LexToken<unknown>).substr);
  return new NumberLiteral(value, AST.NumberLiteralType.Float);
});
import { IFileRange, parse, SyntaxError } from './peggy/snax';

function peg$padEnd(str: string, targetLength: number, padString: string) {
  padString = padString || ' ';
  if (str.length > targetLength) {
    return str;
  }
  targetLength -= str.length;
  padString += padString.repeat(targetLength);
  return str + padString.slice(0, targetLength);
}

class EnhancedSyntaxError {
  public name = 'EnhancedSyntaxError';
  private error: SyntaxError;
  constructor(error: SyntaxError) {
    this.error = error;
  }

  get message() {
    return this.error.message;
  }
  get location(): IFileRange & { source?: string } {
    return { source: '', ...this.error.location };
  }
  get expected() {
    return this.error.expected;
  }
  get found() {
    return this.error.found;
  }

  format(sources: { source: string; text: string }[]): string {
    var str = 'Error: ' + this.message;
    if (this.location) {
      var src = null;
      var k;
      for (k = 0; k < sources.length; k++) {
        if (sources[k].source === this.location.source) {
          src = sources[k].text.split(/\r\n|\n|\r/g);
          break;
        }
      }
      var s = this.location.start;
      var loc = this.location.source + ':' + s.line + ':' + s.column;
      if (src) {
        var e = this.location.end;
        var filler = peg$padEnd('', s.line.toString().length, ' ');
        var line = src[s.line - 1];
        var last = s.line === e.line ? e.column : line.length + 1;
        str +=
          '\n --> ' +
          loc +
          '\n' +
          filler +
          ' |\n' +
          s.line +
          ' | ' +
          line +
          '\n' +
          filler +
          ' | ' +
          peg$padEnd('', s.column - 1, ' ') +
          peg$padEnd('', last - s.column, '^');
      } else {
        str += '\n at ' + loc;
      }
    }
    return str;
  }
}

export class SNAXParser {
  static parseStr(
    input: string,
    start: string = 'start'
  ): Result<ASTNode, any> {
    try {
      return ok(SNAXParser.parseStrOrThrow(input, start) as ASTNode);
    } catch (e) {
      return err(e);
    }
  }

  static parseStrOrThrow(input: string, start: string = 'start'): ASTNode {
    try {
      return parse(input, {
        startRule: start,
        grammarSource: input,
      }) as ASTNode;
    } catch (e) {
      if (e instanceof SyntaxError) {
        const newError = new EnhancedSyntaxError(e);
        console.error(newError.format([{ source: '', text: input }]));
        throw newError;
      }
      throw e;
    }
  }
}
