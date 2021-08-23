import { LexToken } from '../../lexer-gen/lexer-gen';
import { BinaryOp, Expression, NumberLiteral } from '../snax-ast';
import { grammar, lexer, SNAXParser, Token } from '../snax-parser';

describe('SNAX lexer', () => {
  it('should lex numbers into NUMBER tokens', () => {
    expect(lexer.parse('123').toArray()).toEqual([
      new LexToken(Token.NUMBER, { from: 0, to: 3 }, '123'),
    ]);
  });
});

describe('SNAX grammar', () => {
  it('should look like', () => {
    expect(grammar.toString()).toMatchInlineSnapshot(`
"
R_Root →
  | R_Expr
R_Expr →
  | R_Term '+' R_Expr
  | R_Term '-' R_Expr
  | R_Term
R_Term →
  | R_Factor '*' R_Term
  | R_Factor '/' R_Term
  | R_Factor
R_Factor →
  | '(' R_Expr ')'
  | R_NumberLiteral
R_NumberLiteral →
  | 'T_NUMBER'
"
`);
  });
});

describe('SNAX Parser', () => {
  describe('parseStr', () => {
    describe('empty string', () => {
      it('should return an error result', () => {
        expect(SNAXParser.parseStr('').isErr()).toBe(true);
      });
    });
    describe('number', () => {
      it('should parse a string with a number into a NumberLiteral', () => {
        const literal = SNAXParser.parseStrOrThrow('123') as NumberLiteral;
        expect(literal).toBeInstanceOf(NumberLiteral);
        expect(literal.value).toEqual(123);
      });
    });
    describe('expression', () => {
      it('should drop parentheses', () => {
        const expr = SNAXParser.parseStrOrThrow('(123)');
        expect(expr).toBeInstanceOf(NumberLiteral);
      });
      it('should handle +', () => {
        const expr = SNAXParser.parseStrOrThrow('123+456') as Expression;
        expect(expr).toBeInstanceOf(Expression);
        expect(expr.left).toBeInstanceOf(NumberLiteral);
        expect(expr.right).toBeInstanceOf(NumberLiteral);
        expect(expr.op).toBe(BinaryOp.ADD);
        expect((expr.left as NumberLiteral).value).toEqual(123);
        expect((expr.right as NumberLiteral).value).toEqual(456);
      });
      it("should handle a sequence of +'s", () => {
        const expr = SNAXParser.parseStrOrThrow('123+456+789') as Expression;

        expect(expr).toEqual(
          new Expression(
            BinaryOp.ADD,
            new NumberLiteral(123),
            new Expression(
              BinaryOp.ADD,
              new NumberLiteral(456),
              new NumberLiteral(789)
            )
          )
        );
      });
      it('should make * operator take precedence over +', () => {
        let expr = SNAXParser.parseStrOrThrow('123+456*789') as Expression;
        expect(expr).toEqual(
          new Expression(
            BinaryOp.ADD,
            new NumberLiteral(123),
            new Expression(
              BinaryOp.MUL,
              new NumberLiteral(456),
              new NumberLiteral(789)
            )
          )
        );

        expr = SNAXParser.parseStrOrThrow('123*456+789') as Expression;
        expect(expr).toEqual(
          new Expression(
            BinaryOp.ADD,
            new Expression(
              BinaryOp.MUL,
              new NumberLiteral(123),
              new NumberLiteral(456)
            ),
            new NumberLiteral(789)
          )
        );
      });
    });
  });
});
