import * as AST from '../snax-ast';
import * as IR from '../stack-ir';
import { ASTCompiler } from '../ast-compiler';

describe('ExpressionCompiler', () => {
  const { i32, f32 } = IR.NumberType;
  test('compile() combines the stack IRS of the sub expressions', () => {
    const twenty = new AST.NumberLiteral(20);
    const thirty = new AST.NumberLiteral(30);
    const expr = new AST.Expression(AST.BinaryOp.ADD, twenty, thirty);
    const compiler = ASTCompiler.forNode(expr);
    expect(compiler.compile()).toEqual([
      ...twenty.toStackIR(),
      ...thirty.toStackIR(),
      new IR.Add(i32),
    ]);
  });
  it('casts integers to floats', () => {
    const ten = new AST.NumberLiteral(10);
    const twelvePointThree = new AST.NumberLiteral(
      12.3,
      AST.NumberLiteralType.Float
    );
    const compiler = ASTCompiler.forNode(
      new AST.Expression(AST.BinaryOp.ADD, ten, twelvePointThree)
    );
    expect(compiler.compile()).toEqual([
      ...ten.toStackIR(),
      new IR.Convert(i32, f32),
      ...twelvePointThree.toStackIR(),
      new IR.Add(f32),
    ]);
  });
});

describe('BooleanLiteralCompiler', () => {
  it('compiles booleans to i32 consts', () => {
    expect(ASTCompiler.forNode(new AST.BooleanLiteral(true)).compile()).toEqual(
      [new IR.PushConst(IR.NumberType.i32, 1)]
    );
    expect(
      ASTCompiler.forNode(new AST.BooleanLiteral(false)).compile()
    ).toEqual([new IR.PushConst(IR.NumberType.i32, 0)]);
  });
});
