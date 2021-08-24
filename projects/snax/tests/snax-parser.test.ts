import { LexToken } from '../../lexer-gen/lexer-gen';
import {
  BinaryOp,
  Block,
  Expression,
  LetStatement,
  NumberLiteral,
  NumberType,
  SymbolRef,
} from '../snax-ast';
import { grammar, lexer, Rule, SNAXParser, Token } from '../snax-parser';

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
        | R_StatementList
      R_StatementList →
        | R_Statement R_StatementList
        | 
      R_Statement →
        | R_LetStatement
      R_LetStatement →
        | 'let' 'T_ID' '=' R_Expr ';'
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
        | 'T_ID'
      R_NumberLiteral →
        | 'T_NUMBER'
        | 'T_FLOAT_NUMBER'
      "
    `);
  });
});

describe('SNAX Parser', () => {
  describe('parseStr', () => {
    describe('empty string', () => {
      it('should return an error result', () => {
        const node = SNAXParser.parseStrOrThrow('');
        expect(node).toEqual(new Block([]));
      });
    });
    describe('numbers', () => {
      it('should parse a string with a number into a NumberLiteral', () => {
        const literal = SNAXParser.parseStrOrThrow('123') as NumberLiteral;
        expect(literal).toEqual(new NumberLiteral(123, NumberType.Integer));
      });
      it('should parse a string with a floating point number into a NumberLiteral', () => {
        const literal = SNAXParser.parseStrOrThrow('1.23') as NumberLiteral;
        expect(literal).toEqual(new NumberLiteral(1.23, NumberType.Float));
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
      it('should ignore whitespace', () => {
        expect(SNAXParser.parseStrOrThrow('123 + 456 * \t789')).toEqual(
          SNAXParser.parseStrOrThrow('123+456*789')
        );
      });
      it('should allow symbols', () => {
        expect(SNAXParser.parseStrOrThrow('3+x')).toEqual(
          new Expression(BinaryOp.ADD, new NumberLiteral(3), new SymbolRef('x'))
        );
      });
    });

    describe('let statements', () => {
      it('should parse', () => {
        const letNode = SNAXParser.parseStrOrThrow(
          'let x = 3;',
          Rule.LetStatement
        ) as LetStatement;
        expect(letNode).toEqual(new LetStatement('x', new NumberLiteral(3)));
      });
    });

    describe('block', () => {
      it('should parse a series of statements', () => {
        const block = SNAXParser.parseStrOrThrow('let x = 3; let y = 7;');
        expect(block).toEqual(
          new Block([
            new LetStatement('x', new NumberLiteral(3)),
            new LetStatement('y', new NumberLiteral(7)),
          ])
        );
      });
    });
  });
});
