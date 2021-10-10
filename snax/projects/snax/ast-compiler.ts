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
import { getPropNameOrThrow } from './ast-util.js';
import { CompilerError } from './errors.js';

export const PAGE_SIZE = 65536;

abstract class ASTCompiler<
  Root extends AST.ASTNode = AST.ASTNode,
  Context = unknown
> {
  root: Root;
  context: Context;

  constructor(root: Root, context: Context) {
    this.root = root;
    this.context = context;
  }

  protected error(message: string): CompilerError {
    return new CompilerError(this.root, message);
  }
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
export abstract class StmtCompiler<
  Root extends AST.ASTNode
> extends ASTCompiler<Root, IRCompilerContext> {
  static forNode(
    node: CompilesToIR,
    context: IRCompilerContext
  ): StmtCompiler<AST.ASTNode> {
    switch (node.name) {
      case 'ExprStatement':
        return new ExprStatementCompiler(node, context);
      case 'Block':
        return new BlockCompiler(node, context);
      case 'RegStatement':
        return new RegStatementCompiler(node, context);
      case 'LetStatement':
        return new LetStatementCompiler(node, context);
      case 'IfStatement':
        return new IfStatementCompiler(node, context);
      case 'WhileStatement':
        return new WhileStatementCompiler(node, context);
      case 'ReturnStatement':
        return new ReturnStatementCompiler(node, context);
    }
    throw new Error(
      `ASTCompiler: No compiler available for node ${(node as any).name}`
    );
  }

  abstract compile(): binaryen.ExpressionRef;

  protected compileChildStmt<N extends AST.Statement>(
    child: N
  ): binaryen.ExpressionRef {
    const exprRef = StmtCompiler.forNode(child, this.context).compile();
    this.context.setDebugLocation(exprRef, child);
    return exprRef;
  }
}

type LValue =
  | { kind: 'immediate' }
  | { kind: 'static'; location: StorageLocation }
  | { kind: 'dynamic'; ptr: binaryen.ExpressionRef; offset: number };
function lvalueStatic<T extends StorageLocation>(location: T) {
  return { kind: 'static' as const, location };
}
function lvalueDynamic(ptr: binaryen.ExpressionRef, offset: number = 0) {
  return { kind: 'dynamic' as const, ptr, offset };
}

class DirectRValue {
  readonly kind = 'direct' as const;
  readonly type: BaseType;
  readonly valueExpr: binaryen.ExpressionRef;
  constructor(type: BaseType, valueExpr: binaryen.ExpressionRef) {
    this.type = type;
    this.valueExpr = valueExpr;
  }
  expectDirect(): DirectRValue {
    return this;
  }
  expectAddress(): AddressRValue {
    throw new Error(`Not an address`);
  }
}

class AddressRValue {
  readonly kind = 'address' as const;
  readonly type: BaseType;
  readonly valuePtrExpr: binaryen.ExpressionRef;
  constructor(type: BaseType, valuePtrExpr: binaryen.ExpressionRef) {
    this.type = type;
    this.valuePtrExpr = valuePtrExpr;
  }
  expectDirect(): DirectRValue {
    throw new Error(`Not direct`);
  }
  expectAddress(): AddressRValue {
    return this;
  }
}
type RValue = DirectRValue | AddressRValue;

function rvalueDirect(type: BaseType, valueExpr: binaryen.ExpressionRef) {
  return new DirectRValue(type, valueExpr);
}
function rvalueAddress(type: BaseType, valuePtrExpr: binaryen.ExpressionRef) {
  return new AddressRValue(type, valuePtrExpr);
}
function unwrapRValueExpr(rvalue: RValue) {
  if (rvalue.kind === 'direct') {
    return rvalue.valueExpr;
  } else {
    return rvalue.valuePtrExpr;
  }
}

class ReturnStatementCompiler extends StmtCompiler<AST.ReturnStatement> {
  compile() {
    let value: number | undefined = undefined;
    const { expr } = this.root.fields;
    if (expr) {
      const rvalue = ExprCompiler.forNode(expr, this.context).getRValue();
      value = unwrapRValueExpr(rvalue);
      this.context.setDebugLocation(value, expr);
    }
    return this.context.module.return(value);
  }
}

export class BlockCompiler extends StmtCompiler<AST.Block> {
  liveLocals: LocalAllocation[] = [];

  compile() {
    const instr: number[] = [];
    this.root.fields.statements
      .filter((astNode) => !AST.isFuncDecl(astNode))
      .forEach((astNode) => instr.push(this.compileChildStmt(astNode)));
    return this.context.module.block('', instr);
  }
}

export type ModuleCompilerOptions = {
  includeRuntime?: boolean;
  includeWASI?: boolean;
};
export class ModuleCompiler extends ASTCompiler<AST.File> {
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
        throw this.error(`this should never happen`);
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
        throw this.error(`I need a decl for malloc`);
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
        ExprCompiler.forNode(global.fields.expr, {
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
        })
          .getRValue()
          .expectDirect().valueExpr
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
        throw this.error(`Unexpected type for funcDecl: ${funcType.name}`);
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

  compile(): binaryen.FunctionRef {
    const funcType = this.context.typeCache.get(this.root);
    if (!(funcType instanceof FuncType)) {
      throw this.error('unexpected type of function');
    }

    const params = binaryen.createType(
      this.root.fields.parameters.fields.parameters.map((param) => {
        const paramType = this.context.typeCache.get(param);
        return binaryen[paramType.toValueTypeOrThrow()];
      })
    );

    let results: number;
    if (funcType.returnType.equals(Intrinsics.void)) {
      results = binaryen.none;
    } else {
      const valueType = funcType.returnType.toValueType();
      if (valueType) {
        results = binaryen[valueType];
      } else {
        // this doesn't fit into a register, so the wasm function
        // will return a pointer.
        results = binaryen.i32;
      }
    }

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

class RegStatementCompiler extends StmtCompiler<AST.RegStatement> {
  compile() {
    const location = this.context.allocationMap.getLocalOrThrow(
      this.root,
      'reg statements need a local'
    );
    const { expr } = this.root.fields;
    if (expr) {
      const exprType = this.context.typeCache.get(expr);
      exprType.toValueTypeOrThrow();
      const rvalue = ExprCompiler.forNode(expr, this.context).getRValue();
      if (rvalue.kind === 'direct') {
        this.context.setDebugLocation(rvalue.valueExpr, expr);
        return this.context.module.local.set(location.offset, rvalue.valueExpr);
      } else {
        throw this.error(
          `can't store this value in a register: ${rvalue.type.name}`
        );
      }
    }
    return this.context.module.nop();
  }
}

class LetStatementCompiler extends StmtCompiler<AST.LetStatement> {
  compile() {
    const location = this.context.allocationMap.getStackOrThrow(
      this.root,
      'let statements need a local'
    );
    const { expr } = this.root.fields;
    const type = this.context.typeCache.get(this.root);
    const { module } = this.context;
    const { arp } = this.context.funcAllocs;

    let dest = lget(module, arp);

    if (expr) {
      throw this.error(
        `LetStatement with expr should have been desugared into let statement + assignment statement`
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

export class IfStatementCompiler extends StmtCompiler<AST.IfStatement> {
  compile() {
    const { condExpr, thenBlock, elseBlock } = this.root.fields;
    const cond = ExprCompiler.forNode(condExpr, this.context)
      .getRValue()
      .expectDirect().valueExpr;
    return this.context.module.if(
      cond,
      this.compileChildStmt(thenBlock),
      this.compileChildStmt(elseBlock)
    );
  }
}

export class WhileStatementCompiler extends StmtCompiler<AST.WhileStatement> {
  compile() {
    const { module } = this.context;
    const { condExpr, thenBlock } = this.root.fields;
    const cond = ExprCompiler.forNode(condExpr, this.context)
      .getRValue()
      .expectDirect().valueExpr;
    const value = this.compileChildStmt(thenBlock);
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
  const { valueType } = props;

  const getSign = () => {
    if (props.sign === undefined) {
      throw new Error(`memLoad requires a sign to be specified`);
    }
    return props.sign;
  };

  let loadFunc;
  switch (valueType) {
    case NumberType.i32: {
      const typed = module.i32;
      switch (bytes) {
        case 1:
          loadFunc = getSign() === Sign.Signed ? typed.load8_s : typed.load8_u;
          break;
        case 2:
          loadFunc =
            getSign() === Sign.Signed ? typed.load16_s : typed.load16_u;
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
          loadFunc = getSign() === Sign.Signed ? typed.load8_s : typed.load8_u;
          break;
        case 2:
          loadFunc =
            getSign() === Sign.Signed ? typed.load16_s : typed.load16_u;
          break;
        case 4:
          loadFunc =
            getSign() === Sign.Signed ? typed.load32_s : typed.load32_u;
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

export abstract class ExprCompiler<
  Root extends AST.Expression = AST.Expression
> extends ASTCompiler<Root, IRCompilerContext> {
  abstract getLValue(): LValue;
  abstract getRValue(): RValue;

  deref(lvalue: LValue, type: BaseType): RValue {
    const { module } = this.context;

    switch (lvalue.kind) {
      case 'immediate': {
        throw this.error(
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
            const ptr = lget(module, arp);
            return this.deref(lvalueDynamic(ptr, location.offset), type);
          }

          default:
            throw this.error(
              `SymbolRefCompiler: don't know how to compile reference to a location in ${location.area}`
            );
        }
      }
      case 'dynamic': {
        const valueType = type.toValueType();
        if (valueType) {
          let sign = Sign.Signed;
          if (type instanceof NumericalType) {
            sign = type.sign;
          }
          return rvalueDirect(
            type,
            this.memLoad(
              {
                valueType,
                offset: lvalue.offset,
                bytes: type.numBytes,
                sign,
              },
              lvalue.ptr
            )
          );
        }
        return rvalueAddress(type, lvalue.ptr);
      }
    }
  }

  memLoad(props: MemProps & { sign?: Sign }, ptr: binaryen.ExpressionRef) {
    try {
      return memLoad(this.context.module, props, ptr);
    } catch (e) {
      throw this.error((e as Error).message);
    }
  }

  copy(
    lvalue: LValue,
    rvalue: RValue,
    tempLocation?: LocalStorageLocation
  ): binaryen.ExpressionRef {
    const { module, funcAllocs } = this.context;
    switch (lvalue.kind) {
      case 'immediate': {
        throw this.error(`Can't assign to an immediate value`);
      }
      case 'static': {
        const { location } = lvalue;
        switch (location.area) {
          case 'locals':
            if (rvalue.kind === 'address') {
              throw this.error(
                `Can't fit a ${rvalue.type} in an ${location.area} ${location.valueType}`
              );
            }
            return ltee(module, location, rvalue.valueExpr);
          case 'globals':
            if (rvalue.kind === 'address') {
              throw this.error(
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
            const { arp } = funcAllocs;
            const ptr = lget(module, arp);
            return this.copy(
              lvalueDynamic(ptr, location.offset),
              rvalue,
              tempLocation
            );
            break;
          }
          default:
            throw this.error(
              `ASSIGN: don't know how to compile assignment to symbol located in ${location.area}`
            );
        }
        break;
      }
      case 'dynamic': {
        const { ptr } = lvalue;
        switch (rvalue.kind) {
          case 'direct': {
            let sign = Sign.Signed;
            if (rvalue.type instanceof NumericalType) {
              sign = rvalue.type.sign;
            }
            const valueType = rvalue.type.toValueTypeOrThrow();
            const memProps = {
              valueType,
              offset: lvalue.offset,
              bytes: rvalue.type.numBytes,
              sign,
            };
            if (tempLocation) {
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
                  this.memLoad(memProps, lget(module, tempLocation)),
                ],
                binaryen[valueType]
              );
            } else {
              return memStore(module, memProps, ptr, rvalue.valueExpr);
            }
          }
          case 'address': {
            const size = rvalue.type.numBytes;
            const source = rvalue.valuePtrExpr;
            const dest = module.i32.add(ptr, module.i32.const(lvalue.offset));
            if (tempLocation) {
              return module.block(
                '',
                [
                  lset(module, tempLocation, dest),
                  module.memory.copy(dest, source, module.i32.const(size)),
                  lget(module, tempLocation),
                ],
                binaryen.i32
              );
            } else {
              return module.memory.copy(dest, source, module.i32.const(size));
            }
          }
        }
      }
    }
  }

  static forNode(
    node: AST.Expression,
    context: IRCompilerContext
  ): ExprCompiler<AST.Expression> {
    switch (node.name) {
      case 'CastExpr':
        return new CastExprCompiler(node, context);
      case 'BinaryExpr':
        return new BinaryExprCompiler(node, context);
      case 'CallExpr':
        return new CallExprCompiler(node, context);
      case 'MemberAccessExpr':
        return new MemberAccessExprCompiler(node, context);
      case 'NumberLiteral':
      case 'CharLiteral':
        return new NumberLiteralCompiler(node, context);
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
      case 'UnaryExpr':
        return new UnaryExprCompiler(node, context);
    }
    throw new Error(
      `ASTCompiler: No compiler available for node ${(node as any).name}`
    );
  }

  getChildRValue<N extends AST.Expression>(child: N): RValue {
    const rvalue = ExprCompiler.forNode(child, this.context).getRValue();
    this.context.setDebugLocation(unwrapRValueExpr(rvalue), child);
    return rvalue;
  }

  // compile(): binaryen.ExpressionRef {
  //   throw new Error(
  //     'should not be calling compile() on an ExpressionCompiler. Use getRValue() instead.'
  //   );
  // }
}

class SymbolRefCompiler extends ExprCompiler<AST.SymbolRef> {
  override getRValue(): RValue {
    const lvalue = this.getLValue();
    const type = this.context.typeCache.get(this.root);
    return this.deref(lvalue, type);
  }

  override getLValue() {
    const symbolRecord = this.context.refMap.get(this.root);
    if (!symbolRecord) {
      throw this.error(
        `ASTCompiler: can't compile reference to unresolved symbol ${this.root.fields.symbol}`
      );
    }
    const location = this.context.allocationMap.get(symbolRecord.declNode);
    if (!location) {
      throw this.error(
        `ASTCompiler: Can't compile reference to unlocated symbol ${this.root.fields.symbol}`
      );
    }
    return lvalueStatic(location);
  }
}

export class BinaryExprCompiler extends ExprCompiler<AST.BinaryExpr> {
  private pushNumberOps(left: AST.Expression, right: AST.Expression) {
    const targetType = this.matchTypes(left, right);
    const convert = (child: AST.Expression) => {
      const rvalue = this.getChildRValue(child);
      const childValueType = rvalue.type.toValueTypeOrThrow();
      const targetValueType = targetType.toValueTypeOrThrow();
      if (rvalue.kind !== 'direct') {
        throw new Error(`can't convert an address rvalue yet...`);
      }
      if (childValueType === targetValueType) {
        return rvalue;
      }
      if (isIntType(childValueType) && isFloatType(targetValueType)) {
        return rvalueDirect(
          targetType,
          this.context.module[targetValueType].convert_s[childValueType](
            rvalue.valueExpr
          )
        );
      }
      throw this.error(
        `Can't convert from a ${childValueType} to a ${targetType}`
      );
    };

    return [convert(left).valueExpr, convert(right).valueExpr] as [
      binaryen.ExpressionRef,
      binaryen.ExpressionRef
    ];
  }

  private matchTypes(left: AST.Expression, right: AST.Expression) {
    const leftType = this.context.typeCache.get(left);
    const rightType = this.context.typeCache.get(right);
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
      throw this.error("pushNumberOps: don't know how to cast to number");
    }
    return targetType;
  }

  private opCompilers: Record<
    string,
    (left: AST.Expression, right: AST.Expression) => binaryen.ExpressionRef
  > = {
    [BinOp.ADD]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module[
        this.matchTypes(left, right).toValueTypeOrThrow()
      ].add(...this.pushNumberOps(left, right)),
    [BinOp.SUB]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module[
        this.matchTypes(left, right).toValueTypeOrThrow()
      ].sub(...this.pushNumberOps(left, right)),
    [BinOp.MUL]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module[
        this.matchTypes(left, right).toValueTypeOrThrow()
      ].mul(...this.pushNumberOps(left, right)),
    [BinOp.DIV]: (left: AST.Expression, right: AST.Expression) => {
      const type = this.matchTypes(left, right).toValueTypeOrThrow();
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
      const type = this.matchTypes(left, right).toValueTypeOrThrow();
      if (isIntType(type)) {
        // TODO: make this work with unsigned ints
        return this.context.module[type].rem_s(
          ...this.pushNumberOps(left, right)
        );
      }
      throw this.error(`Don't know how to compute remainder for floats yet`);
    },
    [BinOp.EQUAL_TO]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module[this.matchTypes(left, right).toValueTypeOrThrow()].eq(
        ...this.pushNumberOps(left, right)
      ),
    [BinOp.NOT_EQUAL_TO]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module[this.matchTypes(left, right).toValueTypeOrThrow()].ne(
        ...this.pushNumberOps(left, right)
      ),
    [BinOp.LESS_THAN]: (left: AST.Expression, right: AST.Expression) => {
      const type = this.matchTypes(left, right).toValueTypeOrThrow();
      if (isFloatType(type)) {
        return this.context.module[type].lt(...this.pushNumberOps(left, right));
      }
      // TODO: handle unsigned integer types
      return this.context.module[type].lt_s(...this.pushNumberOps(left, right));
    },
    [BinOp.GREATER_THAN]: (left: AST.Expression, right: AST.Expression) => {
      const type = this.matchTypes(left, right).toValueTypeOrThrow();
      if (isFloatType(type)) {
        return this.context.module[type].gt(...this.pushNumberOps(left, right));
      }
      // TODO: handle unsigned integer types
      return this.context.module[type].gt_s(...this.pushNumberOps(left, right));
    },
    [BinOp.LOGICAL_AND]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module.i32.and(
        this.getChildRValue(left).expectDirect().valueExpr,
        this.getChildRValue(right).expectDirect().valueExpr
      ),
    [BinOp.LOGICAL_OR]: (left: AST.Expression, right: AST.Expression) =>
      this.context.module.i32.or(
        this.getChildRValue(left).expectDirect().valueExpr,
        this.getChildRValue(right).expectDirect().valueExpr
      ),
    [BinOp.ASSIGN]: (left: AST.Expression, right: AST.Expression) => {
      const leftType = this.context.typeCache.get(left);
      const rightType = this.context.typeCache.get(right);
      if (!leftType.equals(rightType)) {
        throw this.error(
          `ASSIGN: Can't assign value of type ${rightType} to symbol of type ${leftType}`
        );
      }

      let tempLocation = this.context.allocationMap.getLocalOrThrow(
        this.root,
        'ASSIGN requires a temporary'
      );

      const lvalue = ExprCompiler.forNode(left, this.context).getLValue();
      const rvalue = ExprCompiler.forNode(right, this.context).getRValue();
      return this.copy(lvalue, rvalue, tempLocation);
    },
    [BinOp.ARRAY_INDEX]: (
      refExpr: AST.Expression,
      indexExpr: AST.Expression
    ) => {
      const refExprType = this.context.typeCache.get(refExpr);
      if (!(refExprType instanceof PointerType)) {
        throw this.error(
          `Don't know how to compile indexing operation for a ${refExprType.name}`
        );
      }
      let align = refExprType.toType.numBytes;
      let sign = Sign.Signed;
      if (refExprType.toType instanceof NumericalType) {
        sign = refExprType.toType.sign;
      }
      const valueType = refExprType.toValueTypeOrThrow();
      const { module } = this.context;
      const ptr = module[valueType].add(
        this.getChildRValue(refExpr).expectDirect().valueExpr,
        module[valueType].mul(
          this.getChildRValue(indexExpr).expectDirect().valueExpr,
          module[valueType].const(align, align)
        )
      );
      return this.memLoad(
        { valueType, offset: 0, align, bytes: align, sign },
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
      const leftType = this.context.typeCache.get(left);
      let numBytes = 4;
      if (leftType instanceof PointerType) {
        numBytes = leftType.toType.numBytes;
      } else {
        throw this.error(
          `Don't know how to compute offset for ${leftType.name}`
        );
      }
      const ptr = module.i32.add(
        this.getChildRValue(left).expectDirect().valueExpr,
        module.i32.mul(
          this.getChildRValue(right).expectDirect().valueExpr,
          module.i32.const(numBytes)
        )
      );
      return lvalueDynamic(ptr);
    },
  };

  getLValue(): LValue {
    const { op, left, right } = this.root.fields;
    const getLValue =
      this.lvalues[op] ??
      (() => {
        throw this.error(`Don't know how to get LValue for ${op}`);
      });
    return getLValue(left, right);
  }

  getRValue() {
    const { op, left, right } = this.root.fields;
    const compile =
      this.opCompilers[op] ??
      (() => {
        throw this.error(`Don't know how to compile ${op} yet`);
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

class MemberAccessExprCompiler extends ExprCompiler<AST.MemberAccessExpr> {
  private getLeftType() {
    const leftType = this.context.typeCache.get(this.root.fields.left);
    if (leftType instanceof PointerType) {
      return leftType.toType;
    }
    return leftType;
  }

  private getElem() {
    const { right } = this.root.fields;
    const leftType = this.getLeftType();
    if (leftType instanceof RecordType) {
      const propName = getPropNameOrThrow(right);
      return {
        ...leftType.fields.get(propName)!,
        id: propName,
      };
    }
    throw this.error(
      `Don't know how to lookup ${right.name} on a ${leftType.name}`
    );
  }

  getLeftLValue(): LValue {
    const { left } = this.root.fields;
    const leftType = this.context.typeCache.get(left);
    if (leftType instanceof PointerType) {
      const ptrRValue = ExprCompiler.forNode(left, this.context).getRValue();
      switch (ptrRValue.kind) {
        case 'direct':
          return lvalueDynamic(ptrRValue.valueExpr);
        default:
          throw this.error(
            `Don't know how to deref a pointer with an address rvalue yet...`
          );
      }
    } else {
      return ExprCompiler.forNode(left, this.context).getLValue();
    }
  }

  getLValue(): LValue {
    const elem = this.getElem();

    const lvalue = this.getLeftLValue();
    switch (lvalue.kind) {
      case 'static': {
        const { location } = lvalue;
        switch (location.area) {
          case 'stack': {
            return lvalueStatic({
              area: location.area,
              offset: location.offset + elem.offset,
              id: location.id + '.' + elem.id,
              dataType: elem.type,
            });
          }
          default: {
            throw this.error(
              `Can't compute lvalue extension for static lvalue in ${location.area}`
            );
          }
        }
      }
      case 'dynamic': {
        return lvalueDynamic(lvalue.ptr, lvalue.offset + elem.offset);
      }
      default:
        throw this.error(
          `${this.root.name}: Don't know how to compute LValue for ${lvalue.kind} yet.`
        );
    }
  }

  getRValue() {
    const lvalue = this.getLValue();
    const type = this.context.typeCache.get(this.root);
    return this.deref(lvalue, type);
  }
}

class CallExprCompiler extends ExprCompiler<AST.CallExpr> {
  private getFuncLocation() {
    const { left } = this.root.fields;
    const lvalue = ExprCompiler.forNode(left, this.context).getLValue();
    if (lvalue.kind !== 'static' || lvalue.location.area !== Area.FUNCS) {
      throw this.error(`Can't call something thats not a function.`);
    }
    return lvalue.location;
  }

  getLValue(): LValue {
    throw new Error(`Don't know how to get lvalue for CallExpr`);
  }

  getRValue() {
    const { right } = this.root.fields;
    const { module } = this.context;
    const location = this.getFuncLocation();
    const tempLocation = this.context.allocationMap.getLocalOrThrow(
      this.root,
      'function calls need a temp local'
    );

    const { returnType } = location.funcType;

    const resetStackPointer = gset(
      module,
      this.context.runtime.stackPointer,
      lget(module, this.context.funcAllocs.arp)
    );
    const args = right.fields.args.map(
      (arg) => this.getChildRValue(arg).expectDirect().valueExpr
    );

    if (returnType.equals(Intrinsics.void)) {
      return rvalueDirect(
        returnType,
        module.block(
          '',
          [module.call(location.id, args, binaryen.none), resetStackPointer],
          binaryen.none
        )
      );
    } else {
      const valueType = returnType.toValueType();
      const returnValueType = valueType ? binaryen[valueType] : binaryen.i32;

      const block = module.block(
        '',
        [
          lset(
            module,
            tempLocation,
            module.call(location.id, args, returnValueType)
          ),
          resetStackPointer,
          lget(module, tempLocation),
        ],
        returnValueType
      );

      if (valueType) {
        return rvalueDirect(returnType, block);
      } else {
        return rvalueAddress(returnType, block);
      }
    }
  }
}

class CastExprCompiler extends ExprCompiler<AST.CastExpr> {
  getLValue(): LValue {
    throw new Error(`Cast expressions don't have lvalues`);
  }
  getRValue() {
    const { force } = this.root.fields;
    const sourceType = this.context.typeCache.get(this.root.fields.expr);
    const destType = this.context.typeCache.get(this.root.fields.typeExpr);
    const value = this.getChildRValue(this.root.fields.expr).expectDirect()
      .valueExpr;
    const { module } = this.context;
    if (destType instanceof NumericalType) {
      if (sourceType instanceof NumericalType) {
        const destValueType = destType.toValueTypeOrThrow();
        const sourceValueType = sourceType.toValueTypeOrThrow();

        if (isFloatType(destValueType)) {
          const typed = module[destValueType];
          // conversion to floats
          if (isIntType(sourceValueType)) {
            const signed =
              sourceType.sign == Sign.Signed
                ? typed.convert_s
                : typed.convert_u;
            return rvalueDirect(destType, signed[sourceValueType](value));
          } else if (destValueType !== sourceValueType) {
            if (destValueType === 'f64' && sourceValueType === 'f32') {
              return rvalueDirect(destType, module.f64.promote(value));
            } else if (force) {
              throw this.error(`NotImplemented: forced float demotion`);
            } else {
              throw this.error(`I don't implicitly demote floats`);
            }
          } else {
            return rvalueDirect(destType, value);
          }
        } else {
          // conversion to integers
          if (isFloatType(sourceValueType)) {
            if (force) {
              throw this.error(`NotImplemented: truncate floats to int`);
            } else {
              throw this.error(`I don't implicitly truncate floats`);
            }
          } else if (sourceType.numBytes > destType.numBytes) {
            if (force) {
              return rvalueDirect(
                destType,
                module[sourceValueType].and(
                  value,
                  module[sourceValueType].const(
                    (1 << (destType.numBytes * 8)) - 1,
                    (1 << (destType.numBytes * 8)) - 1
                  )
                )
              );
            } else {
              throw this.error(`I don't implicitly wrap to smaller sizes`);
            }
          } else if (
            sourceType.sign === Sign.Signed &&
            destType.sign == Sign.Unsigned
          ) {
            if (force) {
              throw this.error(`NotImplemented: forced dropping of sign`);
            } else {
              throw this.error(`I don't implicitly drop signs`);
            }
          } else {
            return rvalueDirect(destType, value);
          }
        }
      } else if (sourceType instanceof PointerType) {
        if (
          destType.interpretation === 'int' &&
          destType.numBytes < sourceType.numBytes
        ) {
          throw this.error(
            `${destType} doesn't hold enough bytes for a pointer`
          );
        } else {
          return rvalueDirect(destType, value);
        }
      } else {
        throw this.error(`Don't know how to cast from ${sourceType.name} yet`);
      }
    } else if (destType instanceof PointerType) {
      if (sourceType.equals(Intrinsics.i32) && force) {
        return rvalueDirect(destType, value);
      } else {
        throw this.error(
          `I only convert i32s to pointer types, and only when forced.`
        );
      }
    }
    throw this.error(`Don't know how to cast to ${destType.name} yet`);
  }
}

class UnaryExprCompiler extends ExprCompiler<AST.UnaryExpr> {
  getLValue(): LValue {
    throw new Error(`No lvalue for unary ${this.root.fields.op}`);
  }

  getRValue() {
    const type = this.context.typeCache.get(this.root);

    switch (this.root.fields.op) {
      case UnaryOp.ADDR_OF: {
        const { expr } = this.root.fields;
        const { module } = this.context;
        const lvalue = ExprCompiler.forNode(expr, this.context).getLValue();
        switch (lvalue.kind) {
          case 'immediate': {
            throw this.error(`An immediate value has no address...`);
          }
          case 'static': {
            switch (lvalue.location.area) {
              case Area.FUNCS:
              case Area.LOCALS:
              case Area.GLOBALS: {
                throw this.error(
                  `values in ${lvalue.location.area} do not have addresses`
                );
              }
              case Area.DATA: {
                return rvalueDirect(
                  type,
                  module.i32.const(lvalue.location.memIndex)
                );
              }
              case Area.STACK: {
                const { arp } = this.context.funcAllocs;
                const { location } = lvalue;
                return rvalueDirect(
                  type,
                  module.i32.add(
                    lget(module, arp),
                    module.i32.const(location.offset)
                  )
                );
              }
            }
            break;
          }
          case 'dynamic': {
            return rvalueDirect(type, lvalue.ptr);
          }
        }
        break;
      }
      default:
        throw this.error(
          `UnaryExprCompiler: unknown op ${this.root.fields.op}`
        );
    }
  }
}

class ExprStatementCompiler extends StmtCompiler<AST.ExprStatement> {
  compile() {
    const { expr } = this.root.fields;
    const rvalue = ExprCompiler.forNode(expr, this.context).getRValue();

    const value = unwrapRValueExpr(rvalue);
    this.context.setDebugLocation(value, expr);
    if (rvalue.type.equals(Intrinsics.void)) {
      return value;
    }
    return this.context.module.drop(value);
  }
}

class NumberLiteralCompiler extends ExprCompiler<
  AST.NumberLiteral | AST.CharLiteral
> {
  getRValue() {
    const type = this.context.typeCache.get(this.root);
    const valueType = type.toValueTypeOrThrow();
    return rvalueDirect(
      type,
      this.context.module[valueType].const(
        this.root.fields.value,
        this.root.fields.value
      )
    );
  }
  getLValue(): LValue {
    throw new Error(`NumberLiterals don't have lvalues`);
  }
}

export class BooleanLiteralCompiler extends ExprCompiler<AST.BooleanLiteral> {
  getRValue() {
    const value = this.root.fields.value ? 1 : 0;
    return rvalueDirect(
      this.context.typeCache.get(this.root),
      this.context.module.i32.const(value)
    );
  }
  getLValue(): LValue {
    throw new Error(`NumberLiterals don't have lvalues`);
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
function compileStackPush(
  ir: ASTCompiler<AST.ASTNode, IRCompilerContext>,
  numBytes: number
) {
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

class ArrayLiteralCompiler extends ExprCompiler<AST.ArrayLiteral> {
  getRValue() {
    const arrayType = this.context.typeCache.get(this.root);
    if (!(arrayType instanceof ArrayType)) {
      throw this.error('unexpected type for array literal');
    }

    const { instr, location } = compileStackPush(this, arrayType.numBytes);
    const { module } = this.context;

    const fieldInstr = [];
    const { elements } = this.root.fields;
    for (const [i, prop] of elements.entries()) {
      const ptr = lget(module, location);

      const rvalue = ExprCompiler.forNode(prop, this.context).getRValue();
      const lvalue = lvalueDynamic(ptr, i * arrayType.elementType.numBytes);
      fieldInstr.push(this.copy(lvalue, rvalue));
    }
    return rvalueAddress(
      arrayType,
      module.block(
        '',
        [instr, ...fieldInstr, lget(module, location)],
        binaryen.i32
      )
    );
  }
  getLValue(): LValue {
    throw new Error(`${this.root.name}s don't have lvalues`);
  }
}

class StructLiteralCompiler extends ExprCompiler<AST.StructLiteral> {
  getRValue() {
    const structType = this.context.typeCache.get(this.root);
    if (!(structType instanceof RecordType)) {
      throw this.error(
        `unexpected type for struct literal... should pointer to a record`
      );
    }

    const { instr, location } = compileStackPush(this, structType.numBytes);

    const { module } = this.context;

    const fieldInstr = [];
    for (const [i, prop] of this.root.fields.props.entries()) {
      const propType = structType.fields.get(prop.fields.symbol);
      if (!propType) {
        throw this.error(
          `prop ${prop.fields.symbol} does not exist on struct ${this.root.fields.symbol.fields.symbol}`
        );
      }
      const ptr = lget(module, location);

      const rvalue = ExprCompiler.forNode(
        prop.fields.expr,
        this.context
      ).getRValue();
      const lvalue = lvalueDynamic(ptr, propType.offset);
      fieldInstr.push(this.copy(lvalue, rvalue));
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
  getLValue(): LValue {
    throw new Error(`${this.root.name}s don't have lvalues`);
  }
}

class DataLiteralCompiler extends ExprCompiler<AST.DataLiteral> {
  getLValue() {
    return lvalueStatic(this.context.allocationMap.getDataOrThrow(this.root));
  }
  getRValue() {
    const location = this.getLValue().location;
    return rvalueDirect(
      this.context.typeCache.get(this.root),
      this.context.module.i32.const(location.memIndex)
    );
  }
}
