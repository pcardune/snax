import { LexToken } from '../../lexer-gen/lexer-gen';
import {
  BinaryOp,
  Block,
  Expression,
  LetStatement,
  NumberLiteral,
  SymbolRef,
  ExprStatement,
  TypeRef,
  NumberLiteralType,
  BooleanLiteral,
  ArrayLiteral,
  ParameterList,
  FuncDecl,
  Parameter,
  ReturnStatement,
  ArgList,
  IfStatement,
  WhileStatement,
  File,
  GlobalDecl,
  PointerTypeExpr,
  UnaryExpr,
  UnaryOp,
} from '../snax-ast';
import { grammar, lexer, Rule, SNAXParser, Token } from '../snax-parser';
import { PointerType } from '../snax-types';

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
  describe('numbers', () => {
    it('should parse a string with a number into a NumberLiteral', () => {
      const literal = SNAXParser.parseStrOrThrow('123', 'expr');
      expect(literal).toEqual(
        new NumberLiteral(123, NumberLiteralType.Integer)
      );
    });
    it('should parse a string with a floating point number into a NumberLiteral', () => {
      const literal = SNAXParser.parseStrOrThrow('1.23', 'expr');
      expect(literal).toEqual(new NumberLiteral(1.23, NumberLiteralType.Float));
    });
  });
  describe('boolean literals', () => {
    it('should parse true into a BooleanLiteral', () => {
      expect(SNAXParser.parseStrOrThrow('true', 'expr')).toEqual(
        new BooleanLiteral(true)
      );
    });
  });
  describe('array literals', () => {
    it('should parse [] into an array literal', () => {
      expect(SNAXParser.parseStrOrThrow('[]', 'expr')).toEqual(
        new ArrayLiteral([])
      );
    });
    it('should parse [3,4,5] into an array literal', () => {
      expect(SNAXParser.parseStrOrThrow('[3, 4, 5]', 'expr')).toEqual(
        new ArrayLiteral([
          new NumberLiteral(3),
          new NumberLiteral(4),
          new NumberLiteral(5),
        ])
      );
    });
  });
  describe('expression', () => {
    it('should drop parentheses', () => {
      const expr = SNAXParser.parseStrOrThrow('(123)', 'expr');
      expect(expr).toEqual(new NumberLiteral(123));
    });
    it('should handle +', () => {
      const expr = SNAXParser.parseStrOrThrow('123+456', 'expr') as Expression;
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
      expect(SNAXParser.parseStrOrThrow('123 + \n456 * \t789', 'expr')).toEqual(
        SNAXParser.parseStrOrThrow('123+456*789', 'expr')
      );
    });
    it('should allow symbols', () => {
      expect(SNAXParser.parseStrOrThrow('3+x', 'expr')).toEqual(
        new Expression(BinaryOp.ADD, new NumberLiteral(3), new SymbolRef('x'))
      );
    });
    it('should handle boolean operators', () => {
      expect(SNAXParser.parseStrOrThrow('true && x', 'expr')).toEqual(
        new Expression(
          BinaryOp.LOGICAL_AND,
          new BooleanLiteral(true),
          new SymbolRef('x')
        )
      );
      expect(SNAXParser.parseStrOrThrow('true || x', 'expr')).toEqual(
        new Expression(
          BinaryOp.LOGICAL_OR,
          new BooleanLiteral(true),
          new SymbolRef('x')
        )
      );
    });
    it('should handle relational operators', () => {
      const three = new NumberLiteral(3);
      const four = new NumberLiteral(4);
      expect(SNAXParser.parseStrOrThrow('3 < 4', 'expr')).toEqual(
        new Expression(BinaryOp.LESS_THAN, three, four)
      );
      expect(SNAXParser.parseStrOrThrow('3 > 4', 'expr')).toEqual(
        new Expression(BinaryOp.GREATER_THAN, three, four)
      );
      expect(SNAXParser.parseStrOrThrow('3 == 4', 'expr')).toEqual(
        new Expression(BinaryOp.EQUAL_TO, three, four)
      );
    });

    describe('dereference operator', () => {
      it('works', () => {
        expect(SNAXParser.parseStrOrThrow('@foo', 'expr')).toEqual(
          new UnaryExpr(UnaryOp.DEREF, new SymbolRef('foo'))
        );
      });
    });

    describe('array indexing expressions', () => {
      it('should parse array indexing operator', () => {
        expect(SNAXParser.parseStrOrThrow('x[1]', 'expr')).toEqual(
          new Expression(
            BinaryOp.ARRAY_INDEX,
            new SymbolRef('x'),
            new NumberLiteral(1)
          )
        );
      });
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
        new LetStatement('x', new TypeRef('i32'), new NumberLiteral(3))
      );
    });
  });

  describe('type expressions', () => {
    it('parses pointer types', () => {
      expect(SNAXParser.parseStrOrThrow('&i32', 'typeExpr')).toEqual(
        new PointerTypeExpr(new TypeRef('i32'))
      );
    });
  });

  describe('while loops', () => {
    it('should parse while loops', () => {
      expect(
        SNAXParser.parseStrOrThrow(
          `while (true) { doSomething(); }`,
          'statement'
        )
      ).toEqual(
        new WhileStatement(
          new BooleanLiteral(true),
          new Block([
            new ExprStatement(
              new Expression(
                BinaryOp.CALL,
                new SymbolRef('doSomething'),
                new ArgList([])
              )
            ),
          ])
        )
      );
    });
  });

  describe('block', () => {
    it('should parse a series of statements', () => {
      const block = SNAXParser.parseStrOrThrow(
        `
          let x = 3;
          let y = 7;
        `,
        'block'
      );
      expect(block).toEqual(
        new Block([
          new LetStatement('x', null, new NumberLiteral(3)),
          new LetStatement('y', null, new NumberLiteral(7)),
        ])
      );
    });
    it('should allow for expression statements', () => {
      const block = SNAXParser.parseStrOrThrow(
        `
          let x = 3;
          3+x; 8;
        `,
        'block'
      );
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
    it('should parse nested blocks', () => {
      expect(
        SNAXParser.parseStrOrThrow(
          `
          let x = 1;
          {
            let x = 2;
          }
        `,
          'block'
        )
      ).toEqual(
        new Block([
          new LetStatement('x', null, new NumberLiteral(1)),
          new Block([new LetStatement('x', null, new NumberLiteral(2))]),
        ])
      );
    });
  });

  describe('if statements', () => {
    it('should parse an if statement', () => {
      expect(
        SNAXParser.parseStrOrThrow(
          `if (x==3) {
             y = 2;
           }`,
          'statement'
        )
      ).toEqual(
        new IfStatement(
          new Expression(
            BinaryOp.EQUAL_TO,
            new SymbolRef('x'),
            new NumberLiteral(3)
          ),
          new Block([
            new ExprStatement(
              new Expression(
                BinaryOp.ASSIGN,
                new SymbolRef('y'),
                new NumberLiteral(2)
              )
            ),
          ]),
          new Block([])
        )
      );
    });
    it('should parse an if/else statement', () => {
      expect(
        SNAXParser.parseStrOrThrow(
          `if (x==3) {
             y = 2;
           } else { y = 4; }`,
          'statement'
        )
      ).toEqual(
        new IfStatement(
          new Expression(
            BinaryOp.EQUAL_TO,
            new SymbolRef('x'),
            new NumberLiteral(3)
          ),
          new Block([
            new ExprStatement(
              new Expression(
                BinaryOp.ASSIGN,
                new SymbolRef('y'),
                new NumberLiteral(2)
              )
            ),
          ]),
          new Block([
            new ExprStatement(
              new Expression(
                BinaryOp.ASSIGN,
                new SymbolRef('y'),
                new NumberLiteral(4)
              )
            ),
          ])
        )
      );
    });
  });

  describe('functions', () => {
    it('should parse an empty function', () => {
      expect(SNAXParser.parseStrOrThrow('func foo() {}', 'funcDecl')).toEqual(
        new FuncDecl('foo')
      );
    });
    it('should parse a function with parameters', () => {
      expect(
        SNAXParser.parseStrOrThrow('func foo(a:i32, b:f32) {}', 'funcDecl')
      ).toEqual(
        new FuncDecl('foo', {
          parameters: new ParameterList([
            new Parameter('a', new TypeRef('i32')),
            new Parameter('b', new TypeRef('f32')),
          ]),
        })
      );
    });
    it('should parse a function with a body', () => {
      expect(
        SNAXParser.parseStrOrThrow(
          'func foo(a:i32) { return a+1; }',
          'funcDecl'
        )
      ).toEqual(
        new FuncDecl('foo', {
          parameters: new ParameterList([
            new Parameter('a', new TypeRef('i32')),
          ]),
          body: new Block([
            new ReturnStatement(
              new Expression(
                BinaryOp.ADD,
                new SymbolRef('a'),
                new NumberLiteral(1)
              )
            ),
          ]),
        })
      );
    });
    it('should parse a function call', () => {
      expect(SNAXParser.parseStrOrThrow('foo(3,4)', 'expr')).toEqual(
        new Expression(
          BinaryOp.CALL,
          new SymbolRef('foo'),
          new ArgList([new NumberLiteral(3), new NumberLiteral(4)])
        )
      );
    });
  });

  describe('files', () => {
    it('should parse files', () => {
      expect(
        SNAXParser.parseStrOrThrow(`
          global counter = 0;
          func foo(){}
          func bar(){}
          1;
        `)
      ).toEqual(
        new File({
          globals: [new GlobalDecl('counter', null, new NumberLiteral(0))],
          funcs: [
            new FuncDecl('foo'),
            new FuncDecl('bar'),
            new FuncDecl('main', {
              body: new Block([new ReturnStatement(new NumberLiteral(1))]),
            }),
          ],
        })
      );
    });
  });
});
