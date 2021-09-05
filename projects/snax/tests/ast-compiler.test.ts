import * as AST from '../spec-gen';
import * as IR from '../stack-ir';
import * as Wasm from '../wasm-ast';
import {
  BooleanLiteralCompiler,
  BinaryExprCompiler,
  FuncDeclCompiler,
  IfStatementCompiler,
  ModuleCompiler,
  WhileStatementCompiler,
  BlockCompiler,
  IRCompiler,
} from '../ast-compiler';
import { makeFunc, makeNum } from './ast-util';
import { BinaryOp } from '../snax-ast';
import { resolveSymbols, SymbolRefMap } from '../symbol-resolution';
import { OrderedMap } from '../../utils/data-structures/OrderedMap';

describe('ExpressionCompiler', () => {
  const { i32, f32 } = IR.NumberType;
  test('compile() combines the stack IRS of the sub expressions', () => {
    const twenty = makeNum(20);
    const thirty = makeNum(30);
    const expr = AST.makeBinaryExpr(BinaryOp.ADD, twenty, thirty);
    const compiler = BinaryExprCompiler.forNode(expr);
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(twenty),
      ...compiler.compileChild(thirty),
      new IR.Add(i32),
    ]);
  });
  it('casts integers to floats', () => {
    const ten = makeNum(10);
    const twelvePointThree = makeNum(12.3, 'float');
    let compiler = BinaryExprCompiler.forNode(
      AST.makeBinaryExpr(BinaryOp.ADD, ten, twelvePointThree)
    );
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(ten),
      new IR.Convert(i32, f32),
      ...compiler.compileChild(twelvePointThree),
      new IR.Add(f32),
    ]);
    compiler = BinaryExprCompiler.forNode(
      AST.makeBinaryExpr(BinaryOp.ADD, twelvePointThree, ten)
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
      new BooleanLiteralCompiler(AST.makeBooleanLiteral(true)).compile()
    ).toEqual([new IR.PushConst(IR.NumberType.i32, 1)]);
    expect(
      new BooleanLiteralCompiler(AST.makeBooleanLiteral(false)).compile()
    ).toEqual([new IR.PushConst(IR.NumberType.i32, 0)]);
  });
});

function funcCompiler(func: AST.FuncDecl) {
  return new FuncDeclCompiler(func, undefined, resolveSymbols(func));
}

describe('FuncDeclCompiler', () => {
  it('compiles functions', () => {
    const block = AST.makeBlock([AST.makeReturnStatement(makeNum(3))]);
    const compiler = funcCompiler(
      makeFunc(
        'foo',
        [
          AST.makeParameter('a', AST.makeTypeRef('i32')),
          AST.makeParameter('b', AST.makeTypeRef('f32')),
        ],
        block
      )
    );
    expect(compiler.compile()).toEqual(
      new Wasm.Func({
        id: 'foo',
        funcType: new Wasm.FuncTypeUse({
          params: [IR.NumberType.i32, IR.NumberType.f32],
          results: [IR.NumberType.i32],
        }),
        body: new BlockCompiler(block, compiler, compiler.context).compile(),
      })
    );
  });

  it('allocates locals with offsets that come after parameters', () => {
    const block = AST.makeBlock([
      AST.makeLetStatement('foo', null, makeNum(3)),
      AST.makeLetStatement('bar', null, makeNum(5)),
    ]);
    const compiler = funcCompiler(
      makeFunc(
        'someFunc',
        [
          AST.makeParameter('a', AST.makeTypeRef('i32')),
          AST.makeParameter('b', AST.makeTypeRef('f32')),
        ],
        block
      )
    );
    expect(compiler.compile()).toEqual(
      new Wasm.Func({
        id: 'someFunc',
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
    const block = AST.makeBlock([
      AST.makeLetStatement('var1', null, makeNum(1)),
      AST.makeLetStatement('var2', null, makeNum(2)),
      AST.makeBlock([
        AST.makeLetStatement('var3', null, makeNum(3)),
        AST.makeLetStatement('var4', null, makeNum(4)),
      ]),
      AST.makeLetStatement('var5', null, makeNum(5)),
    ]);
    const compiler = funcCompiler(
      makeFunc(
        'foo',
        [
          AST.makeParameter('a', AST.makeTypeRef('i32')),
          AST.makeParameter('b', AST.makeTypeRef('f32')),
        ],
        block
      )
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

function stubContext() {
  return { refMap: new OrderedMap() as SymbolRefMap };
}

describe('IfStatementCompiler', () => {
  it('compiles if statements', () => {
    const ifStatement = AST.makeIfStatement(
      AST.makeBooleanLiteral(true),
      AST.makeBlock([AST.makeExprStatement(makeNum(2))]),
      AST.makeBlock([AST.makeExprStatement(makeNum(4))])
    );
    const compiler = new IfStatementCompiler(
      ifStatement,
      undefined,
      stubContext()
    );
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(ifStatement.fields.condExpr),
      new Wasm.IfBlock({
        then: compiler.compileChild(ifStatement.fields.thenBlock),
        else: compiler.compileChild(ifStatement.fields.elseBlock),
      }),
    ]);
  });
});

describe('WhileStatementCompiler', () => {
  it('compiles while statements', () => {
    const whileStatement = AST.makeWhileStatement(
      AST.makeBooleanLiteral(true),
      AST.makeBlock([AST.makeExprStatement(makeNum(2))])
    );
    const compiler = new WhileStatementCompiler(
      whileStatement,
      undefined,
      stubContext()
    );
    expect(compiler.compile()).toEqual([
      ...compiler.compileChild(whileStatement.fields.condExpr),
      new Wasm.IfBlock({
        then: [
          new Wasm.LoopBlock({
            instr: [
              ...compiler.compileChild(whileStatement.fields.thenBlock),
              ...compiler.compileChild(whileStatement.fields.condExpr),
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
    expect(new ModuleCompiler(AST.makeFile([], [])).compile()).toEqual(
      new Wasm.Module({
        funcs: [],
        globals: [],
      })
    );
  });
  it('compiles globals in the module', () => {
    expect(
      new ModuleCompiler(
        AST.makeFile([], [AST.makeGlobalDecl('foo', null, makeNum(0))])
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
    const num = AST.makeExprStatement(makeNum(32));
    const file = AST.makeFile([makeFunc('main', [], [num])], []);
    const compiler = new ModuleCompiler(file);
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
            body: IRCompiler.forNode(num, compiler, {
              refMap: compiler.refMap!,
            }).compile(),
          }),
        ],
      })
    );
  });

  it('compiles string literals into data segments', () => {
    const compiler = new ModuleCompiler(
      AST.makeFile(
        [
          makeFunc(
            'main',
            [],
            [AST.makeExprStatement(AST.makeStringLiteral('hello world!'))]
          ),
        ],
        []
      )
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
    const funcDecl = makeFunc(
      'foo',
      [AST.makeParameter('a', AST.makeTypeRef('i32'))],
      [AST.makeReturnStatement(AST.makeSymbolRef('a'))]
    );
    const file = AST.makeFile([funcDecl, makeFunc('main')], []);
    const compiler = new ModuleCompiler(file);
    expect(compiler.compile()).toEqual(
      new Wasm.Module({
        funcs: [
          new FuncDeclCompiler(funcDecl, compiler, {
            refMap: compiler.refMap!,
          }).compile(),
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
