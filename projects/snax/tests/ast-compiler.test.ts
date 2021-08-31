import * as AST from '../snax-ast';
import * as IR from '../stack-ir';
import * as Wasm from '../wasm-ast';
import { ASTCompiler, FuncDeclCompiler, ModuleCompiler } from '../ast-compiler';

describe('ExpressionCompiler', () => {
  const { i32, f32 } = IR.NumberType;
  test('compile() combines the stack IRS of the sub expressions', () => {
    const twenty = new AST.NumberLiteral(20);
    const thirty = new AST.NumberLiteral(30);
    const expr = new AST.Expression(AST.BinaryOp.ADD, twenty, thirty);
    const compiler = ASTCompiler.forNode(expr);
    expect(compiler.compile()).toEqual([
      ...twenty.toStackIR(),
      ...thirty.toStackIR(),
      new IR.Add(i32),
    ]);
  });
  it('casts integers to floats', () => {
    const ten = new AST.NumberLiteral(10);
    const twelvePointThree = new AST.NumberLiteral(
      12.3,
      AST.NumberLiteralType.Float
    );
    const compiler = ASTCompiler.forNode(
      new AST.Expression(AST.BinaryOp.ADD, ten, twelvePointThree)
    );
    expect(compiler.compile()).toEqual([
      ...ten.toStackIR(),
      new IR.Convert(i32, f32),
      ...twelvePointThree.toStackIR(),
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
