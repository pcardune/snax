import { BinaryOp, Expression, NumberLiteral } from '../snax-ast';
import * as AST from '../snax-ast';
import { Add, PushConst, NumberType } from '../stack-ir';

describe('snax-ast', () => {
  describe('NumberLiterl', () => {
    const literal = new NumberLiteral(52);
    test('value should hold the value of the number', () => {
      expect(literal.value).toBe(52);
    });

    test('toStackIR() returns a PushConst instruction', () => {
      expect(literal.toStackIR()).toEqual([
        new PushConst(NumberType.i32, literal.value),
      ]);
    });
  });

  describe('Expression', () => {
    test('toStackIR() combines the stack IRS of the sub expressions', () => {
      const twenty = new NumberLiteral(20);
      const thirty = new NumberLiteral(30);
      const expr = new Expression(BinaryOp.ADD, twenty, thirty);
      expect(expr.toStackIR()).toEqual([
        ...twenty.toStackIR(),
        ...thirty.toStackIR(),
        new Add(NumberType.i32),
      ]);
    });
  });

  describe('LetStatement', () => {
    it('should check types', () => {
      const letStatement = new AST.LetStatement(
        'x',
        new AST.TypeExpr(new AST.TypeRef('i32')),
        new AST.NumberLiteral(3.2, AST.NumberLiteralType.Float)
      );
      expect(() =>
        letStatement.resolveType()
      ).toThrowErrorMatchingInlineSnapshot(
        `"type float32 can't be assigned to an int32"`
      );
    });
  });
});
