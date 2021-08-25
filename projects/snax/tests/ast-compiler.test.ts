import * as AST from '../snax-ast';
import * as IR from '../stack-ir';
import { ASTCompiler } from '../ast-compiler';

describe('Expression', () => {
  test('toStackIR() combines the stack IRS of the sub expressions', () => {
    const twenty = new AST.NumberLiteral(20);
    const thirty = new AST.NumberLiteral(30);
    const expr = new AST.Expression(AST.BinaryOp.ADD, twenty, thirty);
    const compiler = ASTCompiler.forNode(expr);
    expect(compiler.compile()).toEqual([
      ...twenty.toStackIR(),
      ...thirty.toStackIR(),
      new IR.Add(IR.NumberType.i32),
    ]);
  });
});
