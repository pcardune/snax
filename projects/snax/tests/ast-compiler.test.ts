import * as AST from '../snax-ast';
import * as IR from '../stack-ir';
import * as Wasm from '../wasm-ast';
import {
  BooleanLiteralCompiler,
  ExpressionCompiler,
  FuncDeclCompiler,
  IfStatementCompiler,
  ModuleCompiler,
  resolveSymbols,
  WhileStatementCompiler,
} from '../ast-compiler';

describe('ExpressionCompiler', () => {
  const { i32, f32 } = IR.NumberType;
  test('compile() combines the stack IRS of the sub expressions', () => {
    const twenty = new AST.NumberLiteral(20);
    const thirty = new AST.NumberLiteral(30);
    const expr = new AST.Expression(AST.BinaryOp.ADD, twenty, thirty);
    const compiler = ExpressionCompiler.forNode(expr);
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(twenty),
      ...compiler.compileChild(thirty),
      new IR.Add(i32),
    ]);
  });
  it('casts integers to floats', () => {
    const ten = new AST.NumberLiteral(10);
    const twelvePointThree = new AST.NumberLiteral(
      12.3,
      AST.NumberLiteralType.Float
    );
    let compiler = ExpressionCompiler.forNode(
      new AST.Expression(AST.BinaryOp.ADD, ten, twelvePointThree)
    );
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(ten),
      new IR.Convert(i32, f32),
      ...compiler.compileChild(twelvePointThree),
      new IR.Add(f32),
    ]);
    compiler = ExpressionCompiler.forNode(
      new AST.Expression(AST.BinaryOp.ADD, twelvePointThree, ten)
    );
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(twelvePointThree),
      ...compiler.compileChild(ten),
      new IR.Convert(i32, f32),
      new IR.Add(f32),
    ]);
  });
});

describe('BooleanLiteralCompiler', () => {
  it('compiles booleans to i32 consts', () => {
    expect(
      new BooleanLiteralCompiler(
        new AST.BooleanLiteral(true),
        undefined
      ).compile()
    ).toEqual([new IR.PushConst(IR.NumberType.i32, 1)]);
    expect(
      new BooleanLiteralCompiler(
        new AST.BooleanLiteral(false),
        undefined
      ).compile()
    ).toEqual([new IR.PushConst(IR.NumberType.i32, 0)]);
  });
});

describe('FuncDeclCompiler', () => {
  it('compiles functions', () => {
    const block = new AST.Block([
      new AST.ReturnStatement(new AST.NumberLiteral(3)),
    ]);
    const compiler = new FuncDeclCompiler(
      new AST.FuncDecl('foo', {
        parameters: new AST.ParameterList([
          new AST.Parameter('a', new AST.TypeRef('i32')),
          new AST.Parameter('b', new AST.TypeRef('f32')),
        ]),
        body: block,
      }),
      undefined
    );
    expect(compiler.compile()).toEqual(
      new Wasm.Func({
        id: 'foo',
        funcType: new Wasm.FuncTypeUse({
          params: [IR.NumberType.i32, IR.NumberType.f32],
          results: [IR.NumberType.i32],
        }),
        body: compiler.compileChild(block),
      })
    );
  });

  it('allocates locals with offsets that come after parameters', () => {
    const block = new AST.Block([
      new AST.LetStatement('foo', null, new AST.NumberLiteral(3)),
      new AST.LetStatement('bar', null, new AST.NumberLiteral(5)),
    ]);
    const compiler = new FuncDeclCompiler(
      new AST.FuncDecl('foo', {
        parameters: new AST.ParameterList([
          new AST.Parameter('a', new AST.TypeRef('i32')),
          new AST.Parameter('b', new AST.TypeRef('f32')),
        ]),
        body: block,
      }),
      undefined
    );
    expect(compiler.compile()).toEqual(
      new Wasm.Func({
        id: 'foo',
        funcType: new Wasm.FuncTypeUse({
          params: [IR.NumberType.i32, IR.NumberType.f32],
          results: [],
        }),
        locals: [
          new Wasm.Local(IR.NumberType.i32),
          new Wasm.Local(IR.NumberType.i32),
        ],
        body: [
          new IR.PushConst(IR.NumberType.i32, 3),
          new IR.LocalSet(2),
          new IR.PushConst(IR.NumberType.i32, 5),
          new IR.LocalSet(3),
        ],
      })
    );
  });

  it('reuses locals when it is safe', () => {
    const block = new AST.Block([
      new AST.LetStatement('var1', null, new AST.NumberLiteral(1)),
      new AST.LetStatement('var2', null, new AST.NumberLiteral(2)),
      new AST.Block([
        new AST.LetStatement('var3', null, new AST.NumberLiteral(3)),
        new AST.LetStatement('var4', null, new AST.NumberLiteral(4)),
      ]),
      new AST.LetStatement('var5', null, new AST.NumberLiteral(5)),
    ]);
    const compiler = new FuncDeclCompiler(
      new AST.FuncDecl('foo', {
        parameters: new AST.ParameterList([
          new AST.Parameter('a', new AST.TypeRef('i32')),
          new AST.Parameter('b', new AST.TypeRef('f32')),
        ]),
        body: block,
      }),
      undefined
    );
    expect(compiler.compile()).toEqual(
      new Wasm.Func({
        id: 'foo',
        funcType: new Wasm.FuncTypeUse({
          params: [IR.NumberType.i32, IR.NumberType.f32],
          results: [],
        }),
        locals: [
          new Wasm.Local(IR.NumberType.i32),
          new Wasm.Local(IR.NumberType.i32),
          new Wasm.Local(IR.NumberType.i32),
          new Wasm.Local(IR.NumberType.i32),
        ],
        body: [
          new IR.PushConst(IR.NumberType.i32, 1),
          new IR.LocalSet(2),
          new IR.PushConst(IR.NumberType.i32, 2),
          new IR.LocalSet(3),
          new IR.PushConst(IR.NumberType.i32, 3),
          new IR.LocalSet(4),
          new IR.PushConst(IR.NumberType.i32, 4),
          new IR.LocalSet(5),
          // reuses local 4
          new IR.PushConst(IR.NumberType.i32, 5),
          new IR.LocalSet(4),
        ],
      })
    );
  });
});

describe('file compilation', () => {
  let file: AST.File;
  let funcDecl: AST.FuncDecl;
  let globalDecl: AST.GlobalDecl;
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
    globalDecl = new AST.GlobalDecl('g', null, new AST.NumberLiteral(10));
    funcDecl = new AST.FuncDecl('main', { body: outerBlock });
    file = new AST.File({ funcs: [funcDecl], globals: [globalDecl] });
    resolveSymbols(file, []);
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
    it('globals appear in the files symbol table', () => {
      expect(file.symbolTable?.has('g')).toBe(true);
    });
  });
});

describe('IfStatementCompiler', () => {
  it('compiles if statements', () => {
    const ifStatement = new AST.IfStatement(
      new AST.BooleanLiteral(true),
      new AST.Block([new AST.ExprStatement(new AST.NumberLiteral(2))]),
      new AST.Block([new AST.ExprStatement(new AST.NumberLiteral(4))])
    );
    const compiler = new IfStatementCompiler(ifStatement, undefined);
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(ifStatement.condExpr),
      new Wasm.IfBlock({
        then: compiler.compileChild(ifStatement.thenBlock),
        else: compiler.compileChild(ifStatement.elseBlock),
      }),
    ]);
  });
});

describe('WhileStatementCompiler', () => {
  it('compiles while statements', () => {
    const whileStatement = new AST.WhileStatement(
      new AST.BooleanLiteral(true),
      new AST.Block([new AST.ExprStatement(new AST.NumberLiteral(2))])
    );
    const compiler = new WhileStatementCompiler(whileStatement, undefined);
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(whileStatement.condExpr),
      new Wasm.IfBlock({
        then: [
          new Wasm.LoopBlock({
            instr: [
              ...compiler.compileChild(whileStatement.thenBlock),
              ...compiler.compileChild(whileStatement.condExpr),
              new IR.BreakIf('while_0'),
            ],
            label: 'while_0',
          }),
        ],
        else: [],
      }),
    ]);
  });
});

describe('ModuleCompiler', () => {
  it('compiles an empty module to an empty wasm module', () => {
    expect(new ModuleCompiler(new AST.File({})).compile()).toEqual(
      new Wasm.Module({
        funcs: [],
        globals: [],
      })
    );
  });
  it('compiles globals in the module', () => {
    expect(
      new ModuleCompiler(
        new AST.File({
          globals: [new AST.GlobalDecl('foo', null, new AST.NumberLiteral(0))],
        })
      ).compile()
    ).toEqual(
      new Wasm.Module({
        globals: [
          new Wasm.Global({
            id: 'g0',
            globalType: new Wasm.GlobalType({
              valtype: IR.NumberType.i32,
              mut: true,
            }),
            expr: [new IR.PushConst(IR.NumberType.i32, 0)],
          }),
        ],
      })
    );
  });

  it('compiles functions in the module', () => {
    const num = new AST.NumberLiteral(32);
    const compiler = new ModuleCompiler(
      new AST.File({
        funcs: [new AST.FuncDecl('main', { body: new AST.Block([num]) })],
      })
    );
    expect(compiler.compile()).toEqual(
      new Wasm.Module({
        funcs: [
          new Wasm.Func({
            funcType: new Wasm.FuncTypeUse({
              params: [],
              results: [],
            }),
            exportName: '_start',
            id: 'main',
            body: [...compiler.compileChild(num)],
          }),
        ],
      })
    );
  });

  it('compiles string literals into data segments', () => {
    const compiler = new ModuleCompiler(
      new AST.File({
        funcs: [
          new AST.FuncDecl('main', {
            body: new AST.Block([
              new AST.ExprStatement(new AST.StringLiteral('hello world!')),
            ]),
          }),
        ],
      })
    );
    expect(compiler.compile()).toEqual(
      new Wasm.Module({
        datas: [new Wasm.Data({ datastring: 'hello world!', offset: 0 })],
        funcs: [
          new Wasm.Func({
            funcType: new Wasm.FuncTypeUse({
              params: [],
              results: [],
            }),
            exportName: '_start',
            id: 'main',
            body: [new IR.PushConst(IR.NumberType.i32, 0), new IR.Drop()],
          }),
        ],
      })
    );
  });

  it('compiles functions in the top-level block to wasm functions', () => {
    const funcDecl = new AST.FuncDecl('foo', {
      parameters: new AST.ParameterList([
        new AST.Parameter('a', new AST.TypeRef('i32')),
      ]),
      body: new AST.Block([new AST.ReturnStatement(new AST.SymbolRef('a'))]),
    });
    const compiler = new ModuleCompiler(
      new AST.File({
        funcs: [funcDecl, new AST.FuncDecl('main')],
      })
    );
    expect(compiler.compile()).toEqual(
      new Wasm.Module({
        funcs: [
          new FuncDeclCompiler(funcDecl, compiler).compile(),
          new Wasm.Func({
            funcType: new Wasm.FuncTypeUse({
              params: [],
              results: [],
            }),
            id: 'main',
            exportName: '_start',
          }),
        ],
      })
    );
  });
});
