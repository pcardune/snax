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
import { NumberType, Sign, isFloatType, isIntType } from './numbers.js';
import { BinOp, UnaryOp } from './snax-ast.js';
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
  StorageLocation,
} from './memory-resolution.js';
import { desugar } from './desugar.js';
import binaryen from 'binaryen';

export const PAGE_SIZE = 65536;

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

export type Runtime = {
  malloc: FuncStorageLocation;
  stackPointer: GlobalStorageLocation;
};

type FuncDeclContext = {
  refMap: SymbolRefMap;
  typeCache: ResolvedTypeMap;
  funcAllocs: FuncAllocations;
  runtime: Runtime;
  allocationMap: AllocationMap;
  module: binaryen.Module;
};

export type IRCompilerContext = FuncDeclContext & {
  setDebugLocation: (expr: number, node: AST.ASTNode) => void;
};
export abstract class IRCompiler<Root extends AST.ASTNode> extends ASTCompiler<
  Root,
  binaryen.ExpressionRef,
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
  compileChild<N extends AST.Expression | AST.Statement>(
    child: N
  ): binaryen.ExpressionRef {
    const exprRef = IRCompiler.forNode(child, this.context).compile();
    this.context.setDebugLocation(exprRef, child);
    return exprRef;
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

  getLValue(): LValue {
    throw new Error(`Don't know how to compute LValue for ${this.root.name}`);
  }

  getRValue(): RValue {
    const lvalue = this.getLValue();
    const type = this.resolveType(this.root);
    const { module } = this.context;

    switch (lvalue.kind) {
      case 'immediate': {
        throw new Error(
          `ASTNodes with immediate LValues, should implement getRValue themselves`
        );
      }
      case 'static': {
        const { location } = lvalue;
        switch (location.area) {
          case 'locals':
            return rvalueDirect(
              type,
              this.context.module.local.get(
                location.offset,
                binaryen[location.valueType]
              )
            );
          case 'globals':
            return rvalueDirect(
              type,
              this.context.module.global.get(
                location.id,
                binaryen[location.valueType]
              )
            );
          case 'stack': {
            const { arp } = this.context.funcAllocs;
            const ptr = module.local.get(arp.offset, binaryen[arp.valueType]);
            const valueType = type.toValueType();
            if (valueType) {
              return rvalueDirect(
                type,
                memLoad(
                  module,
                  {
                    valueType,
                    offset: location.offset,
                  },
                  ptr
                )
              );
            }
            return rvalueAddress(type, ptr);
          }

          default:
            throw new Error(
              `SymbolRefCompiler: don't know how to compile reference to a location in ${location.area}`
            );
        }
      }
      case 'dynamic': {
        throw new Error(
          `Don't know how to getRValue for ${this.root.name}, which has a dynamic lvalue`
        );
      }
    }
  }
}

type LValue =
  | { kind: 'immediate' }
  | { kind: 'static'; location: StorageLocation }
  | { kind: 'dynamic'; ptr: binaryen.ExpressionRef };

type RValue =
  | { kind: 'direct'; type: BaseType; valueExpr: binaryen.ExpressionRef }
  | { kind: 'address'; type: BaseType; valuePtrExpr: binaryen.ExpressionRef };
function rvalueDirect(type: BaseType, valueExpr: binaryen.ExpressionRef) {
  return { kind: 'direct' as const, type, valueExpr };
}
function rvalueAddress(type: BaseType, valuePtrExpr: binaryen.ExpressionRef) {
  return { kind: 'address' as const, type, valuePtrExpr };
}

class ReturnStatementCompiler extends IRCompiler<AST.ReturnStatement> {
  compile() {
    let value: number | undefined = undefined;
    if (this.root.fields.expr) {
      value = this.compileChild(this.root.fields.expr);
    }
    return this.context.module.return(value);
  }
}

export class BlockCompiler extends IRCompiler<AST.Block> {
  liveLocals: LocalAllocation[] = [];

  compile() {
    const instr: number[] = [];
    this.root.fields.statements
      .filter((astNode) => !AST.isFuncDecl(astNode))
      .forEach((astNode) => instr.push(this.compileChild(astNode)));
    return this.context.module.block('', instr);
  }
}

export type ModuleCompilerOptions = {
  includeRuntime?: boolean;
  includeWASI?: boolean;
};
export class ModuleCompiler extends ASTCompiler<AST.File, binaryen.Module> {
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

  private setup() {
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
          reg startAddress = next;
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
        malloc: {
          area: Area.FUNCS,
          offset: 1000,
          id: 'f1000:malloc',
          funcType: new FuncType([], Intrinsics.void),
        },
        stackPointer,
      };
    }

    return {
      refMap,
      typeCache,
      moduleAllocator,
      runtime,
      numPagesOfMemory,
      stackPointer,
    };
  }

  compile(): binaryen.Module {
    const {
      refMap,
      typeCache,
      moduleAllocator,
      runtime,
      numPagesOfMemory,
      stackPointer,
    } = this.setup();

    // ADD FUNCTIONS
    const module = new binaryen.Module();
    module.setFeatures(
      binaryen.Features.BulkMemory | binaryen.Features.MutableGlobals
    );
    // module.setFeatures(binaryen.Features.MutableGlobals);
    for (const func of this.root.fields.funcs) {
      new FuncDeclCompiler(func, {
        refMap,
        typeCache,
        allocationMap: moduleAllocator.allocationMap,
        funcAllocs: moduleAllocator.getLocalsForFunc(func),
        runtime,
        module,
      }).compile();
    }
    const mainFunc = this.root.fields.funcs.find(
      (decl) => decl.fields.symbol === 'main'
    );
    if (mainFunc) {
      const mainFuncLocation =
        moduleAllocator.allocationMap.getFuncOrThrow(mainFunc);
      const mainFuncType = typeCache.get(mainFunc);
      if (!(mainFuncType instanceof FuncType)) {
        throw 'wtf';
      }
      const returnType = mainFuncType.returnType.equals(Intrinsics.void)
        ? binaryen.none
        : binaryen[mainFuncType.returnType.toValueTypeOrThrow()];
      module.addFunction(
        '_start',
        binaryen.createType([]),
        returnType,
        [],
        module.block(
          '',
          [
            module.global.set(
              runtime.stackPointer.id,
              module.i32.const(numPagesOfMemory * PAGE_SIZE)
            ),
            module.return(module.call(mainFuncLocation.id, [], returnType)),
          ],
          binaryen.auto
        )
      );
      module.addFunctionExport('_start', '_start');
    }

    // ADD GLOBALS
    for (const global of this.root.fields.globals) {
      const location = moduleAllocator.allocationMap.getGlobalOrThrow(global);
      module.addGlobal(
        location.id,
        binaryen[location.valueType],
        true,
        IRCompiler.forNode(global.fields.expr, {
          refMap,
          typeCache,
          allocationMap: moduleAllocator.allocationMap,
          get funcAllocs(): FuncAllocations {
            throw new Error(
              `global expressions should not be attempting to access stack variables`
            );
          },
          runtime: runtime,
          setDebugLocation: () => {},
          module,
        }).compile()
      );
    }
    module.addGlobalExport(stackPointer.id, 'stackPointer');

    // ADD DATA
    const segments: binaryen.MemorySegment[] = [];
    for (const loc of moduleAllocator.allocationMap.values()) {
      if (loc.area === 'data') {
        segments.push({
          offset: module.i32.const(loc.memIndex),
          data: new TextEncoder().encode(loc.data),
          passive: false,
        });
      }
    }

    // ADD IMPORTS
    for (const decl of this.root.fields.decls) {
      if (AST.isExternDecl(decl)) {
        new ExternDeclCompiler(decl, {
          typeCache,
          allocationMap: moduleAllocator.allocationMap,
          module,
        }).compile();
      }
    }

    module.setMemory(
      numPagesOfMemory,
      numPagesOfMemory,
      'memory',
      segments.length > 0 ? segments : undefined,
      undefined,
      undefined
    );

    return module;
  }
}

export class ExternDeclCompiler extends ASTCompiler<
  AST.ExternDecl,
  void,
  {
    module: binaryen.Module;
    typeCache: ResolvedTypeMap;
    allocationMap: AllocationMap;
  }
> {
  compile() {
    const { module } = this.context;
    for (const func of this.root.fields.funcs) {
      const funcType = this.context.typeCache.get(func);
      if (!(funcType instanceof FuncType)) {
        throw new Error(`Unexpected type for funcDecl: ${funcType.name}`);
      }
      const location = this.context.allocationMap.getFuncOrThrow(func);

      const params = binaryen.createType(
        func.fields.parameters.fields.parameters.map(
          (param) =>
            binaryen[this.context.typeCache.get(param).toValueTypeOrThrow()]
        )
      );
      const results =
        funcType.returnType === Intrinsics.void
          ? binaryen.none
          : binaryen[funcType.returnType.toValueTypeOrThrow()];
      module.addFunctionImport(
        location.id,
        this.root.fields.libName,
        func.fields.symbol,
        params,
        results
      );
    }
  }
}

export class FuncDeclCompiler extends ASTCompiler<
  AST.FuncDecl,
  binaryen.FunctionRef,
  FuncDeclContext
> {
  private preamble(): number[] {
    const { module } = this.context;
    let stackSpace = 0;
    let last =
      this.context.funcAllocs.stack[this.context.funcAllocs.stack.length - 1];
    if (last) {
      stackSpace = last.offset + last.dataType.numBytes;
    }
    if (stackSpace > 0) {
      const sp = this.context.runtime.stackPointer;
      return [
        // allocate space for stack variables
        module.global.set(
          sp.id,
          module.i32.sub(
            module.global.get(sp.id, binaryen[sp.valueType]),
            module.i32.const(stackSpace)
          )
        ),
        // set arp local to the stack pointer
        module.local.set(
          this.context.funcAllocs.arp.offset,
          module.global.get(sp.id, binaryen[sp.valueType])
        ),
      ];
    }
    return [];
  }

  compile() {
    const funcType = this.context.typeCache.get(this.root);
    if (!(funcType instanceof FuncType)) {
      throw new Error('unexpected type of function');
    }

    const params = binaryen.createType(
      this.root.fields.parameters.fields.parameters.map((param) => {
        const paramType = this.context.typeCache.get(param);
        return binaryen[paramType.toValueTypeOrThrow()];
      })
    );

    const results = funcType.returnType.equals(Intrinsics.void)
      ? binaryen.none
      : binaryen[funcType.returnType.toValueTypeOrThrow()];

    const vars = this.context.funcAllocs.locals.map(
      (local) => binaryen[local.valueType]
    );

    const debugLocations: { expr: number; node: AST.ASTNode }[] = [];
    const { module } = this.context;

    const block = binaryen.getExpressionInfo(
      new BlockCompiler(this.root.fields.body, {
        ...this.context,
        setDebugLocation: (expr: number, node: AST.ASTNode) => {
          debugLocations.push({ expr, node });
        },
      }).compile()
    ) as binaryen.BlockInfo;

    const body = module.block(
      '',
      [...this.preamble(), ...block.children],
      results
    );

    const location = this.context.allocationMap.getFuncOrThrow(this.root);
    const func = module.addFunction(location.id, params, results, vars, body);

    // add debug info
    const fileIndices: { [key: string]: number } = {};
    for (const debugLocation of debugLocations) {
      const { expr, node } = debugLocation;
      if (node.location) {
        if (!fileIndices[node.location.source]) {
          fileIndices[node.location.source] = module.addDebugInfoFileName(
            node.location.source
          );
        }

        module.setDebugLocation(
          func,
          expr,
          fileIndices[node.location.source],
          node.location.start.line,
          node.location.start.column
        );
      }
    }
    return func;
  }
}

class RegStatementCompiler extends IRCompiler<AST.RegStatement> {
  compile() {
    const location = this.context.allocationMap.getLocalOrThrow(
      this.root,
      'reg statements need a local'
    );
    const { expr } = this.root.fields;
    if (expr) {
      const exprType = this.resolveType(expr);
      exprType.toValueTypeOrThrow();
      return this.context.module.local.set(
        location.offset,
        this.compileChild(expr)
      );
    }
    return this.context.module.nop();
  }
}

class LetStatementCompiler extends IRCompiler<AST.LetStatement> {
  compile() {
    const location = this.context.allocationMap.getStackOrThrow(
      this.root,
      'let statements need a local'
    );
    const { expr } = this.root.fields;
    const type = this.resolveType(this.root);
    const { module } = this.context;
    const { arp } = this.context.funcAllocs;

    let dest = lget(module, arp);

    if (expr) {
      const value = this.compileChild(expr);
      return memStore(
        module,
        {
          valueType: type.toValueTypeOrThrow(),
          offset: location.offset,
          bytes: type.numBytes,
        },
        dest,
        value
      );
    } else {
      if (location.offset > 0) {
        dest = module.i32.add(module.i32.const(location.offset), dest);
      }
      const value = module.i32.const(0);
      const size = module.i32.const(type.numBytes);
      return module.memory.fill(dest, value, size);
    }
  }
}

export class IfStatementCompiler extends IRCompiler<AST.IfStatement> {
  compile() {
    return this.context.module.if(
      this.compileChild(this.root.fields.condExpr),
      this.compileChild(this.root.fields.thenBlock),
      this.compileChild(this.root.fields.elseBlock)
    );
  }
}

export class WhileStatementCompiler extends IRCompiler<AST.WhileStatement> {
  compile() {
    const { module } = this.context;
    const { condExpr, thenBlock } = this.root.fields;
    const cond = this.compileChild(condExpr);
    const value = this.compileChild(thenBlock);
    return module.loop(
      'while_0',
      module.block('', [value, module.br_if('while_0', cond)], binaryen.auto)
    );
  }
}

type MemProps = {
  valueType: NumberType;
  offset?: number;
  align?: number;
  bytes?: number;
};
function memDefaults(props: MemProps): {
  offset: number;
  align: number;
  bytes: 1 | 2 | 4 | 8;
} {
  let { valueType, offset = 0, align: inAlign, bytes: inBytes } = props;

  let bytes: 1 | 2 | 4 | 8 = 4;
  if (inBytes) {
    if (
      inBytes !== 1 &&
      inBytes !== 2 &&
      inBytes !== 4 &&
      !(inBytes === 8 && valueType === 'i64')
    ) {
      throw new Error(
        `Can't store/load ${inBytes} bytes to memory from/to ${valueType} using store/load instruction.`
      );
    }
    bytes = inBytes;
  } else {
    switch (valueType) {
      case 'f32':
      case 'i32':
        bytes = 4;
        break;
      case 'f64':
      case 'i64':
        bytes = 8;
        break;
    }
  }
  return { offset, align: inAlign ?? bytes, bytes };
}

function memLoad(
  module: binaryen.Module,
  props: MemProps & { sign?: Sign },
  ptr: binaryen.ExpressionRef
) {
  const { offset, align, bytes } = memDefaults(props);
  const { valueType, sign = Sign.Signed } = props;

  let loadFunc;
  switch (valueType) {
    case NumberType.i32: {
      const typed = module.i32;
      switch (bytes) {
        case 1:
          loadFunc = sign === Sign.Signed ? typed.load8_s : typed.load8_u;
          break;
        case 2:
          loadFunc = sign === Sign.Signed ? typed.load16_s : typed.load16_u;
          break;
        case 4:
          loadFunc = typed.load;
          break;
        default:
          throw new Error(`Can't load more than 4 bytes into an i32`);
      }
      break;
    }
    case NumberType.i64: {
      const typed = module.i64;
      switch (bytes) {
        case 1:
          loadFunc = sign === Sign.Signed ? typed.load8_s : typed.load8_u;
          break;
        case 2:
          loadFunc = sign === Sign.Signed ? typed.load16_s : typed.load16_u;
          break;
        case 4:
          loadFunc = sign === Sign.Signed ? typed.load32_s : typed.load32_u;
          break;
        case 8:
          loadFunc = typed.load;
          break;
      }
      break;
    }
    default:
      throw new Error(`Don't know how to load into ${valueType} yet`);
  }
  return loadFunc(offset, align, ptr);
}

function memStore(
  module: binaryen.Module,
  props: MemProps,
  ptr: binaryen.ExpressionRef,
  value: binaryen.ExpressionRef
) {
  const { offset, align, bytes } = memDefaults(props);
  const { valueType } = props;
  let storeFunc;
  switch (valueType) {
    case NumberType.i32: {
      const typed = module.i32;
      if (bytes === 8) {
        throw new Error(`Can't store more than 4 bytes from a ${valueType}`);
      }
      storeFunc = { 1: typed.store8, 2: typed.store16, 4: typed.store }[bytes];
      break;
    }
    case NumberType.i64: {
      const typed = module.i64;
      storeFunc = {
        1: typed.store8,
        2: typed.store16,
        4: typed.store32,
        8: typed.store,
      }[bytes];
      break;
    }
    case NumberType.f32:
    case NumberType.f64:
      storeFunc = module[valueType].store;
      break;
  }
  return storeFunc(offset, align, ptr, value);
}

class SymbolRefCompiler extends IRCompiler<AST.SymbolRef> {
  override getLValue(): LValue {
    return {
      kind: 'static',
      location: this.getLocationForSymbolRef(this.root),
    };
  }

  compile() {
    const rvalue = this.getRValue();
    switch (rvalue.kind) {
      case 'direct':
        return rvalue.valueExpr;
    }
    throw new Error(
      'should not be compiling a symbol ref with an indirect rvalue'
    );
  }
}

export class BinaryExprCompiler extends IRCompiler<AST.BinaryExpr> {
  private pushNumberOps(left: AST.Expression, right: AST.Expression) {
    const targetType = this.matchTypes(left, right);
    const convert = (child: AST.Expression, value: binaryen.ExpressionRef) => {
      const childType = this.resolveType(child).toValueTypeOrThrow();
      if (childType === targetType) {
        return value;
      }
      if (isIntType(childType) && isFloatType(targetType)) {
        return this.context.module[targetType].convert_s[childType](value);
      }
      throw new Error(`Can't convert from a ${childType} to a ${targetType}`);
    };

    return [
      convert(left, this.compileChild(left)),
      convert(right, this.compileChild(right)),
    ] as [number, number];
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
    return targetType.toValueTypeOrThrow();
  }

  private opCompilers: Record<
    string,
    (left: AST.Expression, right: AST.Expression) => binaryen.ExpressionRef
  > = {
    [BinOp.ADD]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module[this.matchTypes(left, right)].add(
        ...this.pushNumberOps(left, right)
      ),
    [BinOp.SUB]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module[this.matchTypes(left, right)].sub(
        ...this.pushNumberOps(left, right)
      ),
    [BinOp.MUL]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module[this.matchTypes(left, right)].mul(
        ...this.pushNumberOps(left, right)
      ),
    [BinOp.DIV]: (left: AST.Expression, right: AST.Expression) => {
      const type = this.matchTypes(left, right);
      if (isFloatType(type)) {
        return this.context.module[type].div(
          ...this.pushNumberOps(left, right)
        );
      }
      return this.context.module[type].div_s(
        ...this.pushNumberOps(left, right)
      );
    },
    [BinOp.REM]: (left: AST.Expression, right: AST.Expression) => {
      const type = this.matchTypes(left, right);
      if (isIntType(type)) {
        // TODO: make this work with unsigned ints
        return this.context.module[type].rem_s(
          ...this.pushNumberOps(left, right)
        );
      }
      throw new Error(`Don't know how to compute remainder for floats yet`);
    },
    [BinOp.EQUAL_TO]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module[this.matchTypes(left, right)].eq(
        ...this.pushNumberOps(left, right)
      ),
    [BinOp.NOT_EQUAL_TO]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module[this.matchTypes(left, right)].ne(
        ...this.pushNumberOps(left, right)
      ),
    [BinOp.LESS_THAN]: (left: AST.Expression, right: AST.Expression) => {
      const type = this.matchTypes(left, right);
      if (isFloatType(type)) {
        return this.context.module[type].lt(...this.pushNumberOps(left, right));
      }
      // TODO: handle unsigned integer types
      return this.context.module[type].lt_s(...this.pushNumberOps(left, right));
    },
    [BinOp.GREATER_THAN]: (left: AST.Expression, right: AST.Expression) => {
      const type = this.matchTypes(left, right);
      if (isFloatType(type)) {
        return this.context.module[type].gt(...this.pushNumberOps(left, right));
      }
      // TODO: handle unsigned integer types
      return this.context.module[type].gt_s(...this.pushNumberOps(left, right));
    },
    [BinOp.LOGICAL_AND]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module.i32.and(
        this.compileChild(left),
        this.compileChild(right)
      ),
    [BinOp.LOGICAL_OR]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module.i32.or(
        this.compileChild(left),
        this.compileChild(right)
      ),
    [BinOp.ASSIGN]: (left: AST.Expression, right: AST.Expression) => {
      const leftType = this.resolveType(left);
      const rightType = this.resolveType(right);
      if (leftType !== rightType) {
        throw new Error(
          `ASSIGN: Can't assign value of type ${rightType} to symbol of type ${leftType}`
        );
      }
      const { module } = this.context;

      let tempLocation = this.context.allocationMap.getLocalOrThrow(
        this.root,
        'ASSIGN requires a temporary'
      );

      const lvalue = IRCompiler.forNode(left, this.context).getLValue();
      const rvalue = IRCompiler.forNode(right, this.context).getRValue();
      switch (lvalue.kind) {
        case 'immediate': {
          throw new Error(`Can't assign to an immediate value`);
        }
        case 'static': {
          const { location } = lvalue;
          switch (location.area) {
            case 'locals':
              if (rvalue.kind === 'address') {
                throw new Error(
                  `Can't fit a ${rvalue.type} in an ${location.area} ${location.valueType}`
                );
              }
              return ltee(module, location, rvalue.valueExpr);
            case 'globals':
              if (rvalue.kind === 'address') {
                throw new Error(
                  `Can't fit a ${rvalue.type} in an ${location.area} ${location.valueType}`
                );
              }
              return module.block(
                '',
                [
                  gset(module, location, rvalue.valueExpr),
                  gget(module, location),
                ],
                binaryen[location.valueType]
              );
            case 'stack': {
              const { arp } = this.context.funcAllocs;
              const arpPtr = lget(module, arp);
              if (rvalue.kind === 'direct') {
                const memProps = {
                  valueType: rightType.toValueTypeOrThrow(),
                  offset: location.offset,
                };
                return module.block(
                  '',
                  [
                    lset(module, tempLocation, arpPtr),
                    memStore(
                      module,
                      memProps,
                      lget(module, tempLocation),
                      rvalue.valueExpr
                    ),
                    memLoad(module, memProps, lget(module, tempLocation)),
                  ],
                  binaryen[rightType.toValueTypeOrThrow()]
                );
              } else {
                const size = rvalue.type.numBytes;
                const source = rvalue.valuePtrExpr;
                const dest = module.i32.add(
                  arpPtr,
                  module.i32.const(location.offset)
                );
                return module.block(
                  '',
                  [
                    lset(module, tempLocation, dest),
                    module.memory.copy(dest, source, module.i32.const(size)),
                    lget(module, tempLocation),
                  ],
                  binaryen.i32
                );
              }
            }
            default:
              throw new Error(
                `ASSIGN: don't know how to compile assignment to symbol located in ${location.area}`
              );
          }
        }
        case 'dynamic': {
          const { ptr } = lvalue;
          const memProps = {
            valueType: leftType.toValueTypeOrThrow(),
            offset: 0,
            align: leftType.numBytes,
            bytes: leftType.numBytes,
          };
          if (rvalue.kind === 'direct') {
            return module.block(
              '',
              [
                lset(module, tempLocation, ptr),
                memStore(
                  module,
                  memProps,
                  lget(module, tempLocation),
                  rvalue.valueExpr
                ),
                memLoad(module, memProps, lget(module, tempLocation)),
              ],
              binaryen[rightType.toValueTypeOrThrow()]
            );
          } else {
            throw new Error(
              `Haven't implemented dynamic memcopy for assignment yet`
            );
          }
        }
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
      const valueType = refExprType.toValueTypeOrThrow();
      const { module } = this.context;
      const ptr = module[valueType].add(
        this.compileChild(refExpr),
        module[valueType].mul(
          this.compileChild(indexExpr),
          module[valueType].const(align, align)
        )
      );
      return memLoad(
        module,
        { valueType, offset: 0, align, bytes: align },
        ptr
      );
    },
  };

  private lvalues: Record<
    string,
    (left: AST.Expression, right: AST.Expression) => LValue
  > = {
    [BinOp.ARRAY_INDEX]: (
      left: AST.Expression,
      right: AST.Expression
    ): LValue => {
      const { module } = this.context;
      const leftType = this.resolveType(left);
      let numBytes = 4;
      if (leftType instanceof PointerType) {
        numBytes = leftType.toType.numBytes;
      } else {
        throw new Error(
          `Don't know how to compute offset for ${leftType.name}`
        );
      }
      const ptr = module.i32.add(
        this.compileChild(left),
        module.i32.mul(this.compileChild(right), module.i32.const(numBytes))
      );
      return { kind: 'dynamic', ptr };
    },
  };

  getLValue(): LValue {
    const { op, left, right } = this.root.fields;
    const getLValue =
      this.lvalues[op] ??
      (() => {
        throw new Error(`Don't know how to get LValue for ${op}`);
      });
    return getLValue(left, right);
  }

  getRValue() {
    const { op, left, right } = this.root.fields;
    const compile =
      this.opCompilers[op] ??
      (() => {
        throw new Error(`Don't know how to compile ${op} with binaryen yet`);
      });
    return rvalueDirect(
      this.context.typeCache.get(this.root),
      compile(left, right)
    );
  }

  compile(): binaryen.ExpressionRef {
    return this.getRValue().valueExpr;
  }
}

class MemberAccessExprCompiler extends IRCompiler<AST.MemberAccessExpr> {
  getLValue(): LValue {
    const { left, right } = this.root.fields;

    let leftType = this.context.typeCache.get(left);
    if (leftType instanceof PointerType) {
      leftType = leftType.toType;
    }

    let elem: { type: BaseType; offset: number; id: string };
    if (leftType instanceof TupleType && right.name === 'NumberLiteral') {
      const index = right.fields.value;
      elem = { ...leftType.elements[index], id: String(index) };
      if (!elem) {
        throw new Error(`Invalid index ${index} for tuple ${leftType.name}`);
      }
    } else if (leftType instanceof RecordType && right.name === 'SymbolRef') {
      elem = {
        ...leftType.fields.get(right.fields.symbol)!,
        id: right.fields.symbol,
      };
      if (!elem) {
        throw new Error(
          `Invalid prop ${right.fields.symbol} for ${leftType.name}`
        );
      }
    } else {
      throw new Error(
        `Don't know how to lookup ${right.name} on a ${leftType.name}`
      );
    }
    let sign = undefined;
    if (elem.type instanceof NumericalType) {
      sign = elem.type.signed ? Sign.Signed : Sign.Unsigned;
    }

    const lvalue = IRCompiler.forNode(left, this.context).getLValue();
    switch (lvalue.kind) {
      case 'static': {
        const { location } = lvalue;
        switch (location.area) {
          case 'stack': {
            return {
              kind: 'static',
              location: {
                area: location.area,
                offset: location.offset + elem.offset,
                id: location.id + '.' + elem.id,
                dataType: elem.type,
              },
            };
          }
        }
      }
    }
    throw new Error(
      `Don't know how to compute LValue for ${this.root.name}...`
    );
  }

  compile() {
    const rvalue = this.getRValue();
    switch (rvalue.kind) {
      case 'direct':
        return rvalue.valueExpr;
    }
    throw new Error(
      `Should not be compiling a MemberAccessExpr for indirect access`
    );
  }
}

class CallExprCompiler extends IRCompiler<AST.CallExpr> {
  compile() {
    const { left, right } = this.root.fields;
    const { module } = this.context;
    const leftType = this.context.typeCache.get(left);
    if (leftType instanceof TupleType) {
      // we are constructing a tuple
      const { location, instr } = compileStackPush(this, leftType.numBytes);
      const fieldInstr = [];
      for (const [i, arg] of right.fields.args.entries()) {
        if (i >= leftType.elements.length) {
          throw new Error(`too many arguments specifed for tuple constructor`);
        }
        const elem = leftType.elements[i];
        const ptr = lget(module, location);
        const value = this.compileChild(arg);
        fieldInstr.push(
          memStore(
            module,
            {
              valueType: elem.type.toValueTypeOrThrow(),
              offset: elem.offset,
              align: elem.type.numBytes,
              bytes: elem.type.numBytes,
            },
            ptr,
            value
          )
        );
      }
      return module.block(
        '',
        [instr, ...fieldInstr, lget(module, location)],
        binaryen[location.valueType]
      );
    } else if (AST.isSymbolRef(left)) {
      const location = this.getLocationForSymbolRef(left);
      if (location.area !== Area.FUNCS) {
        throw new Error(
          `Expected ${left.fields.symbol} to resolve to a function`
        );
      }
      const tempLocation = this.context.allocationMap.getLocalOrThrow(
        this.root,
        'function calls need a temp local'
      );
      const returnType = location.funcType.returnType.equals(Intrinsics.void)
        ? binaryen.none
        : binaryen[location.funcType.returnType.toValueTypeOrThrow()];
      const funcCall = module.call(
        location.id,
        right.fields.args.map((arg) => this.compileChild(arg)),
        returnType
      );
      if (returnType !== binaryen.none) {
      }
      return module.block(
        '',
        [
          returnType === binaryen.none
            ? funcCall
            : lset(module, tempLocation, funcCall),
          gset(
            module,
            this.context.runtime.stackPointer,
            lget(module, this.context.funcAllocs.arp)
          ),
          returnType === binaryen.none
            ? module.nop()
            : lget(module, tempLocation),
        ],
        returnType
      );
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
    const value = this.compileChild(this.root.fields.expr);
    const { module } = this.context;
    if (destType instanceof NumericalType) {
      if (sourceType instanceof NumericalType) {
        const destValueType = destType.toValueTypeOrThrow();
        const sourceValueType = sourceType.toValueTypeOrThrow();

        if (isFloatType(destValueType)) {
          const typed = module[destValueType];
          // conversion to floats
          if (isIntType(sourceValueType)) {
            const signed = sourceType.signed
              ? typed.convert_s
              : typed.convert_u;
            return signed[sourceValueType](value);
          } else if (destValueType !== sourceValueType) {
            if (destValueType === 'f64' && sourceValueType === 'f32') {
              return module.f64.promote(value);
            } else if (force) {
              throw new Error(`NotImplemented: forced float demotion`);
            } else {
              throw new Error(`I don't implicitly demote floats`);
            }
          } else {
            return value;
          }
        } else {
          // conversion to integers
          if (isFloatType(sourceValueType)) {
            if (force) {
              throw new Error(`NotImplemented: truncate floats to int`);
            } else {
              throw new Error(`I don't implicitly truncate floats`);
            }
          } else if (sourceType.numBytes > destType.numBytes) {
            if (force) {
              return module[sourceValueType].and(
                value,
                module[sourceValueType].const(
                  (1 << (destType.numBytes * 8)) - 1,
                  (1 << (destType.numBytes * 8)) - 1
                )
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
            return value;
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
          return value;
        }
      } else {
        throw new Error(`Don't know how to cast from ${sourceType.name} yet`);
      }
    } else if (destType instanceof PointerType) {
      if (sourceType.equals(Intrinsics.i32) && force) {
        return value;
      } else {
        throw new Error(
          `I only convert i32s to pointer types, and only when forced.`
        );
      }
    }
    throw new Error(`Don't know how to cast to ${destType.name} yet`);
  }
}

class UnaryExprCompiler extends IRCompiler<AST.UnaryExpr> {
  compile(): binaryen.ExpressionRef {
    switch (this.root.fields.op) {
      case UnaryOp.ADDR_OF: {
        const { expr } = this.root.fields;
        const { module } = this.context;
        const lvalue = IRCompiler.forNode(expr, this.context).getLValue();
        switch (lvalue.kind) {
          case 'immediate': {
            throw new Error(`An immediate value has no address...`);
          }
          case 'static': {
            switch (lvalue.location.area) {
              case Area.FUNCS:
              case Area.LOCALS:
              case Area.GLOBALS: {
                throw new Error(
                  `values in ${lvalue.location.area} do not have addresses`
                );
              }
              case Area.DATA: {
                return module.i32.const(lvalue.location.memIndex);
              }
              case Area.STACK: {
                const { arp } = this.context.funcAllocs;
                const { location } = lvalue;
                return module.i32.add(
                  lget(module, arp),
                  module.i32.const(location.offset)
                );
              }
            }
            break;
          }
          case 'dynamic': {
            return lvalue.ptr;
          }
        }
        break;
      }
      default:
        throw new Error(`UnaryExprCompiler: unknown op ${this.root.fields.op}`);
    }
  }
}

class ExprStatementCompiler extends IRCompiler<AST.ExprStatement> {
  compile() {
    const value = this.compileChild(this.root.fields.expr);
    if (this.resolveType(this.root.fields.expr) === Intrinsics.void) {
      return value;
    }
    return this.context.module.drop(value);
  }
}

class ArgListCompiler extends IRCompiler<AST.ArgList> {
  compile(): binaryen.ExpressionRef {
    throw new Error(`This should't be used anymore...`);
  }
}

class NumberLiteralCompiler extends IRCompiler<
  AST.NumberLiteral | AST.CharLiteral
> {
  getRValue() {
    const type = this.resolveType(this.root);
    const valueType = type.toValueTypeOrThrow();
    return rvalueDirect(
      type,
      this.context.module[valueType].const(
        this.root.fields.value,
        this.root.fields.value
      )
    );
  }

  compile() {
    const rvalue = this.getRValue();
    this.context.setDebugLocation(rvalue.valueExpr, this.root);
    return rvalue.valueExpr;
  }
}

export class BooleanLiteralCompiler extends IRCompiler<AST.BooleanLiteral> {
  compile() {
    const value = this.root.fields.value ? 1 : 0;
    return this.context.module.i32.const(value);
  }
}

function gget(module: binaryen.Module, location: GlobalStorageLocation) {
  return module.global.get(location.id, binaryen[location.valueType]);
}

function gset(
  module: binaryen.Module,
  location: GlobalStorageLocation,
  value: binaryen.ExpressionRef
) {
  return module.global.set(location.id, value);
}

function lget(module: binaryen.Module, location: LocalStorageLocation) {
  return module.local.get(location.offset, binaryen[location.valueType]);
}

function ltee(
  module: binaryen.Module,
  location: LocalStorageLocation,
  value: binaryen.ExpressionRef
) {
  return module.local.tee(location.offset, value, binaryen[location.valueType]);
}

function lset(
  module: binaryen.Module,
  location: LocalStorageLocation,
  value: binaryen.ExpressionRef
) {
  return module.local.set(location.offset, value);
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
  const { module } = ir.context;
  const instr = gset(
    module,
    ir.context.runtime.stackPointer,
    ltee(
      module,
      location,
      module.i32.sub(
        gget(module, ir.context.runtime.stackPointer),
        module.i32.const(numBytes)
      )
    )
  );

  return {
    location,
    instr,
  };
}

class ArrayLiteralCompiler extends IRCompiler<AST.ArrayLiteral> {
  compile() {
    const arrayType = this.resolveType(this.root);
    if (!(arrayType instanceof PointerType)) {
      throw new Error('unexpected type for array literal');
    }
    const { elements } = this.root.fields;

    const { instr, location } = compileStackPush(
      this,
      arrayType.numBytes * elements.length
    );
    const { module } = this.context;

    const fieldInstr = [];
    for (const [i, prop] of elements.entries()) {
      const ptr = lget(module, location);
      const value = this.compileChild(prop);
      fieldInstr.push(
        memStore(
          module,
          {
            valueType: arrayType.toType.toValueTypeOrThrow(),
            offset: i * 4,
            align: 4,
          },
          ptr,
          value
        )
      );
    }
    return module.block(
      '',
      [instr, ...fieldInstr, lget(module, location)],
      binaryen[location.valueType]
    );
  }
}

class StructLiteralCompiler extends IRCompiler<AST.StructLiteral> {
  getRValue() {
    const structType = this.resolveType(this.root);
    if (!(structType instanceof RecordType)) {
      throw new Error(
        `unexpected type for struct literal... should pointer to a record`
      );
    }

    const { instr, location } = compileStackPush(this, structType.numBytes);

    const { module } = this.context;

    const fieldInstr = [];
    for (const [i, prop] of this.root.fields.props.entries()) {
      const propType = structType.fields.get(prop.fields.symbol);
      if (!propType) {
        throw new Error(
          `prop ${prop.fields.symbol} does not exist on struct ${this.root.fields.symbol.fields.symbol}`
        );
      }
      const ptr = lget(module, location);
      const value = this.compileChild(prop.fields.expr);
      fieldInstr.push(
        memStore(
          module,
          {
            valueType: propType.type.toValueTypeOrThrow(),
            offset: propType.offset,
            align: propType.type.numBytes,
            bytes: propType.type.numBytes,
          },
          ptr,
          value
        )
      );
    }

    return rvalueAddress(
      structType,
      module.block(
        '',
        [instr, ...fieldInstr, lget(module, location)],
        binaryen[location.valueType]
      )
    );
  }
  compile() {
    return this.getRValue().valuePtrExpr;
  }
}

class DataLiteralCompiler extends IRCompiler<AST.DataLiteral> {
  compile() {
    const location = this.context.allocationMap.getDataOrThrow(this.root);
    return this.context.module.i32.const(location.memIndex);
  }
}
