import * as AST from './spec-gen';
import { SNAXParser } from './snax-parser';
import { ArrayType, FuncType, Intrinsics, NumericalType } from './snax-types';
import * as IR from './stack-ir';
import * as Wasm from './wasm-ast';
import { BinaryOp, UnaryOp } from './snax-ast';
import { children } from './spec-util';
import { ResolvedTypeMap, resolveType } from './type-resolution';
import { resolveSymbols, SymbolRefMap } from './symbol-resolution';
import { OrderedMap } from '../utils/data-structures/OrderedMap';

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
export type AllocationMap = OrderedMap<AST.ASTNode, SymbolLocation>;

type CompilesToIR = AST.Expression | AST.Statement | AST.LiteralExpr;

type ConstantAllocationContext = {
  constants: ConstantAllocator;
};

export type IRCompilerContext = ConstantAllocationContext & {
  refMap: SymbolRefMap;
  typeCache: ResolvedTypeMap;
  locals: ILocalAllocator;
  allocationMap: AllocationMap;
};
export abstract class IRCompiler<Root extends AST.ASTNode> extends ASTCompiler<
  Root,
  IR.Instruction[],
  IRCompilerContext
> {
  static forNode(
    node: CompilesToIR,
    context: IRCompilerContext
  ): ASTCompiler<AST.ASTNode, IR.Instruction[]> {
    switch (node.name) {
      case 'BinaryExpr':
        return new BinaryExprCompiler(node, context);
      case 'CallExpr':
        return new CallExprCompiler(node, context);
      case 'ExprStatement':
        return new ExprStatementCompiler(node, context);
      case 'NumberLiteral':
        return new NumberLiteralCompiler(node, context);
      case 'Block':
        return new BlockCompiler(node, context);
      case 'LetStatement':
        return new LetStatementCompiler(node, context);
      case 'IfStatement':
        return new IfStatementCompiler(node, context);
      case 'SymbolRef':
        return new SymbolRefCompiler(node, context);
      case 'BooleanLiteral':
        return new BooleanLiteralCompiler(node);
      case 'ArrayLiteral':
        return new ArrayLiteralCompiler(node, context);
      case 'StringLiteral':
        return new StringLiteralCompiler(node, context);
      case 'ArgList':
        return new ArgListCompiler(node, context);
      case 'WhileStatement':
        return new WhileStatementCompiler(node, context);
      case 'ReturnStatement':
        return new ReturnStatementCompiler(node, context);
      case 'UnaryExpr':
        return new UnaryExprCompiler(node, context);
      default:
        throw new Error(
          `ASTCompiler: No compiler available for node ${node.toString()}`
        );
    }
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
    return resolveType(node, this.context.typeCache, this.context.refMap);
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

class BlockAllocator implements ILocalAllocator {
  funcAllocator: ILocalAllocator;
  liveLocals: LocalAllocation[] = [];

  constructor(funcAllocator: ILocalAllocator) {
    this.funcAllocator = funcAllocator;
  }

  allocateLocal(valueType: IR.NumberType, decl?: AST.ASTNode): LocalAllocation {
    let localOffset = this.funcAllocator.allocateLocal(valueType, decl);
    this.liveLocals.push(localOffset);
    return localOffset;
  }

  deallocateLocal(offset: LocalAllocation): void {
    this.funcAllocator.deallocateLocal(offset);
    this.liveLocals = this.liveLocals.filter((o) => o !== offset);
  }

  deallocateBlock() {
    for (const offset of this.liveLocals) {
      this.funcAllocator.deallocateLocal(offset);
    }
  }
}

export class BlockCompiler extends IRCompiler<AST.Block> {
  liveLocals: LocalAllocation[] = [];

  compile(): IR.Instruction[] {
    const allocator = new BlockAllocator(this.context.locals.funcAllocator);
    const code = this.root.fields.statements
      .filter((astNode) => !AST.isFuncDecl(astNode))
      .map((astNode) =>
        IRCompiler.forNode(astNode, {
          ...this.context,
          locals: allocator,
        }).compile()
      )
      .flat();
    allocator.deallocateBlock();
    return code;
  }
}

type SymbolLocation = {
  area: 'funcs' | 'locals' | 'globals';
  offset: number;
};

export class ConstantAllocator {
  datas: Wasm.Data[] = [];
  private dataOffset = 0;

  allocateStaticData(data: string) {
    const wasmData = new Wasm.Data({
      datastring: data,
      offset: this.dataOffset,
    });
    this.dataOffset += data.length;
    this.datas.push(wasmData);
    return wasmData.fields.offset;
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
  allocationMap: AllocationMap = new OrderedMap();
  staticAllocator = new ConstantAllocator();

  constructor(file: AST.File, options?: ModuleCompilerOptions) {
    super(file, undefined);
    this.options = {
      includeRuntime: false,
      includeWASI: false,
      ...options,
    };
  }

  compile(): Wasm.Module {
    let imports: Wasm.Import[] = [];
    if (this.options.includeWASI) {
      const { i32 } = IR.NumberType;
      imports.push(
        new Wasm.Import({
          mod: 'wasi_unstable',
          nm: 'fd_write',
          importdesc: {
            kind: 'func',
            id: 'fd_write',
            typeuse: {
              params: [i32, i32, i32, i32],
              results: [i32],
            },
          },
        })
      );
    }
    if (this.options.includeRuntime) {
      let runtimeAST = SNAXParser.parseStrOrThrow(`
        global next = 0;
        func malloc(numBytes:i32) {
          let startAddress = next;
          next = next + numBytes;
          return startAddress;
        }`);
      if (AST.isFile(runtimeAST)) {
        this.root.fields.funcs.push(
          ...runtimeAST.fields.funcs.filter(
            (func) => func.fields.symbol !== 'main'
          )
        );
        this.root.fields.globals.push(...runtimeAST.fields.globals);
      }
    }
    const { refMap } = resolveSymbols(this.root);
    this.refMap = refMap;

    let funcOffset = 0;
    let globalOffset = 0;
    for (const func of this.root.fields.funcs) {
      this.allocationMap.set(func, {
        area: 'funcs',
        offset: funcOffset++,
      });
    }
    for (const global of this.root.fields.globals) {
      this.allocationMap.set(global, {
        area: 'globals',
        offset: globalOffset++,
      });
    }

    const typeCache: ResolvedTypeMap = new OrderedMap();
    this.typeCache = typeCache;

    const funcs: Wasm.Func[] = this.root.fields.funcs.map((func) => {
      const wasmFunc = new FuncDeclCompiler(func, {
        refMap,
        typeCache,
        allocationMap: this.allocationMap,
        constants: this.staticAllocator,
      }).compile();
      if (func.fields.symbol === 'main') {
        wasmFunc.fields.exportName = '_start';
      }
      return wasmFunc;
    });

    const globals: Wasm.Global[] = this.root.fields.globals.map((global, i) => {
      return new Wasm.Global({
        id: `g${i}`,
        globalType: new Wasm.GlobalType({
          valtype: resolveType(global, typeCache, refMap).toValueType(),
          mut: true,
        }),
        expr: IRCompiler.forNode(global.fields.expr, {
          refMap,
          typeCache,
          locals: new NeverAllocator(),
          allocationMap: this.allocationMap,
          constants: this.staticAllocator,
        }).compile(),
      });
    });

    return new Wasm.Module({
      funcs,
      globals,
      imports: imports.length > 0 ? imports : undefined,
      datas: this.staticAllocator.datas,
    });
  }
}

type LocalAllocation = {
  offset: number;
  live: boolean;
  local: Wasm.Local;
};

interface ILocalAllocator {
  allocateLocal(valueType: IR.NumberType, decl?: AST.ASTNode): LocalAllocation;
  deallocateLocal(offset: LocalAllocation): void;
  get funcAllocator(): ILocalAllocator;
}

export class NeverAllocator implements ILocalAllocator {
  allocateLocal(): LocalAllocation {
    throw new Error('this should never be used. please refactor');
  }
  deallocateLocal() {
    throw new Error('this should never be used. please refactor');
  }
  get funcAllocator() {
    return this;
  }
}

export class FuncLocalAllocator implements ILocalAllocator {
  allocationMap: AllocationMap;

  locals: LocalAllocation[] = [];
  get funcAllocator() {
    return this;
  }
  /*private*/ localsOffset = 0;

  constructor(allocationMap: AllocationMap) {
    this.allocationMap = allocationMap ?? new OrderedMap();
  }

  allocateLocal(valueType: IR.NumberType, decl?: AST.ASTNode): LocalAllocation {
    let localAllocation: LocalAllocation;

    let freeLocal = this.locals.find(
      (l) => !l.live && l.local.fields.valueType === valueType
    );
    if (freeLocal) {
      freeLocal.live = true;
      localAllocation = freeLocal;
    } else {
      localAllocation = {
        offset: this.localsOffset++,
        live: true,
        local: new Wasm.Local(valueType),
      };
      this.locals.push(localAllocation);
    }

    if (decl) {
      this.allocationMap.set(decl, {
        area: 'locals',
        offset: localAllocation.offset,
      });
    }
    return localAllocation;
  }
  deallocateLocal(offset: LocalAllocation): void {
    let local = this.locals.find((l) => l === offset);
    if (!local) {
      throw new Error(
        "FuncDeclCompiler: can't deallocate local that was never allocated..."
      );
    }
    local.live = false;
  }
}

type FuncDeclContext = ConstantAllocationContext & {
  refMap: SymbolRefMap;
  typeCache: ResolvedTypeMap;
  allocationMap: AllocationMap;
};

export class FuncDeclCompiler extends ASTCompiler<
  AST.FuncDecl,
  Wasm.Func,
  FuncDeclContext
> {
  localAllocator: FuncLocalAllocator;
  constructor(root: AST.FuncDecl, context: FuncDeclContext) {
    super(root, context);
    this.localAllocator = new FuncLocalAllocator(context.allocationMap);
  }

  compile(): Wasm.Func {
    const funcType = resolveType(
      this.root,
      this.context.typeCache,
      this.context.refMap
    );
    if (!(funcType instanceof FuncType)) {
      throw new Error('unexpected type of function');
    }

    const params = funcType.argTypes.map((t) => t.toValueType());
    for (const param of this.root.fields.parameters.fields.parameters) {
      let location: SymbolLocation = {
        area: 'locals',
        offset: this.localAllocator.localsOffset++,
      };
      this.context.allocationMap.set(param, location);
    }

    const results =
      funcType.returnType === Intrinsics.void
        ? []
        : [funcType.returnType.toValueType()];

    const body = new BlockCompiler(this.root.fields.body, {
      ...this.context,
      locals: this.localAllocator,
    }).compile();
    const locals = this.localAllocator.locals.map((l) => l.local);
    return new Wasm.Func({
      id: this.root.fields.symbol,
      body,
      funcType: new Wasm.FuncTypeUse({
        params,
        results,
      }),
      locals,
    });
  }
}

class LetStatementCompiler extends IRCompiler<AST.LetStatement> {
  compile(): IR.Instruction[] {
    let localAllocation = this.context.locals.allocateLocal(
      this.resolveType(this.root).toValueType(),
      this.root
    );
    return [
      ...this.compileChild(this.root.fields.expr),
      new IR.LocalSet(localAllocation.offset),
    ];
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
    switch (location.area) {
      case 'locals':
        return [new IR.LocalGet(location.offset)];
      case 'globals':
        return [new IR.GlobalGet(location.offset)];
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
    [BinaryOp.ADD]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.Add(this.matchTypes(left, right)),
    ],
    [BinaryOp.SUB]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.Sub(this.matchTypes(left, right)),
    ],
    [BinaryOp.MUL]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.Mul(this.matchTypes(left, right)),
    ],
    [BinaryOp.DIV]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.Div(this.matchTypes(left, right)),
    ],
    [BinaryOp.EQUAL_TO]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.Equal(this.matchTypes(left, right)),
    ],
    [BinaryOp.NOT_EQUAL_TO]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.NotEqual(this.matchTypes(left, right)),
    ],
    [BinaryOp.LESS_THAN]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.LessThan(this.matchTypes(left, right)),
    ],
    [BinaryOp.GREATER_THAN]: (left: AST.Expression, right: AST.Expression) => [
      ...this.pushNumberOps(left, right),
      new IR.GreaterThan(this.matchTypes(left, right)),
    ],
    [BinaryOp.LOGICAL_AND]: (left: AST.Expression, right: AST.Expression) => [
      ...this.compileChild(left),
      ...this.compileChild(right),
      new IR.And(Intrinsics.bool.toValueType()),
    ],
    [BinaryOp.LOGICAL_OR]: (left: AST.Expression, right: AST.Expression) => [
      ...this.compileChild(left),
      ...this.compileChild(right),
      new IR.Or(Intrinsics.bool.toValueType()),
    ],
    [BinaryOp.ASSIGN]: (left: AST.Expression, right: AST.Expression) => {
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
            return [
              ...this.compileChild(right),
              new IR.LocalTee(location.offset),
            ];
          case 'globals':
            return [
              ...this.compileChild(right),
              new IR.GlobalSet(location.offset),
              new IR.GlobalGet(location.offset),
            ];
          default:
            throw new Error(
              `ASSIGN: don't know how to compile assignment to symbol located in ${location.area}`
            );
        }
      } else if (AST.isUnaryExpr(left) && left.fields.op === UnaryOp.DEREF) {
        let setup = [
          ...this.compileChild(left.fields.expr),
          ...this.compileChild(right),
        ];
        let tempOffset = this.context.locals.allocateLocal(
          this.resolveType(right).toValueType()
        );
        this.context.locals.deallocateLocal(tempOffset);
        return [
          ...setup,
          new IR.LocalTee(tempOffset.offset),
          new IR.MemoryStore(rightType.toValueType()),
          new IR.LocalGet(tempOffset.offset),
        ];
      } else if (
        AST.isBinaryExpr(left) &&
        left.fields.op === BinaryOp.ARRAY_INDEX
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
        let tempOffset = this.context.locals.allocateLocal(
          this.resolveType(right).toValueType()
        );
        this.context.locals.deallocateLocal(tempOffset);
        return [
          ...calcPointer,
          ...calcValue,
          new IR.LocalTee(tempOffset.offset),
          new IR.MemoryStore(valueType, 0, leftType.numBytes),
          new IR.LocalGet(tempOffset.offset),
        ];
      } else {
        throw new Error(
          `ASSIGN: Can't assign to something that is not a resolved symbol or a memory address`
        );
      }
    },
    [BinaryOp.ARRAY_INDEX]: (
      refExpr: AST.Expression,
      indexExpr: AST.Expression
    ) => {
      const valueType = this.resolveType(refExpr).toValueType();
      return [
        ...this.compileChild(refExpr),
        ...this.compileChild(indexExpr),
        new IR.Add(valueType),
        new IR.PushConst(valueType, 4),
        new IR.Mul(valueType),
        new IR.MemoryLoad(valueType, 0),
      ];
    },
    [BinaryOp.CAST]: (left: AST.Expression, right: AST.Expression) => {
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

class CallExprCompiler extends IRCompiler<AST.CallExpr> {
  compile() {
    const { left, right } = this.root.fields;
    if (AST.isSymbolRef(left)) {
      const location = this.getLocationForSymbolRef(left);
      return [...this.compileChild(right), new IR.Call(location.offset)];
    } else {
      throw new Error(
        `ExpressionCompiler: Can't call unresolved symbol ${left}`
      );
    }
  }
}

class UnaryExprCompiler extends IRCompiler<AST.UnaryExpr> {
  compile() {
    switch (this.root.fields.op) {
      case UnaryOp.DEREF:
        const exprType = this.resolveType(this.root.fields.expr);
        return [
          ...this.compileChild(this.root.fields.expr),
          new IR.MemoryLoad(exprType.toValueType()),
        ];
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
    return children(this.root)
      .map((child) => this.compileChild(child as AST.Expression))
      .flat();
  }
}

class NumberLiteralCompiler extends IRCompiler<AST.NumberLiteral> {
  compile(): IR.Instruction[] {
    const valueType = this.resolveType(this.root).toValueType();
    return [new IR.PushConst(valueType, this.root.fields.value)];
  }
}

abstract class LeafCompiler<Root extends AST.ASTNode> extends ASTCompiler<
  Root,
  IR.Instruction[],
  undefined
> {
  constructor(root: Root) {
    super(root, undefined);
  }
}

export class BooleanLiteralCompiler extends LeafCompiler<AST.BooleanLiteral> {
  compile(): IR.Instruction[] {
    const value = this.root.fields.value ? 1 : 0;
    return [new IR.PushConst(IR.NumberType.i32, value)];
  }
}

class ArrayLiteralCompiler extends IRCompiler<AST.ArrayLiteral> {
  compile(): IR.Instruction[] {
    const arrayType = this.resolveType(this.root);
    if (!(arrayType instanceof ArrayType)) {
      throw new Error('unexpected type for array literal');
    }
    // TODO: this should not be zero, otherwise every array literal
    // will overwrite the other array literals...
    const baseAddressInstr = new IR.PushConst(IR.NumberType.i32, 0);
    const instr: IR.Instruction[] = [
      ...children(this.root).map((child, i) => [
        // push memory space offset
        baseAddressInstr,
        // push value from expression
        ...this.compileChild(child as AST.Expression),
        // store value
        new IR.MemoryStore(arrayType.elementType.toValueType(), i * 4, 4),
      ]),
    ].flat();
    instr.push(baseAddressInstr);
    return instr;
  }
}

class StringLiteralCompiler extends ASTCompiler<
  AST.StringLiteral,
  IR.Instruction[],
  ConstantAllocationContext
> {
  compile() {
    let offset = this.context.constants.allocateStaticData(
      this.root.fields.value
    );
    return [new IR.PushConst(IR.NumberType.i32, offset)];
  }
}
