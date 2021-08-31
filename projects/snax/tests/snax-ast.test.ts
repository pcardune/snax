import { NumberLiteral } from '../snax-ast';
import * as AST from '../snax-ast';
import { PushConst, NumberType } from '../stack-ir';
import { ASTCompiler } from '../ast-compiler';

describe('snax-ast', () => {
  describe('NumberLiterl', () => {
    const literal = new NumberLiteral(52);
    test('value should hold the value of the number', () => {
      expect(literal.value).toBe(52);
    });

    test('toStackIR() returns a PushConst instruction', () => {
      expect(ASTCompiler.forNode(literal).compile()).toEqual([
        new PushConst(NumberType.i32, literal.value),
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
