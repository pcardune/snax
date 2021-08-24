import { BinaryOp, Expression, NumberLiteral } from '../snax-ast';
import { Add, PushConst, ValueType } from '../stack-ir';

describe('snax-ast', () => {
  describe('NumberLiterl', () => {
    const literal = new NumberLiteral(52);
    test('value should hold the value of the number', () => {
      expect(literal.value).toBe(52);
    });

    test('toStackIR() returns a PushConst instruction', () => {
      expect(literal.toStackIR()).toEqual([
        new PushConst(ValueType.i32, literal.value),
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
        new Add(ValueType.i32),
      ]);
    });
  });
});
