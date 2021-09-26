import * as AST from './spec-gen.js';
import { SNAXParser } from './snax-parser.js';
import {
  BaseType,
  FuncType,
  Intrinsics,
  NumericalType,
  PointerType,
  RecordType,
  TupleType,
} from './snax-types.js';
import * as IR from './stack-ir.js';
import * as Wasm from './wasm-ast.js';
import { BinOp, UnaryOp } from './snax-ast.js';
import { children } from './spec-util.js';
import { ResolvedTypeMap, resolveTypes } from './type-resolution.js';
import { resolveSymbols, SymbolRefMap } from './symbol-resolution.js';
import {
  AllocationMap,
  Area,
  FuncAllocations,
  FuncStorageLocation,
  GlobalStorageLocation,
  LocalAllocation,
  LocalStorageLocation,
  ModuleAllocator,
  resolveMemory,
  StackStorageLocation,
} from './memory-resolution.js';
import { desugar } from './desugar.js';

export abstract class ASTCompiler<
  Root extends AST.ASTNode = AST.ASTNode,
  Output = unknown,
  Context = unknown
> {
  root: Root;
  context: Context;

  constructor(root: Root, context: Context) {
    this.root = root;
    this.context = context;
  }

  abstract compile(): Output;
}

export type CompilesToIR = AST.Expression | AST.Statement | AST.LiteralExpr;

type AllocationMapContext = {
  allocationMap: AllocationMap;
};

export type Runtime = {
  malloc: FuncStorageLocation;
  stackPointer: GlobalStorageLocation;
};

type FuncDeclContext = AllocationMapContext & {
  refMap: SymbolRefMap;
  typeCache: ResolvedTypeMap;
  funcAllocs: FuncAllocations;
  runtime: Runtime;
};

export type IRCompilerContext = Pick<
  FuncDeclContext,
  'refMap' | 'typeCache' | 'runtime' | 'allocationMap' | 'funcAllocs'
>;
export abstract class IRCompiler<Root extends AST.ASTNode> extends ASTCompiler<
  Root,
  IR.Instruction[],
  IRCompilerContext
> {
  static forNode(
    node: CompilesToIR,
    context: IRCompilerContext
  ): IRCompiler<AST.ASTNode> {
    switch (node.name) {
      case 'CastExpr':
        return new CastExprCompiler(node, context);
      case 'BinaryExpr':
        return new BinaryExprCompiler(node, context);
      case 'CallExpr':
        return new CallExprCompiler(node, context);
      case 'MemberAccessExpr':
        return new MemberAccessExprCompiler(node, context);
      case 'ExprStatement':
        return new ExprStatementCompiler(node, context);
      case 'NumberLiteral':
      case 'CharLiteral':
        return new NumberLiteralCompiler(node, context);
      case 'Block':
        return new BlockCompiler(node, context);
      case 'RegStatement':
        return new RegStatementCompiler(node, context);
      case 'LetStatement':
        return new LetStatementCompiler(node, context);
      case 'IfStatement':
        return new IfStatementCompiler(node, context);
      case 'SymbolRef':
        return new SymbolRefCompiler(node, context);
      case 'BooleanLiteral':
        return new BooleanLiteralCompiler(node, context);
      case 'ArrayLiteral':
        return new ArrayLiteralCompiler(node, context);
      case 'DataLiteral':
        return new DataLiteralCompiler(node, context);
      case 'StructLiteral':
        return new StructLiteralCompiler(node, context);
      case 'ArgList':
        return new ArgListCompiler(node, context);
      case 'WhileStatement':
        return new WhileStatementCompiler(node, context);
      case 'ReturnStatement':
        return new ReturnStatementCompiler(node, context);
      case 'UnaryExpr':
        return new UnaryExprCompiler(node, context);
    }
    throw new Error(
      `ASTCompiler: No compiler available for node ${(node as any).name}`
    );
  }
  compileChild<N extends AST.Expression | AST.Statement>(child: N) {
    return IRCompiler.forNode(child, this.context).compile();
  }

  getLocationForSymbolRef(node: AST.SymbolRef) {
    const symbolRecord = this.context.refMap.get(node);
    if (!symbolRecord) {
      throw new Error(
        `ASTCompiler: can't compile reference to unresolved symbol ${node.fields.symbol}`
      );
    }
    const location = this.context.allocationMap.get(symbolRecord.declNode);
    if (!location) {
      throw new Error(
        `ASTCompiler: Can't compile reference to unlocated symbol ${node.fields.symbol}`
      );
    }
    return location;
  }

  resolveType(node: AST.ASTNode) {
    return this.context.typeCache.get(node);
  }
}

class ReturnStatementCompiler extends IRCompiler<AST.ReturnStatement> {
  compile() {
    return [
      ...(this.root.fields.expr
        ? this.compileChild(this.root.fields.expr)
        : []),
      new IR.Return(),
    ];
  }
}

export class BlockCompiler extends IRCompiler<AST.Block> {
  liveLocals: LocalAllocation[] = [];

  compile(): IR.Instruction[] {
    const instr: IR.Instruction[] = [];
    this.root.fields.statements
      .filter((astNode) => !AST.isFuncDecl(astNode))
      .forEach((astNode) =>
        instr.push(...IRCompiler.forNode(astNode, this.context).compile())
      );
    return instr;
  }
}

export type ModuleCompilerOptions = {
  includeRuntime?: boolean;
  includeWASI?: boolean;
};
export class ModuleCompiler extends ASTCompiler<AST.File, Wasm.Module> {
  options: Required<ModuleCompilerOptions>;
  refMap?: SymbolRefMap;
  typeCache?: ResolvedTypeMap;
  moduleAllocator = new ModuleAllocator();

  constructor(file: AST.File, options?: ModuleCompilerOptions) {
    super(file, undefined);
    this.options = {
      includeRuntime: true,
      includeWASI: false,
      ...options,
    };
  }

  compile(): Wasm.Module {
    desugar(this.root);

    const stackPointerLiteral = AST.makeNumberLiteral(0, 'int', 'usize');
    let stackPointerGlobal = AST.makeGlobalDeclWith({
      symbol: '#SP',
      expr: stackPointerLiteral,
    });
    this.root.fields.globals.push(stackPointerGlobal);

    let heapStartLiteral = AST.makeNumberLiteralWith({
      value: 0,
      numberType: 'int',
      explicitType: 'usize',
    });
    let mallocDecl: AST.FuncDecl | undefined;
    if (this.options.includeRuntime) {
      let runtimeAST = SNAXParser.parseStrOrThrow(`
        global next = 0;
        func malloc(numBytes:usize) {
          let startAddress = next;
          next = next + numBytes;
          return startAddress;
        }
        struct String {
          buffer: &u8;
          length: usize;
        }
      `);
      if (AST.isFile(runtimeAST)) {
        for (const runtimeFunc of runtimeAST.fields.funcs) {
          const { symbol } = runtimeFunc.fields;
          if (symbol !== 'main') {
            this.root.fields.funcs.push(runtimeFunc);
            if (symbol === 'malloc') {
              mallocDecl = runtimeFunc;
            }
          }
        }
        runtimeAST.fields.globals[0].fields.expr = heapStartLiteral;
        this.root.fields.globals.push(...runtimeAST.fields.globals);
        this.root.fields.decls.push(...runtimeAST.fields.decls);
      } else {
        throw new Error(`this should never happen`);
      }
    }

    const { refMap } = resolveSymbols(this.root);
    this.refMap = refMap;

    const typeCache = resolveTypes(this.root, refMap);
    this.typeCache = typeCache;

    const moduleAllocator = resolveMemory(this.root, typeCache);
    this.moduleAllocator = moduleAllocator;

    // initialize the heap start pointer to the last memIndex
    // that got used.
    const numPagesOfMemory = 1;
    heapStartLiteral.fields.value = moduleAllocator.memIndex;

    let runtime: Runtime;
    const stackPointer =
      moduleAllocator.allocationMap.getGlobalOrThrow(stackPointerGlobal);

    if (this.options.includeRuntime) {
      if (!mallocDecl) {
        throw new Error(`I need a decl for malloc`);
      }
      let malloc = moduleAllocator.allocationMap.getFuncOrThrow(mallocDecl);
      runtime = {
        malloc,
        stackPointer,
      };
    } else {
      // TODO, find a better alternative for optional compilation
      runtime = {
        malloc: { area: Area.FUNCS, offset: 1000, id: 'f1000:malloc' },
        stackPointer,
      };
    }

    let mainFunc: { decl: AST.FuncDecl; wasmFunc: Wasm.Func } | undefined =
      undefined;
    const funcs: Wasm.Func[] = [];
    for (const func of this.root.fields.funcs) {
      const wasmFunc = new FuncDeclCompiler(func, {
        refMap,
        typeCache,
        allocationMap: moduleAllocator.allocationMap,
        funcAllocs: moduleAllocator.getLocalsForFunc(func),
        runtime,
      }).compile();
      if (func.fields.symbol === 'main') {
        mainFunc = { decl: func, wasmFunc };
      }
      funcs.push(wasmFunc);
    }
    if (mainFunc) {
      const mainFuncLocation = moduleAllocator.allocationMap.getFuncOrThrow(
        mainFunc.decl
      );
      funcs.push(
        new Wasm.Func({
          funcType: new Wasm.FuncTypeUse({
            params: [],
            results: mainFunc.wasmFunc.fields.funcType.fields.results,
          }),
          exportName: '_start',
          body: [
            new IR.PushConst(
              IR.NumberType.i32,
              numPagesOfMemory * Wasm.PAGE_SIZE
            ),
            globalSet(runtime.stackPointer),
            call(mainFuncLocation),
          ],
        })
      );
    }

    const globals: Wasm.Global[] = this.root.fields.globals.map((global, i) => {
      const location = moduleAllocator.allocationMap.getGlobalOrThrow(global);
      return new Wasm.Global({
        id: location.id,
        globalType: new Wasm.GlobalType({
          valtype: typeCache.get(global).toValueType(),
          mut: true,
        }),
        expr: IRCompiler.forNode(global.fields.expr, {
          refMap,
          typeCache,
          allocationMap: moduleAllocator.allocationMap,
          get funcAllocs(): FuncAllocations {
            throw new Error(
              `global expressions should not be attempting to access stack variables`
            );
          },
          runtime: runtime,
        }).compile(),
      });
    });

    const datas: Wasm.Data[] = [];
    for (const loc of moduleAllocator.allocationMap.values()) {
      if (loc.area === 'data') {
        datas.push(
          new Wasm.Data({
            id: loc.id,
            datastring: loc.data,
            offset: loc.memIndex,
          })
        );
      }
    }

    const imports: Wasm.Import[] = [];
    for (const decl of this.root.fields.decls) {
      if (AST.isExternDecl(decl)) {
        imports.push(
          ...new ExternDeclCompiler(decl, {
            typeCache,
            allocationMap: moduleAllocator.allocationMap,
          }).compile()
        );
      }
    }

    return new Wasm.Module({
      funcs,
      globals,
      imports: imports.length > 0 ? imports : undefined,
      exports: [
        new Wasm.Export({ name: 'memory', exportType: 'memory', idOrIndex: 0 }),
        new Wasm.Export({
          name: 'stackPointer',
          exportType: 'global',
          idOrIndex: stackPointer.id,
        }),
      ],
      memory: { min: numPagesOfMemory },
      datas,
    });
  }
}

export class ExternDeclCompiler extends ASTCompiler<
  AST.ExternDecl,
  Wasm.Import[],
  { typeCache: ResolvedTypeMap } & AllocationMapContext
> {
  compile(): Wasm.Import[] {
    return this.root.fields.funcs.map((func) => {
      const funcType = this.context.typeCache.get(func);
      if (!(funcType instanceof FuncType)) {
        throw new Error(`Unexpected type for funcDecl: ${funcType.name}`);
      }
      const location = this.context.allocationMap.getFuncOrThrow(func);
      return new Wasm.Import({
        mod: this.root.fields.libName,
        nm: func.fields.symbol,
        importdesc: {
          kind: 'func',
          id: location.id,
          typeuse: {
            params: func.fields.parameters.fields.parameters.map((param) => ({
              valtype: this.context.typeCache.get(param).toValueType(),
            })),
            results:
              funcType.returnType === Intrinsics.void
                ? []
                : [funcType.returnType.toValueType()],
          },
        },
      });
    });
  }
}

export class FuncDeclCompiler extends ASTCompiler<
  AST.FuncDecl,
  Wasm.Func,
  FuncDeclContext
> {
  preamble(): IR.Instruction[] {
    let stackSpace = 0;
    let last =
      this.context.funcAllocs.stack[this.context.funcAllocs.stack.length - 1];
    if (last) {
      stackSpace = last.offset + last.dataType.numBytes;
    }
    const instr: IR.Instruction[] = [];
    if (stackSpace > 0) {
      // allocate space for stack variables
      instr.push(
        globalGet(this.context.runtime.stackPointer),
        new IR.PushConst(IR.NumberType.i32, stackSpace),
        new IR.Sub(IR.NumberType.i32),
        globalSet(this.context.runtime.stackPointer)
      );

      // set arp local to the stack pointer
      instr.push(
        globalGet(this.context.runtime.stackPointer),
        localSet(this.context.funcAllocs.arp)
      );
    }
    return instr;
  }

  compile(): Wasm.Func {
    const funcType = this.context.typeCache.get(this.root);
    if (!(funcType instanceof FuncType)) {
      throw new Error('unexpected type of function');
    }

    const params = this.root.fields.parameters.fields.parameters.map(
      (param) => {
        const paramType = this.context.typeCache.get(param);
        const location = this.context.allocationMap.getLocalOrThrow(param);
        return { valtype: paramType.toValueType(), id: location.id };
      }
    );

    const results =
      funcType.returnType === Intrinsics.void
        ? []
        : [funcType.returnType.toValueType()];

    const body = [
      ...this.preamble(),
      ...new BlockCompiler(this.root.fields.body, this.context).compile(),
    ];
    const location = this.context.allocationMap.getFuncOrThrow(this.root);
    return new Wasm.Func({
      id: location.id,
      body,
      funcType: new Wasm.FuncTypeUse({
        params,
        results,
      }),
      locals: this.context.funcAllocs.locals,
    });
  }
}

class RegStatementCompiler extends IRCompiler<AST.RegStatement> {
  compile(): IR.Instruction[] {
    const location = this.context.allocationMap.getLocalOrThrow(
      this.root,
      'reg statements need a local'
    );
    const { expr } = this.root.fields;
    const exprType = this.resolveType(expr);
    exprType.toValueType();
    return [...this.compileChild(expr), localSet(location)];
  }
}

class LetStatementCompiler extends IRCompiler<AST.LetStatement> {
  compile(): IR.Instruction[] {
    const location = this.context.allocationMap.getStackOrThrow(
      this.root,
      'let statements need a local'
    );
    const { expr } = this.root.fields;
    const type = this.resolveType(this.root);

    if (expr) {
      return [
        localGet(this.context.funcAllocs.arp),
        ...this.compileChild(expr),
        new IR.MemoryStore(type.toValueType(), {
          offset: location.offset,
          bytes: type.numBytes,
        }),
      ];
    } else {
      // no explicit intializer expression, so just zero it out
      const instr = [];

      // push d - offset to start filling from
      instr.push(localGet(this.context.funcAllocs.arp));
      if (location.offset > 0) {
        instr.push(
          new IR.PushConst(IR.NumberType.i32, location.offset),
          new IR.Add(IR.NumberType.i32)
        );
      }

      // push val - byte value to fill with
      instr.push(new IR.PushConst(IR.NumberType.i32, 0));

      // push n - number of bytes to fill
      instr.push(new IR.PushConst(IR.NumberType.i32, type.numBytes));

      // memory.fill
      instr.push(new IR.MemoryFill());
      return instr;
    }
  }
}

export class IfStatementCompiler extends IRCompiler<AST.IfStatement> {
  compile(): IR.Instruction[] {
    return [
      ...this.compileChild(this.root.fields.condExpr),
      new Wasm.IfBlock({
        then: this.compileChild(this.root.fields.thenBlock),
        else: this.compileChild(this.root.fields.elseBlock),
      }),
    ];
  }
}

export class WhileStatementCompiler extends IRCompiler<AST.WhileStatement> {
  compile() {
    return [
      ...this.compileChild(this.root.fields.condExpr),
      new Wasm.IfBlock({
        then: [
          new Wasm.LoopBlock({
            instr: [
              ...this.compileChild(this.root.fields.thenBlock),
              ...this.compileChild(this.root.fields.condExpr),
              new IR.BreakIf('while_0'),
            ],
            label: 'while_0',
          }),
        ],
        else: [],
      }),
    ];
  }
}

class SymbolRefCompiler extends IRCompiler<AST.SymbolRef> {
  compile(): IR.Instruction[] {
    const location = this.getLocationForSymbolRef(this.root);
    const type = this.resolveType(this.root);
    switch (location.area) {
      case 'locals':
        return [localGet(location)];
      case 'globals':
        return [globalGet(location)];
      case 'stack':
        return [
          localGet(this.context.funcAllocs.arp),
          new IR.MemoryLoad(type.toValueType(), { offset: location.offset }),
        ];
      default:
        throw new Error(
          `SymbolRefCompiler: don't know how to compile reference to a location in ${location.area}`
        );
    }
  }
}

export class BinaryExprCompiler extends IRCompiler<AST.BinaryExpr> {
  private pushNumberOps(left: AST.Expression, right: AST.Expression) {
    let targetType = this.matchTypes(left, right);
    return [
      ...this.compileChild(left),
      ...this.convert(left, targetType),
      ...this.compileChild(right),
      ...this.convert(right, targetType),
    ];
  }
  private convert(child: AST.Expression, targetType: IR.NumberType) {
    const childType = this.resolveType(child).toValueType();
    if (childType === targetType) {
      return [];
    }
    if (IR.isIntType(childType) && IR.isFloatType(targetType)) {
      return [new IR.Convert(childType, targetType)];
    }
    throw new Error(`Can't convert from a ${childType} to a ${targetType}`);
  }

  private matchTypes(left: AST.Expression, right: AST.Expression) {
    const leftType = this.resolveType(left);
    const rightType = this.resolveType(right);
    let targetType = leftType;
    if (
      leftType instanceof NumericalType &&
      rightType instanceof NumericalType
    ) {
      if (rightType.interpretation === 'float') {
        targetType = rightType;
      }
    } else if (leftType === Intrinsics.bool && rightType === Intrinsics.bool) {
    } else {
      throw new Error("pushNumberOps: don't know how to cast to number");
    }
    return targetType.toValueType();
  }
  private OpCompilers: Record<
    string,
    (left: AST.Expression, right: AST.Expression) => IR.Instruction[]
  > = {
    [BinOp.ADD]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.Add(this.matchTypes(left, right)),
    ],
    [BinOp.SUB]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.Sub(this.matchTypes(left, right)),
    ],
    [BinOp.MUL]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.Mul(this.matchTypes(left, right)),
    ],
    [BinOp.DIV]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.Div(this.matchTypes(left, right)),
    ],
    [BinOp.REM]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.Rem(this.matchTypes(left, right)),
    ],
    [BinOp.EQUAL_TO]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.Equal(this.matchTypes(left, right)),
    ],
    [BinOp.NOT_EQUAL_TO]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.NotEqual(this.matchTypes(left, right)),
    ],
    [BinOp.LESS_THAN]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.LessThan(this.matchTypes(left, right)),
    ],
    [BinOp.GREATER_THAN]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.GreaterThan(this.matchTypes(left, right)),
    ],
    [BinOp.LOGICAL_AND]: (left: AST.Expression, right: AST.Expression) => [
      ...this.compileChild(left),
      ...this.compileChild(right),
      new IR.And(Intrinsics.bool.toValueType()),
    ],
    [BinOp.LOGICAL_OR]: (left: AST.Expression, right: AST.Expression) => [
      ...this.compileChild(left),
      ...this.compileChild(right),
      new IR.Or(Intrinsics.bool.toValueType()),
    ],
    [BinOp.ASSIGN]: (left: AST.Expression, right: AST.Expression) => {
      const leftType = this.resolveType(left);
      const rightType = this.resolveType(right);
      if (leftType !== rightType) {
        throw new Error(
          `ASSIGN: Can't assign value of type ${rightType} to symbol of type ${leftType}`
        );
      }
      if (AST.isSymbolRef(left)) {
        const location = this.getLocationForSymbolRef(left);
        switch (location.area) {
          case 'locals':
            return [...this.compileChild(right), localTee(location)];
          case 'globals':
            return [
              ...this.compileChild(right),
              globalSet(location),
              globalGet(location),
            ];
          case 'stack':
            return [
              localGet(this.context.funcAllocs.arp),
              ...this.compileChild(right),
              new IR.MemoryStore(rightType.toValueType(), {
                offset: location.offset,
              }),
              localGet(this.context.funcAllocs.arp),
              new IR.MemoryLoad(rightType.toValueType(), {
                offset: location.offset,
              }),
            ];
          default:
            throw new Error(
              `ASSIGN: don't know how to compile assignment to symbol located in ${location.area}`
            );
        }
      } else if (
        AST.isBinaryExpr(left) &&
        left.fields.op === BinOp.ARRAY_INDEX
      ) {
        let valueType = leftType.toValueType();
        const arrayExpr = left;
        let calcPointer = [
          ...this.compileChild(arrayExpr.fields.left),
          ...this.compileChild(arrayExpr.fields.right),
          new IR.PushConst(valueType, leftType.numBytes),
          new IR.Mul(valueType),
          new IR.Add(valueType),
        ];
        let calcValue = this.compileChild(right);
        let tempLocation = this.context.allocationMap.getLocalOrThrow(
          this.root,
          'Array Indexing requires a temporary'
        );
        return [
          ...calcPointer,
          ...calcValue,
          localTee(tempLocation),
          new IR.MemoryStore(valueType, {
            offset: 0,
            align: leftType.numBytes,
            bytes: leftType.numBytes,
          }),
          localGet(tempLocation),
        ];
      } else {
        throw new Error(
          `ASSIGN: Can't assign to something that is not a resolved symbol or a memory address`
        );
      }
    },
    [BinOp.ARRAY_INDEX]: (
      refExpr: AST.Expression,
      indexExpr: AST.Expression
    ) => {
      const refExprType = this.resolveType(refExpr);
      if (!(refExprType instanceof PointerType)) {
        throw new Error(
          `Don't know how to compile indexing operation for a ${refExprType.name}`
        );
      }
      let align = refExprType.toType.numBytes;
      const valueType = refExprType.toValueType();
      return [
        ...this.compileChild(refExpr),
        ...this.compileChild(indexExpr),
        new IR.PushConst(valueType, align),
        new IR.Mul(valueType),
        new IR.Add(valueType),
        new IR.MemoryLoad(valueType, {
          offset: 0,
          align,
          bytes: align,
        }),
      ];
    },
    [BinOp.CAST]: (left: AST.Expression, right: AST.Expression) => {
      throw new Error(`CAST: don't know how to cast values yet`);
    },
  };
  compile(): IR.Instruction[] {
    return this.OpCompilers[this.root.fields.op](
      this.root.fields.left,
      this.root.fields.right
    );
  }
}

class MemberAccessExprCompiler extends IRCompiler<AST.MemberAccessExpr> {
  compile() {
    const { left, right } = this.root.fields;

    const leftType = this.context.typeCache.get(left);
    if (leftType instanceof PointerType) {
      let elem: { type: BaseType; offset: number };
      if (
        leftType.toType instanceof TupleType &&
        right.name === 'NumberLiteral'
      ) {
        const index = right.fields.value;
        elem = leftType.toType.elements[index];
        if (!elem) {
          throw new Error(
            `Invalid index ${index} for tuple ${leftType.toType.name}`
          );
        }
      } else if (
        leftType.toType instanceof RecordType &&
        right.name === 'SymbolRef'
      ) {
        elem = leftType.toType.fields.get(right.fields.symbol)!;
        if (!elem) {
          throw new Error(
            `Invalid prop ${right.fields.symbol} for ${leftType.toType.name}`
          );
        }
      } else {
        throw new Error(
          `Don't know how to lookup ${right.name} on a ${leftType.name}`
        );
      }
      let sign = undefined;
      if (elem.type instanceof NumericalType) {
        sign = elem.type.signed ? IR.Sign.Signed : IR.Sign.Unsigned;
      }
      return [
        ...this.compileChild(left),
        new IR.MemoryLoad(elem.type.toValueType(), {
          offset: elem.offset,
          align: elem.type.numBytes,
          bytes: elem.type.numBytes,
          sign,
        }),
      ];
    }
    throw new Error(
      `MemberAccessExprCompiler: don't know how to compile this...`
    );
  }
}

class CallExprCompiler extends IRCompiler<AST.CallExpr> {
  compile() {
    const { left, right } = this.root.fields;
    const leftType = this.context.typeCache.get(left);
    if (leftType instanceof TupleType) {
      // we are constructing a tuple
      const { location, instr } = compileStackPush(this, leftType.numBytes);
      for (const [i, arg] of right.fields.args.entries()) {
        if (i >= leftType.elements.length) {
          throw new Error(`too many arguments specifed for tuple constructor`);
        }
        const elem = leftType.elements[i];
        instr.push(
          localGet(location),
          ...this.compileChild(arg),
          new IR.MemoryStore(elem.type.toValueType(), {
            offset: elem.offset,
            align: elem.type.numBytes,
            bytes: elem.type.numBytes,
          })
        );
      }
      instr.push(localGet(location));
      return instr;
    } else if (AST.isSymbolRef(left)) {
      const location = this.getLocationForSymbolRef(left);
      if (location.area !== Area.FUNCS) {
        throw new Error(
          `Expected ${left.fields.symbol} to resolve to a function`
        );
      }
      return [
        ...this.compileChild(right),
        call(location),
        localGet(this.context.funcAllocs.arp),
        globalSet(this.context.runtime.stackPointer),
      ];
    } else {
      throw new Error(
        `ExpressionCompiler: Can't call unresolved symbol ${left}`
      );
    }
  }
}

class CastExprCompiler extends IRCompiler<AST.CastExpr> {
  compile() {
    const { force } = this.root.fields;
    const sourceType = this.context.typeCache.get(this.root.fields.expr);
    const destType = this.context.typeCache.get(this.root.fields.typeExpr);
    const instr = this.compileChild(this.root.fields.expr);
    if (destType instanceof NumericalType) {
      if (sourceType instanceof NumericalType) {
        const destValueType = destType.toValueType();
        const sourceValueType = sourceType.toValueType();

        if (IR.isFloatType(destValueType)) {
          // conversion to floats
          if (IR.isIntType(sourceValueType)) {
            instr.push(
              new IR.Convert(
                sourceValueType,
                destValueType,
                sourceType.signed ? IR.Sign.Signed : IR.Sign.Unsigned
              )
            );
          } else if (destValueType !== sourceValueType) {
            if (destValueType === 'f64' && sourceValueType === 'f32') {
              instr.push(new IR.Promote());
            } else if (force) {
              throw new Error(`NotImplemented: forced float demotion`);
            } else {
              throw new Error(`I don't implicitly demote floats`);
            }
          } else {
            instr.push(new IR.Nop());
          }
        } else {
          // conversion to integers
          if (IR.isFloatType(sourceValueType)) {
            if (force) {
              throw new Error(`NotImplemented: truncate floats to int`);
            } else {
              throw new Error(`I don't implicitly truncate floats`);
            }
          } else if (sourceType.numBytes > destType.numBytes) {
            if (force) {
              instr.push(
                new IR.PushConst(
                  sourceType.toValueType(),
                  (1 << (destType.numBytes * 8)) - 1
                ),
                new IR.And(sourceType.toValueType())
              );
            } else {
              throw new Error(`I don't implicitly wrap to smaller sizes`);
            }
          } else if (sourceType.signed && !destType.signed) {
            if (force) {
              throw new Error(`NotImplemented: forced dropping of sign`);
            } else {
              throw new Error(`I don't implicitly drop signs`);
            }
          } else {
            instr.push(new IR.Nop());
          }
        }
      } else if (sourceType instanceof PointerType) {
        if (
          destType.interpretation === 'int' &&
          destType.numBytes < sourceType.numBytes
        ) {
          throw new Error(
            `${destType} doesn't hold enough bytes for a pointer`
          );
        } else {
          instr.push(new IR.Nop());
        }
      } else {
        throw new Error(`Don't know how to cast from ${sourceType.name} yet`);
      }

      return instr;
    } else if (destType instanceof PointerType) {
      if (sourceType.equals(Intrinsics.i32) && force) {
        instr.push(new IR.Nop());
      } else {
        throw new Error(
          `I only convert i32s to pointer types, and only when forced.`
        );
      }
      return instr;
    }
    throw new Error(`Don't know how to cast to ${destType.name} yet`);
  }
}

class UnaryExprCompiler extends IRCompiler<AST.UnaryExpr> {
  compile() {
    switch (this.root.fields.op) {
      case UnaryOp.ADDR_OF: {
        const { expr } = this.root.fields;
        const exprType = this.resolveType(expr);

        let location = this.context.allocationMap.get(expr);
        const instr: IR.Instruction[] = [];
        if (!location) {
          // the expr doesn't resolve to a location, so it must be a literal?
          // TODO: maybe make a location called "immediate" for items that are
          // in web assembly's implicit stack?

          // We need to put it into the linear memory stack
          const stackPush = compileStackPush(this, exprType.numBytes);
          location = stackPush.location;
          instr.push(...stackPush.instr);
          instr.push(
            localGet(location),
            ...this.compileChild(expr),
            new IR.MemoryStore(exprType.toValueType()),
            localGet(location)
          );
          return instr;
        } else {
          throw new Error('lfdkalfkdja');
        }

        return [
          ...this.compileChild(this.root.fields.expr),
          new IR.MemoryLoad(exprType.toValueType()),
        ];
      }
      default:
        throw new Error(`UnaryExprCompiler: unknown op ${this.root.fields.op}`);
    }
  }
}

class ExprStatementCompiler extends IRCompiler<AST.ExprStatement> {
  compile() {
    if (this.resolveType(this.root.fields.expr) === Intrinsics.void) {
      return this.compileChild(this.root.fields.expr);
    }
    return [...this.compileChild(this.root.fields.expr), new IR.Drop()];
  }
}

class ArgListCompiler extends IRCompiler<AST.ArgList> {
  compile() {
    let instr: IR.Instruction[] = [];

    children(this.root).forEach((child) =>
      instr.push(...this.compileChild(child as AST.Expression))
    );
    return instr;
  }
}

class NumberLiteralCompiler extends IRCompiler<
  AST.NumberLiteral | AST.CharLiteral
> {
  compile(): IR.Instruction[] {
    const valueType = this.resolveType(this.root).toValueType();
    return [new IR.PushConst(valueType, this.root.fields.value)];
  }
}

export class BooleanLiteralCompiler extends IRCompiler<AST.BooleanLiteral> {
  compile(): IR.Instruction[] {
    const value = this.root.fields.value ? 1 : 0;
    return [new IR.PushConst(IR.NumberType.i32, value)];
  }
}

function globalGet(global: GlobalStorageLocation) {
  return new IR.GlobalGet(global.id);
}
function globalSet(global: GlobalStorageLocation) {
  return new IR.GlobalSet(global.id);
}
function localTee(local: LocalStorageLocation) {
  return new IR.LocalTee(local.id);
}
function localGet(local: LocalStorageLocation) {
  return new IR.LocalGet(local.id);
}
function localSet(local: LocalStorageLocation) {
  return new IR.LocalSet(local.id);
}
function call(func: FuncStorageLocation) {
  return new IR.Call(func.id);
}

/**
 * Generates a sequence of instructions that allocates
 * space in the stack area of linear memory, incrementing
 * the stack pointer
 *
 * @param ir
 * @param numBytes
 * @returns the instructions, and the local where the temporary address is stored
 */
function compileStackPush(ir: IRCompiler<AST.ASTNode>, numBytes: number) {
  let location = ir.context.allocationMap.get(ir.root);
  if (!location || location.area !== 'locals') {
    throw new Error(
      `${ir.root.name} didn't have a temporary local allocated for it`
    );
  }
  return {
    location,
    instr: [
      globalGet(ir.context.runtime.stackPointer),
      new IR.PushConst(IR.NumberType.i32, numBytes),
      new IR.Sub(IR.NumberType.i32),
      localTee(location),
      globalSet(ir.context.runtime.stackPointer),
    ] as IR.Instruction[],
  };
  // return {
  //   location,
  //   instr: [
  //     new IR.PushConst(IR.NumberType.i32, numBytes),
  //     call(ir.context.runtime.malloc),
  //     localSet(location),
  //   ] as IR.Instruction[],
  // };
}

class ArrayLiteralCompiler extends IRCompiler<AST.ArrayLiteral> {
  compile(): IR.Instruction[] {
    const arrayType = this.resolveType(this.root);
    if (!(arrayType instanceof PointerType)) {
      throw new Error('unexpected type for array literal');
    }
    const { elements } = this.root.fields;

    const { instr, location } = compileStackPush(
      this,
      arrayType.numBytes * elements.length
    );
    for (const [i, child] of elements.entries()) {
      instr.push(
        // push memory space offset
        localGet(location),
        // push value from expression
        ...this.compileChild(child as AST.Expression),
        // store value
        new IR.MemoryStore(arrayType.toType.toValueType(), {
          offset: i * 4,
          align: 4,
        })
      );
    }
    instr.push(localGet(location));
    return instr;
  }
}

class StructLiteralCompiler extends IRCompiler<AST.StructLiteral> {
  compile(): IR.Instruction[] {
    const structPointerType = this.resolveType(this.root);
    if (!(structPointerType instanceof PointerType)) {
      throw new Error(`unexpected type for struct literal`);
    }
    const { toType: structType } = structPointerType;
    if (!(structType instanceof RecordType)) {
      throw new Error(
        `unexpected type for struct literal... should pointer to a record`
      );
    }

    const { instr, location } = compileStackPush(this, structType.numBytes);

    for (const [i, prop] of this.root.fields.props.entries()) {
      const propType = structType.fields.get(prop.fields.symbol);
      if (!propType) {
        throw new Error(
          `prop ${prop.fields.symbol} does not exist on struct ${this.root.fields.symbol.fields.symbol}`
        );
      }
      instr.push(
        localGet(location),
        ...this.compileChild(prop.fields.expr),
        new IR.MemoryStore(propType.type.toValueType(), {
          offset: propType.offset,
          align: propType.type.numBytes,
          bytes: propType.type.numBytes,
        })
      );
    }
    instr.push(localGet(location));
    return instr;
  }
}

class DataLiteralCompiler extends IRCompiler<AST.DataLiteral> {
  compile() {
    const location = this.context.allocationMap.getDataOrThrow(this.root);
    return [new IR.PushConst(IR.NumberType.i32, location.memIndex)];
  }
}
