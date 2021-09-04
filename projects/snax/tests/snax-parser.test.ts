import * as spec from '../spec-gen';
import { BinaryOp, NumberLiteralType, UnaryOp } from '../snax-ast';
import { SNAXParser } from '../snax-parser';
import { makeFunc, makeNum } from './ast-util';

describe('SNAX Parser', () => {
  describe('numbers', () => {
    it('should parse a string with a number into a NumberLiteral', () => {
      const literal = SNAXParser.parseStrOrThrow('123', 'expr');
      expect(literal).toEqual(makeNum(123, NumberLiteralType.Integer));
    });
    it('should parse a string with a floating point number into a NumberLiteral', () => {
      const literal = SNAXParser.parseStrOrThrow('1.23', 'expr');
      expect(literal).toEqual(makeNum(1.23, NumberLiteralType.Float));
    });
  });
  describe('boolean literals', () => {
    it('should parse true into a BooleanLiteral', () => {
      expect(SNAXParser.parseStrOrThrow('true', 'expr')).toEqual(
        spec.makeBooleanLiteral(true)
      );
    });
  });
  describe('array literals', () => {
    it('should parse [] into an array literal', () => {
      expect(SNAXParser.parseStrOrThrow('[]', 'expr')).toEqual(
        spec.makeArrayLiteral([])
      );
    });
    it('should parse [3,4,5] into an array literal', () => {
      expect(SNAXParser.parseStrOrThrow('[3, 4, 5]', 'expr')).toEqual(
        spec.makeArrayLiteral([makeNum(3), makeNum(4), makeNum(5)])
      );
    });
  });
  describe('string literals', () => {
    it('should parse "" into an empty string literal', () => {
      expect(SNAXParser.parseStrOrThrow('""', 'expr')).toEqual(
        spec.makeStringLiteral('')
      );
    });
    it('should parse "foo" into a string literal', () => {
      expect(SNAXParser.parseStrOrThrow('"foo"', 'expr')).toEqual(
        spec.makeStringLiteral('foo')
      );
    });
    it('should support escaping the quote character', () => {
      expect(
        SNAXParser.parseStrOrThrow('"this string has \\"quotes\\"."', 'expr')
      ).toEqual(spec.makeStringLiteral('this string has "quotes".'));
    });
    it('should support other escaped characters like \\n', () => {
      expect(
        SNAXParser.parseStrOrThrow('"this string has a \\n in it"', 'expr')
      ).toEqual(spec.makeStringLiteral('this string has a \n in it'));
    });
  });
  describe('expression', () => {
    it('should drop parentheses', () => {
      const expr = SNAXParser.parseStrOrThrow('(123)', 'expr');
      expect(expr).toEqual(makeNum(123));
    });
    it('should handle +', () => {
      const expr = SNAXParser.parseStrOrThrow('123+456', 'expr');
      expect(expr).toEqual(
        spec.makeBinaryExpr(BinaryOp.ADD, makeNum(123), makeNum(456))
      );
    });
    it("should handle a sequence of +'s", () => {
      const expr = SNAXParser.parseStrOrThrow('123+456+789', 'expr');

      expect(expr).toEqual(
        spec.makeBinaryExpr(
          BinaryOp.ADD,
          spec.makeBinaryExpr(BinaryOp.ADD, makeNum(123), makeNum(456)),
          makeNum(789)
        )
      );
    });
    it('should make * operator take precedence over +', () => {
      let expr = SNAXParser.parseStrOrThrow('123+456*789', 'expr');
      expect(expr).toEqual(
        spec.makeBinaryExpr(
          BinaryOp.ADD,
          makeNum(123),
          spec.makeBinaryExpr(BinaryOp.MUL, makeNum(456), makeNum(789))
        )
      );

      expr = SNAXParser.parseStrOrThrow('123*456+789', 'expr');
      expect(expr).toEqual(
        spec.makeBinaryExpr(
          BinaryOp.ADD,
          spec.makeBinaryExpr(BinaryOp.MUL, makeNum(123), makeNum(456)),
          makeNum(789)
        )
      );
    });
    it('should ignore whitespace', () => {
      expect(SNAXParser.parseStrOrThrow('123 + \n456 * \t789', 'expr')).toEqual(
        SNAXParser.parseStrOrThrow('123+456*789', 'expr')
      );
    });
    it('should ignore comments', () => {
      expect(
        SNAXParser.parseStrOrThrow('123 + // some comment\n456 * \t789', 'expr')
      ).toEqual(SNAXParser.parseStrOrThrow('123+456*789', 'expr'));
    });
    it('should allow symbols', () => {
      expect(SNAXParser.parseStrOrThrow('3+x', 'expr')).toEqual(
        spec.makeBinaryExpr(BinaryOp.ADD, makeNum(3), spec.makeSymbolRef('x'))
      );
    });
    it('should handle boolean operators', () => {
      expect(SNAXParser.parseStrOrThrow('true && x', 'expr')).toEqual(
        spec.makeBinaryExpr(
          BinaryOp.LOGICAL_AND,
          spec.makeBooleanLiteral(true),
          spec.makeSymbolRef('x')
        )
      );
      expect(SNAXParser.parseStrOrThrow('true || x', 'expr')).toEqual(
        spec.makeBinaryExpr(
          BinaryOp.LOGICAL_OR,
          spec.makeBooleanLiteral(true),
          spec.makeSymbolRef('x')
        )
      );
    });
    it('should handle relational operators', () => {
      const three = makeNum(3);
      const four = makeNum(4);
      expect(SNAXParser.parseStrOrThrow('3 < 4', 'expr')).toEqual(
        spec.makeBinaryExpr(BinaryOp.LESS_THAN, three, four)
      );
      expect(SNAXParser.parseStrOrThrow('3 > 4', 'expr')).toEqual(
        spec.makeBinaryExpr(BinaryOp.GREATER_THAN, three, four)
      );
      expect(SNAXParser.parseStrOrThrow('3 == 4', 'expr')).toEqual(
        spec.makeBinaryExpr(BinaryOp.EQUAL_TO, three, four)
      );
    });

    describe('dereference operator', () => {
      it('works', () => {
        expect(SNAXParser.parseStrOrThrow('@foo', 'expr')).toEqual(
          spec.makeUnaryExpr(UnaryOp.DEREF, spec.makeSymbolRef('foo'))
        );
      });
    });

    describe('array indexing expressions', () => {
      it('should parse array indexing operator', () => {
        expect(SNAXParser.parseStrOrThrow('x[1]', 'expr')).toEqual(
          spec.makeBinaryExpr(
            BinaryOp.ARRAY_INDEX,
            spec.makeSymbolRef('x'),
            makeNum(1)
          )
        );
      });
    });

    describe('type casting operator', () => {
      it('should parse type casting operator', () => {
        expect(SNAXParser.parseStrOrThrow('1 as f64', 'expr')).toEqual(
          spec.makeCastExpr(makeNum(1), spec.makeTypeRef('f64'))
        );
      });
    });
  });

  describe('let statements', () => {
    it('should parse untyped let statements', () => {
      const letNode = SNAXParser.parseStrOrThrow('let x = 3;', 'statement');
      expect(letNode).toEqual(spec.makeLetStatement('x', null, makeNum(3)));
    });
    it('should parse typed let statements', () => {
      const letNode = SNAXParser.parseStrOrThrow('let x:i32 = 3;', 'statement');
      expect(letNode).toEqual(
        spec.makeLetStatement('x', spec.makeTypeRef('i32'), makeNum(3))
      );
    });
  });

  describe('type expressions', () => {
    it('parses pointer types', () => {
      expect(SNAXParser.parseStrOrThrow('&i32', 'typeExpr')).toEqual(
        spec.makePointerTypeExpr(spec.makeTypeRef('i32'))
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
        spec.makeWhileStatement(
          spec.makeBooleanLiteral(true),
          spec.makeBlock([
            spec.makeExprStatement(
              spec.makeCallExpr(
                spec.makeSymbolRef('doSomething'),
                spec.makeArgList([])
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
        spec.makeBlock([
          spec.makeLetStatement('x', null, makeNum(3)),
          spec.makeLetStatement('y', null, makeNum(7)),
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
        spec.makeBlock([
          spec.makeLetStatement('x', null, makeNum(3)),
          spec.makeExprStatement(
            spec.makeBinaryExpr(
              BinaryOp.ADD,
              makeNum(3),
              spec.makeSymbolRef('x')
            )
          ),
          spec.makeExprStatement(makeNum(8)),
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
        spec.makeBlock([
          spec.makeLetStatement('x', null, makeNum(1)),
          spec.makeBlock([spec.makeLetStatement('x', null, makeNum(2))]),
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
        spec.makeIfStatement(
          spec.makeBinaryExpr(
            BinaryOp.EQUAL_TO,
            spec.makeSymbolRef('x'),
            makeNum(3)
          ),
          spec.makeBlock([
            spec.makeExprStatement(
              spec.makeBinaryExpr(
                BinaryOp.ASSIGN,
                spec.makeSymbolRef('y'),
                makeNum(2)
              )
            ),
          ]),
          spec.makeBlock([])
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
        spec.makeIfStatement(
          spec.makeBinaryExpr(
            BinaryOp.EQUAL_TO,
            spec.makeSymbolRef('x'),
            makeNum(3)
          ),
          spec.makeBlock([
            spec.makeExprStatement(
              spec.makeBinaryExpr(
                BinaryOp.ASSIGN,
                spec.makeSymbolRef('y'),
                makeNum(2)
              )
            ),
          ]),
          spec.makeBlock([
            spec.makeExprStatement(
              spec.makeBinaryExpr(
                BinaryOp.ASSIGN,
                spec.makeSymbolRef('y'),
                makeNum(4)
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
        makeFunc('foo')
      );
    });
    it('should parse a function with parameters', () => {
      expect(
        SNAXParser.parseStrOrThrow('func foo(a:i32, b:f32) {}', 'funcDecl')
      ).toEqual(
        makeFunc('foo', [
          spec.makeParameter('a', spec.makeTypeRef('i32')),
          spec.makeParameter('b', spec.makeTypeRef('f32')),
        ])
      );
    });
    it('should parse a function with a body', () => {
      expect(
        SNAXParser.parseStrOrThrow(
          'func foo(a:i32) { return a+1; }',
          'funcDecl'
        )
      ).toEqual(
        makeFunc(
          'foo',
          [spec.makeParameter('a', spec.makeTypeRef('i32'))],
          [
            spec.makeReturnStatement(
              spec.makeBinaryExpr(
                BinaryOp.ADD,
                spec.makeSymbolRef('a'),
                makeNum(1)
              )
            ),
          ]
        )
      );
    });
    it('should parse a function call', () => {
      expect(SNAXParser.parseStrOrThrow('foo(3,4)', 'expr')).toEqual(
        spec.makeCallExpr(
          spec.makeSymbolRef('foo'),
          spec.makeArgList([makeNum(3), makeNum(4)])
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
        spec.makeFile(
          [
            makeFunc('foo'),
            makeFunc('bar'),
            makeFunc('main', [], [spec.makeReturnStatement(makeNum(1))]),
          ],
          [spec.makeGlobalDecl('counter', null, makeNum(0))]
        )
      );
    });
  });
});
