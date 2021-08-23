import { ActionFunction, Grammar } from '../grammar/grammar';
import { parseFlow } from '../grammar/top-down-parser';
import { PatternLexer } from '../lexer-gen/recognizer';
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { ASTNode, BinaryOp, Expression, NumberLiteral } from './snax-ast';
import { parseRegex } from '../regex-compiler';
import { err, ok, Result } from 'neverthrow';
import { charSeq } from '../nfa-to-dfa/regex-nfa';
import { ConstNFA } from '../nfa-to-dfa/nfa';
import { LexToken } from '../lexer-gen/lexer-gen';

enum T {
  NUMBER = 'T_NUMBER',
  PLUS = '+',
  MINUS = '-',
  TIMES = '*',
  DIVIDE = '/',
  OPEN_PAREN = '(',
  CLOSE_PAREN = ')',
}
export { T as Token };

let lexer: PatternLexer<T>;
{
  function p(token: T, chars: string) {
    return [token, { nfa: charSeq(chars) }] as [T, { nfa: ConstNFA }];
  }
  function re(token: T, regex: string) {
    return [token, { nfa: parseRegex(regex).nfa() }] as [T, { nfa: ConstNFA }];
  }
  lexer = new PatternLexer(
    new OrderedMap([
      re(T.NUMBER, '[0-9]+'),
      p(T.OPEN_PAREN, '('),
      p(T.CLOSE_PAREN, ')'),
      p(T.PLUS, '+'),
      p(T.MINUS, '-'),
      p(T.TIMES, '*'),
      p(T.DIVIDE, '/'),
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
}
export { R as Rule };
export type Symbol = T | R;

export const grammar: Grammar<Symbol, ASTNode> = new Grammar();
// Root
grammar.createProduction(R.Root, [R.Expr], ([child]) => child);

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

// Number Literal
grammar.createProduction(R.NumberLiteral, [T.NUMBER], (_, [token]) => {
  const value = parseInt((token as LexToken<unknown>).substr);
  return new NumberLiteral(value);
});

export class SNAXParser {
  static parseStr(input: string): Result<ASTNode, any> {
    const tokens = lexer.parse(input);
    const result = parseFlow(grammar, R.Root, tokens);
    if (result.isOk()) {
      if (!result.value) {
        return err('Nothing to parse');
      }
      return ok(result.value);
    }
    return err(result.error);
  }

  static parseStrOrThrow(input: string): ASTNode {
    const result = SNAXParser.parseStr(input);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }
}
