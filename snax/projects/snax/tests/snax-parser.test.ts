import * as AST from '../spec-gen.js';
import { BinOp, NumberLiteralType, UnaryOp } from '../snax-ast.js';
import { SNAXParser } from '../snax-parser.js';
import { makeFunc, makeNum } from '../ast-util.js';

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
      AST.makeBooleanLiteral(true)
    );
  });
});
describe('array literals', () => {
  it('should parse [] into an array literal', () => {
    expect(SNAXParser.parseStrOrThrow('[]', 'expr')).toEqual(
      AST.makeArrayLiteral([])
    );
  });
  it('should parse [3,4,5] into an array literal', () => {
    expect(SNAXParser.parseStrOrThrow('[3, 4, 5]', 'expr')).toEqual(
      AST.makeArrayLiteral([makeNum(3), makeNum(4), makeNum(5)])
    );
  });
});
describe('string literals', () => {
  it('should parse "" into an empty string literal', () => {
    expect(SNAXParser.parseStrOrThrow('""', 'expr')).toEqual(
      AST.makeStringLiteral('')
    );
  });
  it('should parse "foo" into a string literal', () => {
    expect(SNAXParser.parseStrOrThrow('"foo"', 'expr')).toEqual(
      AST.makeStringLiteral('foo')
    );
  });
  it('should support escaping the quote character', () => {
    expect(
      SNAXParser.parseStrOrThrow('"this string has \\"quotes\\"."', 'expr')
    ).toEqual(AST.makeStringLiteral('this string has "quotes".'));
  });
  it('should support other escaped characters like \\n', () => {
    expect(
      SNAXParser.parseStrOrThrow('"this string has a \\n in it"', 'expr')
    ).toEqual(AST.makeStringLiteral('this string has a \n in it'));
  });
});
describe('char literals', () => {
  it("should parse 'a' into a character literal", () => {
    expect(SNAXParser.parseStrOrThrow("'a'", 'expr')).toEqual(
      AST.makeCharLiteral('a'.charCodeAt(0))
    );
  });
  it("should parse '\\n' into a character literal", () => {
    expect(SNAXParser.parseStrOrThrow("'\\n'", 'expr')).toEqual(
      AST.makeCharLiteral('\n'.charCodeAt(0))
    );
  });
  it("should parse '\\'' into a character literal", () => {
    expect(SNAXParser.parseStrOrThrow("'\\''", 'expr')).toEqual(
      AST.makeCharLiteral("'".charCodeAt(0))
    );
  });
  it("should parse '\"' into a character literal", () => {
    expect(SNAXParser.parseStrOrThrow("'\"'", 'expr')).toEqual(
      AST.makeCharLiteral('"'.charCodeAt(0))
    );
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
      AST.makeBinaryExpr(BinOp.ADD, makeNum(123), makeNum(456))
    );
  });
  it("should handle a sequence of +'s", () => {
    const expr = SNAXParser.parseStrOrThrow('123+456+789', 'expr');

    expect(expr).toEqual(
      AST.makeBinaryExpr(
        BinOp.ADD,
        AST.makeBinaryExpr(BinOp.ADD, makeNum(123), makeNum(456)),
        makeNum(789)
      )
    );
  });
  it('should make * operator take precedence over +', () => {
    let expr = SNAXParser.parseStrOrThrow('123+456*789', 'expr');
    expect(expr).toEqual(
      AST.makeBinaryExpr(
        BinOp.ADD,
        makeNum(123),
        AST.makeBinaryExpr(BinOp.MUL, makeNum(456), makeNum(789))
      )
    );

    expr = SNAXParser.parseStrOrThrow('123*456+789', 'expr');
    expect(expr).toEqual(
      AST.makeBinaryExpr(
        BinOp.ADD,
        AST.makeBinaryExpr(BinOp.MUL, makeNum(123), makeNum(456)),
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
      AST.makeBinaryExpr(BinOp.ADD, makeNum(3), AST.makeSymbolRef('x'))
    );
  });
  describe('boolean operators', () => {
    it('should handle boolean operators', () => {
      expect(SNAXParser.parseStrOrThrow('true && x', 'expr')).toEqual(
        AST.makeBinaryExpr(
          BinOp.LOGICAL_AND,
          AST.makeBooleanLiteral(true),
          AST.makeSymbolRef('x')
        )
      );
      expect(SNAXParser.parseStrOrThrow('true || x', 'expr')).toEqual(
        AST.makeBinaryExpr(
          BinOp.LOGICAL_OR,
          AST.makeBooleanLiteral(true),
          AST.makeSymbolRef('x')
        )
      );
    });
    it('&& takes precendence over ||', () => {
      expect(SNAXParser.parseStrOrThrow('a || b && c', 'expr')).toEqual(
        AST.makeBinaryExpr(
          BinOp.LOGICAL_OR,
          AST.makeSymbolRef('a'),
          AST.makeBinaryExpr(
            BinOp.LOGICAL_AND,
            AST.makeSymbolRef('b'),
            AST.makeSymbolRef('c')
          )
        )
      );
    });
    it('&& is left associative', () => {
      expect(SNAXParser.parseStrOrThrow('a && b && c', 'expr')).toEqual(
        AST.makeBinaryExpr(
          BinOp.LOGICAL_AND,
          AST.makeBinaryExpr(
            BinOp.LOGICAL_AND,
            AST.makeSymbolRef('a'),
            AST.makeSymbolRef('b')
          ),
          AST.makeSymbolRef('c')
        )
      );
    });
  });
  it('should handle relational operators', () => {
    const three = makeNum(3);
    const four = makeNum(4);
    expect(SNAXParser.parseStrOrThrow('3 < 4', 'expr')).toEqual(
      AST.makeBinaryExpr(BinOp.LESS_THAN, three, four)
    );
    expect(SNAXParser.parseStrOrThrow('3 > 4', 'expr')).toEqual(
      AST.makeBinaryExpr(BinOp.GREATER_THAN, three, four)
    );
    expect(SNAXParser.parseStrOrThrow('3 == 4', 'expr')).toEqual(
      AST.makeBinaryExpr(BinOp.EQUAL_TO, three, four)
    );
  });

  describe('assignment', () => {
    it('should be right associative', () => {
      expect(SNAXParser.parseStrOrThrow('a = b = c', 'expr')).toEqual(
        AST.makeBinaryExpr(
          BinOp.ASSIGN,
          AST.makeSymbolRef('a'),
          AST.makeBinaryExpr(
            BinOp.ASSIGN,
            AST.makeSymbolRef('b'),
            AST.makeSymbolRef('c')
          )
        )
      );
    });
  });

  describe('dereference operator', () => {
    it('works', () => {
      expect(SNAXParser.parseStrOrThrow('@foo', 'expr')).toEqual(
        AST.makeUnaryExpr(UnaryOp.DEREF, AST.makeSymbolRef('foo'))
      );
    });
  });

  describe('array indexing expressions', () => {
    it('should parse array indexing operator', () => {
      expect(SNAXParser.parseStrOrThrow('x[1]', 'expr')).toEqual(
        AST.makeBinaryExpr(
          BinOp.ARRAY_INDEX,
          AST.makeSymbolRef('x'),
          makeNum(1)
        )
      );
    });
  });

  describe('member access expression', () => {
    it('should parse the member access operator', () => {
      expect(SNAXParser.parseStrOrThrow('a.b.0', 'expr')).toEqual(
        AST.makeMemberAccessExpr(
          AST.makeMemberAccessExpr(
            AST.makeSymbolRef('a'),
            AST.makeSymbolRef('b')
          ),
          AST.makeNumberLiteral(0, 'int', undefined)
        )
      );
    });
  });

  describe('type casting operator', () => {
    it('should parse type casting operator', () => {
      expect(SNAXParser.parseStrOrThrow('1 as f64', 'expr')).toEqual(
        AST.makeCastExpr(makeNum(1), AST.makeTypeRef('f64'), false)
      );
    });
    it('should parse forced type casting operator', () => {
      expect(SNAXParser.parseStrOrThrow('14723873 as! u8', 'expr')).toEqual(
        AST.makeCastExpr(makeNum(14723873), AST.makeTypeRef('u8'), true)
      );
    });
  });
});

describe('let statements', () => {
  it('should parse untyped let statements', () => {
    const letNode = SNAXParser.parseStrOrThrow('let x = 3;', 'statement');
    expect(letNode).toEqual(AST.makeLetStatement('x', undefined, makeNum(3)));
  });
  it('should parse typed let statements', () => {
    const letNode = SNAXParser.parseStrOrThrow('let x:i32 = 3;', 'statement');
    expect(letNode).toEqual(
      AST.makeLetStatement('x', AST.makeTypeRef('i32'), makeNum(3))
    );
  });
});

describe('type expressions', () => {
  it('parses pointer types', () => {
    expect(SNAXParser.parseStrOrThrow('&i32', 'typeExpr')).toEqual(
      AST.makePointerTypeExpr(AST.makeTypeRef('i32'))
    );
  });
});

describe('while loops', () => {
  it('should parse while loops', () => {
    expect(
      SNAXParser.parseStrOrThrow(`while (true) { doSomething(); }`, 'statement')
    ).toEqual(
      AST.makeWhileStatement(
        AST.makeBooleanLiteral(true),
        AST.makeBlock([
          AST.makeExprStatement(
            AST.makeCallExpr(
              AST.makeSymbolRef('doSomething'),
              AST.makeArgList([])
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
      AST.makeBlock([
        AST.makeLetStatement('x', undefined, makeNum(3)),
        AST.makeLetStatement('y', undefined, makeNum(7)),
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
      AST.makeBlock([
        AST.makeLetStatement('x', undefined, makeNum(3)),
        AST.makeExprStatement(
          AST.makeBinaryExpr(BinOp.ADD, makeNum(3), AST.makeSymbolRef('x'))
        ),
        AST.makeExprStatement(makeNum(8)),
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
      AST.makeBlock([
        AST.makeLetStatement('x', undefined, makeNum(1)),
        AST.makeBlock([AST.makeLetStatement('x', undefined, makeNum(2))]),
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
      AST.makeIfStatement(
        AST.makeBinaryExpr(BinOp.EQUAL_TO, AST.makeSymbolRef('x'), makeNum(3)),
        AST.makeBlock([
          AST.makeExprStatement(
            AST.makeBinaryExpr(BinOp.ASSIGN, AST.makeSymbolRef('y'), makeNum(2))
          ),
        ]),
        AST.makeBlock([])
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
      AST.makeIfStatement(
        AST.makeBinaryExpr(BinOp.EQUAL_TO, AST.makeSymbolRef('x'), makeNum(3)),
        AST.makeBlock([
          AST.makeExprStatement(
            AST.makeBinaryExpr(BinOp.ASSIGN, AST.makeSymbolRef('y'), makeNum(2))
          ),
        ]),
        AST.makeBlock([
          AST.makeExprStatement(
            AST.makeBinaryExpr(BinOp.ASSIGN, AST.makeSymbolRef('y'), makeNum(4))
          ),
        ])
      )
    );
  });
});

describe('structs', () => {
  it('should parse tuple structs', () => {
    expect(
      SNAXParser.parseStrOrThrow('struct Vector(u8,i32);', 'structDecl')
    ).toEqual(
      AST.makeTupleStructDecl('Vector', [
        AST.makeTypeRef('u8'),
        AST.makeTypeRef('i32'),
      ])
    );
  });
  it('should parse object structs', () => {
    expect(
      SNAXParser.parseStrOrThrow(
        `struct Vector {
          x: i32;
          y: i32;
          func mag() {}
        }`,
        'structDecl'
      )
    ).toEqual(
      AST.makeStructDeclWith({
        symbol: 'Vector',
        props: [
          AST.makeStructProp('x', AST.makeTypeRef('i32')),
          AST.makeStructProp('y', AST.makeTypeRef('i32')),
          AST.makeFuncDeclWith({
            symbol: 'mag',
            parameters: AST.makeParameterList([]),
            body: AST.makeBlock([]),
          }),
        ],
      })
    );
  });
  it('should parse object struct literals', () => {
    expect(SNAXParser.parseStrOrThrow(`Vector::{x:3, y:7}`, 'expr')).toEqual(
      AST.makeStructLiteral(AST.makeSymbolRef('Vector'), [
        AST.makeStructLiteralProp('x', makeNum(3)),
        AST.makeStructLiteralProp('y', makeNum(7)),
      ])
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
        AST.makeParameter('a', AST.makeTypeRef('i32')),
        AST.makeParameter('b', AST.makeTypeRef('f32')),
      ])
    );
  });
  it('should allow trailing commas in function parameters', () => {
    expect(
      SNAXParser.parseStrOrThrow('func foo(a:i32, b:f32,) {}', 'funcDecl')
    ).toEqual(
      makeFunc('foo', [
        AST.makeParameter('a', AST.makeTypeRef('i32')),
        AST.makeParameter('b', AST.makeTypeRef('f32')),
      ])
    );
  });
  it('should parse a function with a body', () => {
    expect(
      SNAXParser.parseStrOrThrow('func foo(a:i32) { return a+1; }', 'funcDecl')
    ).toEqual(
      makeFunc(
        'foo',
        [AST.makeParameter('a', AST.makeTypeRef('i32'))],
        [
          AST.makeReturnStatement(
            AST.makeBinaryExpr(BinOp.ADD, AST.makeSymbolRef('a'), makeNum(1))
          ),
        ]
      )
    );
  });
  it('should parse a function call', () => {
    expect(SNAXParser.parseStrOrThrow('foo(3,4)', 'expr')).toEqual(
      AST.makeCallExpr(
        AST.makeSymbolRef('foo'),
        AST.makeArgList([makeNum(3), makeNum(4)])
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
      AST.makeFileWith({
        funcs: [
          makeFunc('foo'),
          makeFunc('bar'),
          makeFunc('main', [], [AST.makeReturnStatement(makeNum(1))]),
        ],
        globals: [AST.makeGlobalDecl('counter', undefined, makeNum(0))],
        decls: [],
      })
    );
  });
});

describe('externals', () => {
  it('should parse an extern declaration', () => {
    expect(
      SNAXParser.parseStrOrThrow(`
        extern WASI {
          func fd_write(fileDescriptor:i32, iovPointer:i32, iovLength: i32, numWrittenPointer: i32):i32;
        }
      `)
    ).toEqual(
      AST.makeFileWith({
        funcs: [
          AST.makeFuncDecl(
            'main',
            AST.makeParameterList([]),
            undefined,
            AST.makeBlock([])
          ),
        ],
        globals: [],
        decls: [
          AST.makeExternDeclWith({
            libName: 'WASI',
            funcs: [
              AST.makeFuncDeclWith({
                symbol: 'fd_write',
                parameters: AST.makeParameterList([
                  AST.makeParameter('fileDescriptor', AST.makeTypeRef('i32')),
                  AST.makeParameter('iovPointer', AST.makeTypeRef('i32')),
                  AST.makeParameter('iovLength', AST.makeTypeRef('i32')),
                  AST.makeParameter(
                    'numWrittenPointer',
                    AST.makeTypeRef('i32')
                  ),
                ]),
                returnType: AST.makeTypeRef('i32'),
                body: AST.makeBlock([]),
              }),
            ],
          }),
        ],
      })
    );
  });
});
