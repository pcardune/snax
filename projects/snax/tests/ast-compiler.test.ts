import * as AST from '../snax-ast';
import * as IR from '../stack-ir';
import * as Wasm from '../wasm-ast';
import {
  assignStorageLocations,
  ASTCompiler,
  FuncDeclCompiler,
  ModuleCompiler,
  resolveSymbols,
} from '../ast-compiler';

function compile(node: AST.ASTNode) {
  return ASTCompiler.forNode(node).compile();
}

describe('ExpressionCompiler', () => {
  const { i32, f32 } = IR.NumberType;
  test('compile() combines the stack IRS of the sub expressions', () => {
    const twenty = new AST.NumberLiteral(20);
    const thirty = new AST.NumberLiteral(30);
    const expr = new AST.Expression(AST.BinaryOp.ADD, twenty, thirty);
    const compiler = ASTCompiler.forNode(expr);
    expect(compiler.compile()).toEqual([
      ...compile(twenty),
      ...compile(thirty),
      new IR.Add(i32),
    ]);
  });
  fit('casts integers to floats', () => {
    const ten = new AST.NumberLiteral(10);
    const twelvePointThree = new AST.NumberLiteral(
      12.3,
      AST.NumberLiteralType.Float
    );
    expect(
      compile(new AST.Expression(AST.BinaryOp.ADD, ten, twelvePointThree))
    ).toEqual([
      ...compile(ten),
      new IR.Convert(i32, f32),
      ...compile(twelvePointThree),
      new IR.Add(f32),
    ]);
    expect(
      compile(new AST.Expression(AST.BinaryOp.ADD, twelvePointThree, ten))
    ).toEqual([
      ...compile(twelvePointThree),
      ...compile(ten),
      new IR.Convert(i32, f32),
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

describe('FuncDeclCompiler', () => {
  it('compiles functions', () => {
    const block = new AST.Block([
      new AST.ReturnStatement(new AST.NumberLiteral(3)),
    ]);
    expect(
      new FuncDeclCompiler(
        new AST.FuncDecl(
          'foo',
          new AST.ParameterList([
            new AST.Parameter('a', new AST.TypeExpr(new AST.TypeRef('i32'))),
            new AST.Parameter('b', new AST.TypeExpr(new AST.TypeRef('f32'))),
          ]),
          block
        )
      ).compile()
    ).toEqual(
      new Wasm.Func({
        id: 'foo',
        funcType: new Wasm.FuncType({
          params: [IR.NumberType.i32, IR.NumberType.f32],
          results: [IR.NumberType.i32],
        }),
        body: ASTCompiler.forNode(block).compile(),
      })
    );
  });
});

describe('block compilation', () => {
  let file: AST.File;
  let funcDecl: AST.FuncDecl;
  let outerBlock: AST.Block;
  let innerBlock: AST.Block;

  beforeEach(() => {
    innerBlock = new AST.Block([
      new AST.LetStatement('x', null, new AST.NumberLiteral(3)),
      new AST.SymbolRef('x'),
      new AST.SymbolRef('y'),
    ]);
    outerBlock = new AST.Block([
      new AST.LetStatement('x', null, new AST.NumberLiteral(1)),
      new AST.LetStatement('y', null, new AST.NumberLiteral(2)),
      innerBlock,
      new AST.SymbolRef('x'),
    ]);
    funcDecl = new AST.FuncDecl('main', new AST.ParameterList([]), outerBlock);
    file = new AST.File([funcDecl]);
    resolveSymbols(file);
  });

  describe('resolveSymbols', () => {
    it('constructs the correct symbol table', () => {
      if (!outerBlock.symbolTable) {
        fail('resolveSymbols should attach a symbolTable to the block');
      }
      expect(outerBlock.symbolTable.get('x')?.declNode).toBe(
        outerBlock.children[0]
      );
      expect(outerBlock.symbolTable.get('y')?.declNode).toBe(
        outerBlock.children[1]
      );
      expect((outerBlock.children[3] as AST.SymbolRef).symbolRecord).toBe(
        outerBlock.symbolTable.get('x')
      );
    });
    it('symbols are resolved to the nearest scope they are found in', () => {
      const innerXRef = innerBlock.children[1] as AST.SymbolRef;
      expect(innerXRef.symbolRecord).not.toBe(outerBlock.symbolTable?.get('x'));
      expect(innerXRef.symbolRecord).toBe(innerBlock.symbolTable?.get('x'));
    });
    it('symbols are resolved to an outer scope when not in the current scope', () => {
      expect((innerBlock.children[2] as AST.SymbolRef).symbolRecord).toBe(
        outerBlock.symbolTable?.get('y')
      );
    });
  });

  describe('assignStorageLocations', () => {
    beforeEach(() => {
      assignStorageLocations(file);
    });
    it('should assign correct storage locations for variables declared in the outer block', () => {
      expect(outerBlock.symbolTable?.get('x')?.location).toEqual({
        area: 'locals',
        offset: 0,
      });
    });
    it('should attach locations to let statements', () => {
      expect((outerBlock.children[0] as AST.LetStatement).location).toEqual({
        area: 'locals',
        offset: 0,
      });
    });
    it('should give locations to inner block let statements that do not conflict with outer block let statements', () => {
      expect((innerBlock.children[0] as AST.LetStatement).location).toEqual({
        area: 'locals',
        offset: 2,
      });
    });
  });
});

fdescribe('IfStatementCompiler', () => {
  it('compiles if statements', () => {
    const ifStatement = new AST.IfStatement(
      new AST.BooleanLiteral(true),
      new AST.Block([new AST.ExprStatement(new AST.NumberLiteral(2))]),
      new AST.Block([new AST.ExprStatement(new AST.NumberLiteral(4))])
    );
    expect(compile(ifStatement)).toEqual([
      ...compile(ifStatement.condExpr),
      new Wasm.IfBlock({
        then: compile(ifStatement.thenBlock),
        else: compile(ifStatement.elseBlock),
      }),
    ]);
  });
});

describe('ModuleCompiler', () => {
  it('compiles an empty module to a module with an empty main function', () => {
    expect(new ModuleCompiler(new AST.Block([])).compile()).toEqual(
      new Wasm.Module({
        funcs: [new Wasm.Func({ exportName: 'main' })],
      })
    );
  });
  it('compiles instructions in a block into a top-level "main" function', () => {
    const num = new AST.NumberLiteral(32);
    expect(new ModuleCompiler(new AST.Block([num])).compile()).toEqual(
      new Wasm.Module({
        funcs: [
          new Wasm.Func({
            funcType: new Wasm.FuncType({
              params: [],
              results: [IR.NumberType.i32],
            }),
            exportName: 'main',
            body: [...ASTCompiler.forNode(num).compile()],
          }),
        ],
      })
    );
  });
  it('compiles functions in the top-level block to wasm functions', () => {
    const funcDecl = new AST.FuncDecl(
      'foo',
      new AST.ParameterList([
        new AST.Parameter('a', new AST.TypeExpr(new AST.TypeRef('i32'))),
      ]),
      new AST.Block([new AST.ReturnStatement(new AST.SymbolRef('a'))])
    );
    expect(new ModuleCompiler(new AST.Block([funcDecl])).compile()).toEqual(
      new Wasm.Module({
        funcs: [
          new FuncDeclCompiler(funcDecl).compile(),
          new Wasm.Func({
            funcType: new Wasm.FuncType({
              params: [],
              results: [],
            }),
            exportName: 'main',
          }),
        ],
      })
    );
  });
});
