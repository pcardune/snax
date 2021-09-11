import * as AST from './spec-gen.js';
import { SNAXParser } from './snax-parser.js';
import {
  ArrayType,
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
import { BinaryOp, UnaryOp } from './snax-ast.js';
import { children } from './spec-util.js';
import { ResolvedTypeMap, resolveTypes } from './type-resolution.js';
import { resolveSymbols, SymbolRefMap } from './symbol-resolution.js';
import {
  AllocationMap,
  LocalAllocation,
  ModuleAllocator,
  resolveMemory,
  StorageLocation,
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

type Runtime = {
  malloc: StorageLocation;
};

export type IRCompilerContext = AllocationMapContext & {
  refMap: SymbolRefMap;
  typeCache: ResolvedTypeMap;
  runtime: Runtime;
};
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
  moduleAllocator? = new ModuleAllocator();

  constructor(file: AST.File, options?: ModuleCompilerOptions) {
    super(file, undefined);
    this.options = {
      includeRuntime: true,
      includeWASI: false,
      ...options,
    };
  }

  compile(): Wasm.Module {
    let heapStartLiteral = AST.makeNumberLiteralWith({
      value: 0,
      numberType: 'int',
    });
    let mallocDecl: AST.FuncDecl | undefined;
    if (this.options.includeRuntime) {
      let runtimeAST = SNAXParser.parseStrOrThrow(`
        global next = 0;
        func malloc(numBytes:i32) {
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

    desugar(this.root);

    const { refMap } = resolveSymbols(this.root);
    this.refMap = refMap;

    const typeCache = resolveTypes(this.root, refMap);
    this.typeCache = typeCache;

    const moduleAllocator = resolveMemory(this.root, typeCache);
    this.moduleAllocator = moduleAllocator;

    // initialize the heap start pointer to the last memIndex
    // that got used.
    heapStartLiteral.fields.value = moduleAllocator.memIndex;

    let runtime: Runtime;
    if (this.options.includeRuntime) {
      if (!mallocDecl) {
        throw new Error(`I need a decl for malloc`);
      }
      let malloc = moduleAllocator.allocationMap.get(mallocDecl);
      if (!malloc) {
        throw new Error(`I need malloc`);
      }

      runtime = {
        malloc,
      };
    } else {
      // TODO, find a better alternative for optional compilation
      runtime = {
        malloc: { area: 'funcs', offset: 1000 },
      };
    }

    const funcs: Wasm.Func[] = this.root.fields.funcs.map((func) => {
      const locals = moduleAllocator.getLocalsForFunc(func);
      if (!locals) {
        throw new Error(
          `Expected resolveMemory to create func allocators for all functions`
        );
      }
      const wasmFunc = new FuncDeclCompiler(func, {
        refMap,
        typeCache,
        allocationMap: moduleAllocator.allocationMap,
        locals,
        runtime,
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
          valtype: typeCache.get(global).toValueType(),
          mut: true,
        }),
        expr: IRCompiler.forNode(global.fields.expr, {
          refMap,
          typeCache,
          allocationMap: moduleAllocator.allocationMap,
          runtime: runtime,
        }).compile(),
      });
    });

    const datas: Wasm.Data[] = [];
    for (const loc of moduleAllocator.allocationMap.values()) {
      if (loc.area === 'data') {
        datas.push(
          new Wasm.Data({ datastring: loc.data, offset: loc.memIndex })
        );
      }
    }

    const imports: Wasm.Import[] = [];
    for (const decl of this.root.fields.decls) {
      if (AST.isExternDecl(decl)) {
        imports.push(...new ExternDeclCompiler(decl, { typeCache }).compile());
      }
    }

    return new Wasm.Module({
      funcs,
      globals,
      imports: imports.length > 0 ? imports : undefined,
      datas,
    });
  }
}

export class ExternDeclCompiler extends ASTCompiler<
  AST.ExternDecl,
  Wasm.Import[],
  { typeCache: ResolvedTypeMap }
> {
  compile(): Wasm.Import[] {
    return this.root.fields.funcs.map((func) => {
      const funcType = this.context.typeCache.get(func);
      if (!(funcType instanceof FuncType)) {
        throw new Error(`Unexpected type for funcDecl: ${funcType.name}`);
      }
      return new Wasm.Import({
        mod: this.root.fields.libName,
        nm: func.fields.symbol,
        importdesc: {
          kind: 'func',
          id: this.root.fields.libName + '_' + func.fields.symbol,
          typeuse: {
            params: func.fields.parameters.fields.parameters.map((param) =>
              this.context.typeCache.get(param).toValueType()
            ),
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

type FuncDeclContext = AllocationMapContext & {
  refMap: SymbolRefMap;
  typeCache: ResolvedTypeMap;
  locals: Wasm.Local[];
  runtime: Runtime;
};

export class FuncDeclCompiler extends ASTCompiler<
  AST.FuncDecl,
  Wasm.Func,
  FuncDeclContext
> {
  compile(): Wasm.Func {
    const funcType = this.context.typeCache.get(this.root);
    if (!(funcType instanceof FuncType)) {
      throw new Error('unexpected type of function');
    }

    const params = funcType.argTypes.map((t) => t.toValueType());

    const results =
      funcType.returnType === Intrinsics.void
        ? []
        : [funcType.returnType.toValueType()];

    const body = new BlockCompiler(
      this.root.fields.body,
      this.context
    ).compile();
    return new Wasm.Func({
      id: this.root.fields.symbol,
      body,
      funcType: new Wasm.FuncTypeUse({
        params,
        results,
      }),
      locals: this.context.locals,
    });
  }
}

class LetStatementCompiler extends IRCompiler<AST.LetStatement> {
  compile(): IR.Instruction[] {
    const location = this.context.allocationMap.get(this.root);
    if (!location) {
      throw new Error(`Storage location hasn't been assigned to LetStatement`);
    }
    if (location.area !== 'locals') {
      throw new Error(
        `Don't know how to assign let statement to non-local area`
      );
    }
    return [
      ...this.compileChild(this.root.fields.expr),
      new IR.LocalSet(location.offset),
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
        let tempLocation = this.context.allocationMap.get(this.root);
        if (!tempLocation) {
          throw new Error(`DEREF operator requires a temporary`);
        }
        if (tempLocation.area !== 'locals') {
          throw new Error(`Don't know how to use non-local temporary`);
        }
        return [
          ...setup,
          new IR.LocalTee(tempLocation.offset),
          new IR.MemoryStore(rightType.toValueType()),
          new IR.LocalGet(tempLocation.offset),
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
        let tempLocation = this.context.allocationMap.get(this.root);
        if (!tempLocation) {
          throw new Error(`DEREF operator requires a temporary`);
        }
        if (tempLocation.area !== 'locals') {
          throw new Error(`Don't know how to use non-local temporary`);
        }
        return [
          ...calcPointer,
          ...calcValue,
          new IR.LocalTee(tempLocation.offset),
          new IR.MemoryStore(valueType, {
            offset: 0,
            align: leftType.numBytes,
            bytes: leftType.numBytes,
          }),
          new IR.LocalGet(tempLocation.offset),
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
        }),
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
      const { location, instr } = compileMalloc(this, leftType.numBytes);
      for (const [i, arg] of right.fields.args.entries()) {
        if (i >= leftType.elements.length) {
          throw new Error(`too many arguments specifed for tuple constructor`);
        }
        const elem = leftType.elements[i];
        instr.push(
          new IR.LocalGet(location.offset),
          ...this.compileChild(arg),
          new IR.MemoryStore(elem.type.toValueType(), {
            offset: elem.offset,
            align: elem.type.numBytes,
            bytes: elem.type.numBytes,
          })
        );
      }
      instr.push(new IR.LocalGet(location.offset));
      return instr;
    } else if (AST.isSymbolRef(left)) {
      const location = this.getLocationForSymbolRef(left);
      return [...this.compileChild(right), new IR.Call(location.offset)];
    } else {
      throw new Error(
        `ExpressionCompiler: Can't call unresolved symbol ${left}`
      );
    }
  }
}

class CastExprCompiler extends IRCompiler<AST.CastExpr> {
  compile() {
    const sourceType = this.context.typeCache.get(this.root.fields.expr);
    const destType = this.context.typeCache.get(this.root.fields.typeExpr);
    if (!(destType instanceof NumericalType)) {
      throw new Error(`Don't know how to cast to ${destType.name} yet`);
    }

    const instr = this.compileChild(this.root.fields.expr);

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
          } else {
            throw new Error(`I don't implicitly demote floats`);
          }
        } else {
          instr.push(new IR.Nop());
        }
      } else {
        // conversion to integers
        if (IR.isFloatType(sourceValueType)) {
          throw new Error(`I don't implicitly truncate floats`);
        } else if (sourceType.numBytes > destType.numBytes) {
          throw new Error(`I don't implicitly wrap to smaller sizes`);
        } else if (sourceType.signed && !destType.signed) {
          throw new Error(`I don't implicitly drop signs`);
        } else {
          instr.push(new IR.Nop());
        }
      }
    } else if (sourceType instanceof PointerType) {
      if (
        destType.interpretation === 'int' &&
        destType.numBytes < sourceType.numBytes
      ) {
        throw new Error(`${destType} doesn't hold enough bytes for a pointer`);
      } else {
        instr.push(new IR.Nop());
      }
    } else {
      throw new Error(`Don't know how to cast from ${sourceType.name} yet`);
    }

    return instr;
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

function compileMalloc(ir: IRCompiler<AST.ASTNode>, numBytes: number) {
  let location = ir.context.allocationMap.get(ir.root);
  if (!location || location.area !== 'locals') {
    throw new Error(
      `${ir.root.name} didn't have a temporary local allocated for it`
    );
  }
  return {
    location,
    instr: [
      new IR.PushConst(IR.NumberType.i32, numBytes),
      new IR.Call(ir.context.runtime.malloc.offset),
      new IR.LocalSet(location.offset),
    ] as IR.Instruction[],
  };
}

class ArrayLiteralCompiler extends IRCompiler<AST.ArrayLiteral> {
  compile(): IR.Instruction[] {
    const arrayType = this.resolveType(this.root);
    if (!(arrayType instanceof PointerType)) {
      throw new Error('unexpected type for array literal');
    }
    const { elements } = this.root.fields;

    const { instr, location } = compileMalloc(
      this,
      arrayType.numBytes * elements.length
    );
    for (const [i, child] of elements.entries()) {
      instr.push(
        // push memory space offset
        new IR.LocalGet(location.offset),
        // push value from expression
        ...this.compileChild(child as AST.Expression),
        // store value
        new IR.MemoryStore(arrayType.toType.toValueType(), {
          offset: i * 4,
          align: 4,
        })
      );
    }
    instr.push(new IR.LocalGet(location.offset));
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

    const { instr, location } = compileMalloc(this, structType.numBytes);

    for (const [i, prop] of this.root.fields.props.entries()) {
      const propType = structType.fields.get(prop.fields.symbol);
      if (!propType) {
        throw new Error(
          `prop ${prop.fields.symbol} does not exist on struct ${this.root.fields.symbol.fields.symbol}`
        );
      }
      instr.push(
        new IR.LocalGet(location.offset),
        ...this.compileChild(prop.fields.expr),
        new IR.MemoryStore(propType.type.toValueType(), {
          offset: propType.offset,
          align: propType.type.numBytes,
          bytes: propType.type.numBytes,
        })
      );
    }
    instr.push(new IR.LocalGet(location.offset));
    return instr;
  }
}

class DataLiteralCompiler extends IRCompiler<AST.DataLiteral> {
  compile() {
    const location = this.context.allocationMap.get(this.root);
    if (!location) {
      throw new Error(
        `DataLiteralCompiler: Can't compiler string literal that hasn't had a storage location assigned to it`
      );
    }
    if (location.area !== 'data') {
      throw new Error(
        `DataLiteralCompiler: Don't know how to compile a string literal whose storage isn't in linear memory...`
      );
    }
    return [new IR.PushConst(IR.NumberType.i32, location.memIndex)];
  }
}
