import { LexToken } from '../../lexer-gen/lexer-gen';
import {
  BinaryOp,
  Block,
  Expression,
  LetStatement,
  NumberLiteral,
  SymbolRef,
  ExprStatement,
  TypeExpr,
  TypeRef,
  NumberLiteralType,
  BooleanLiteral,
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
        | R_StatementList
      R_StatementList →
        | R_Statement R_StatementList
        | 
      R_Statement →
        | R_LetStatement
        | R_ExprStatement
      R_LetStatement →
        | 'let' 'T_ID' ':' 'T_ID' '=' R_Expr ';'
        | 'let' 'T_ID' '=' R_Expr ';'
      R_ExprStatement →
        | R_Expr ';'
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
    describe('numbers', () => {
      it('should parse a string with a number into a NumberLiteral', () => {
        const literal = SNAXParser.parseStrOrThrow('123', 'expr');
        expect(literal).toEqual(
          new NumberLiteral(123, NumberLiteralType.Integer)
        );
      });
      it('should parse a string with a floating point number into a NumberLiteral', () => {
        const literal = SNAXParser.parseStrOrThrow('1.23', 'expr');
        expect(literal).toEqual(
          new NumberLiteral(1.23, NumberLiteralType.Float)
        );
      });
    });
    describe('boolean literals', () => {
      it('should parse true into a BooleanLiteral', () => {
        expect(SNAXParser.parseStrOrThrow('true', 'expr')).toEqual(
          new BooleanLiteral(true)
        );
      });
    });
    describe('expression', () => {
      it('should drop parentheses', () => {
        const expr = SNAXParser.parseStrOrThrow('(123)', 'expr');
        expect(expr).toEqual(new NumberLiteral(123));
      });
      it('should handle +', () => {
        const expr = SNAXParser.parseStrOrThrow(
          '123+456',
          'expr'
        ) as Expression;
        expect(expr).toBeInstanceOf(Expression);
        expect(expr.left).toBeInstanceOf(NumberLiteral);
        expect(expr.right).toBeInstanceOf(NumberLiteral);
        expect(expr.op).toBe(BinaryOp.ADD);
        expect((expr.left as NumberLiteral).value).toEqual(123);
        expect((expr.right as NumberLiteral).value).toEqual(456);
      });
      it("should handle a sequence of +'s", () => {
        const expr = SNAXParser.parseStrOrThrow('123+456+789', 'expr');

        expect(expr).toEqual(
          new Expression(
            BinaryOp.ADD,
            new Expression(
              BinaryOp.ADD,
              new NumberLiteral(123),
              new NumberLiteral(456)
            ),
            new NumberLiteral(789)
          )
        );
      });
      it('should make * operator take precedence over +', () => {
        let expr = SNAXParser.parseStrOrThrow('123+456*789', 'expr');
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

        expr = SNAXParser.parseStrOrThrow('123*456+789', 'expr');
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
        expect(
          SNAXParser.parseStrOrThrow('123 + \n456 * \t789', 'expr')
        ).toEqual(SNAXParser.parseStrOrThrow('123+456*789', 'expr'));
      });
      it('should allow symbols', () => {
        expect(SNAXParser.parseStrOrThrow('3+x', 'expr')).toEqual(
          new Expression(BinaryOp.ADD, new NumberLiteral(3), new SymbolRef('x'))
        );
      });
    });

    describe('let statements', () => {
      it('should parse untyped let statements', () => {
        const letNode = SNAXParser.parseStrOrThrow(
          'let x = 3;',
          'statement'
        ) as LetStatement;
        expect(letNode).toEqual(
          new LetStatement('x', null, new NumberLiteral(3))
        );
      });
      it('should parse typed let statements', () => {
        const letNode = SNAXParser.parseStrOrThrow(
          'let x:i32 = 3;',
          'statement'
        ) as LetStatement;
        expect(letNode).toEqual(
          new LetStatement(
            'x',
            new TypeExpr(new TypeRef('i32')),
            new NumberLiteral(3)
          )
        );
      });
    });

    describe('block', () => {
      it('should parse a series of statements', () => {
        const block = SNAXParser.parseStrOrThrow('let x = 3; let y = 7;');
        expect(block).toEqual(
          new Block([
            new LetStatement('x', null, new NumberLiteral(3)),
            new LetStatement('y', null, new NumberLiteral(7)),
          ])
        );
      });
      it('should allow for expression statements', () => {
        const block = SNAXParser.parseStrOrThrow('let x = 3; 3+x; 8;');
        expect(block).toEqual(
          new Block([
            new LetStatement('x', null, new NumberLiteral(3)),
            new ExprStatement(
              new Expression(
                BinaryOp.ADD,
                new NumberLiteral(3),
                new SymbolRef('x')
              )
            ),
            new ExprStatement(new NumberLiteral(8)),
          ])
        );
      });
    });
  });
});
