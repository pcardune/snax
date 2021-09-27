import { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import {
  ASTNode,
  FuncDecl,
  GlobalDecl,
  isBinaryExpr,
  isExternDecl,
  isUnaryExpr,
  ParameterList,
  DataLiteral,
} from './spec-gen.js';
import { children } from './spec-util.js';
import * as Wasm from './wasm-ast.js';
import * as IR from './stack-ir.js';
import type { ResolvedTypeMap } from './type-resolution.js';
import { BinOp, UnaryOp } from './snax-ast.js';
import type { BaseType } from './snax-types.js';

export enum Area {
  // corresponds directly to web assembly functions
  FUNCS = 'funcs',

  // corresponds directly to web assmebly locals, which only exist in the context of a web assembly function
  LOCALS = 'locals',

  // corresponds directly to web assembly gloabls
  GLOBALS = 'globals',

  // corresponds directly to web assembly data
  DATA = 'data',

  // corresponds to dynamically allocated area in the function call stack
  STACK = 'stack',
}
const { FUNCS, LOCALS, GLOBALS, DATA, STACK } = Area;

type BaseStorageLocation<T extends Area> = {
  area: T;
  offset: number;
  id: string;
};

export type GlobalStorageLocation = BaseStorageLocation<Area.GLOBALS> & {
  valueType: IR.NumberType;
};

export type LocalStorageLocation = BaseStorageLocation<Area.LOCALS>;

export type FuncStorageLocation = BaseStorageLocation<Area.FUNCS>;

export type StackStorageLocation = BaseStorageLocation<Area.STACK> & {
  dataType: BaseType;
};

export type DataLocation = BaseStorageLocation<Area.DATA> & {
  data: string;
  memIndex: number;
};

export type StorageLocation =
  | FuncStorageLocation
  | GlobalStorageLocation
  | LocalStorageLocation
  | DataLocation
  | StackStorageLocation;

export class AllocationMap extends OrderedMap<ASTNode, StorageLocation> {
  getOrThrow(node: ASTNode, message?: string): StorageLocation {
    const loc = this.get(node);
    if (!loc) {
      throw new Error(`No location found for ${node.name}: ${message}`);
    }
    return loc;
  }
  getFuncOrThrow(func: FuncDecl): FuncStorageLocation {
    const loc = this.get(func);
    if (!loc || loc.area !== Area.FUNCS) {
      throw new Error(
        `No funcs location found for function ${func.fields.symbol}`
      );
    }
    return loc;
  }
  getDataOrThrow(data: DataLiteral): DataLocation {
    const loc = this.get(data);
    if (!loc || loc.area !== Area.DATA) {
      throw new Error(`No data location found for data literal`);
    }
    return loc;
  }
  getLocalOrThrow(node: ASTNode, message?: string): LocalStorageLocation {
    const loc = this.get(node);
    if (!loc || loc.area !== Area.LOCALS) {
      throw new Error(`No locals location found for ${node.name}: ${message}`);
    }
    return loc;
  }
  getStackOrThrow(node: ASTNode, message?: string): StackStorageLocation {
    const loc = this.get(node);
    if (!loc || loc.area !== Area.STACK) {
      throw new Error(`No stack location found for ${node.name}: ${message}`);
    }
    return loc;
  }
  getGlobalOrThrow(node: ASTNode, message?: string): GlobalStorageLocation {
    const loc = this.get(node);
    if (!loc || loc.area !== Area.GLOBALS) {
      throw new Error(`No globals location found for ${node.name}: ${message}`);
    }
    return loc;
  }
}

interface ConstAllocator {
  allocateConstData(node: DataLiteral, data: string): DataLocation;
}

export type FuncAllocations = {
  locals: Wasm.Local[];
  arp: LocalStorageLocation;
  stack: StackStorageLocation[];
};

export class FuncAllocatorMap extends OrderedMap<FuncDecl, FuncLocalAllocator> {
  getByFuncNameOrThrow(funcName: string): FuncLocalAllocator {
    const index = this.findIndex(
      (funcDecl) => funcDecl.fields.symbol === funcName
    );
    if (index === undefined) {
      throw new Error(
        `No function allocator found for function name ${funcName}`
      );
    }
    return this.getAt(index)!;
  }
}

export class ModuleAllocator implements ConstAllocator {
  funcOffset = 0;
  globalOffset = 0;
  dataOffset = 0;
  memIndex = 0;
  allocationMap = new AllocationMap();
  funcAllocatorMap = new FuncAllocatorMap();

  private alloc<Loc extends StorageLocation>(
    node: FuncDecl | GlobalDecl | DataLiteral,
    location: Loc
  ) {
    this.allocationMap.set(node, location);
    return location;
  }

  allocateFunc(node: FuncDecl) {
    const funcLocalAllocator = new FuncLocalAllocator(
      this.allocationMap,
      node.fields.parameters
    );
    this.funcAllocatorMap.set(node, funcLocalAllocator);
    const id = `<${node.fields.symbol}>f${this.funcOffset}`;
    return {
      location: this.alloc(node, {
        area: FUNCS,
        offset: this.funcOffset++,
        id,
      }),
      localAllocator: funcLocalAllocator,
    };
  }

  allocateGlobal(valueType: IR.NumberType, node: GlobalDecl) {
    const id = `g${this.globalOffset}:${node.fields.symbol}`;
    return this.alloc(node, {
      area: GLOBALS,
      offset: this.globalOffset++,
      id,
      valueType,
    });
  }

  allocateConstData(node: DataLiteral, data: string) {
    const id = `d${this.dataOffset}`;
    let memIndex = this.memIndex;
    this.memIndex += data.length;
    return this.alloc(node, {
      area: DATA,
      offset: this.dataOffset++,
      id,
      data,
      memIndex,
    });
  }

  getLocalsForFunc(node: FuncDecl): FuncAllocations {
    let funcAllocator = this.funcAllocatorMap.get(node);
    if (!funcAllocator) {
      throw new Error(`No func allocator found for ${node.fields.symbol}`);
    }
    return {
      locals: funcAllocator.locals.map((l) => l.local),
      arp: {
        area: Area.LOCALS,
        offset: funcAllocator.arp.offset,
        id: funcAllocator.arp.local.fields.id,
      },
      stack: funcAllocator.stack,
    };
  }
}

export type LocalAllocation = {
  offset: number;
  live: boolean;
  local: Wasm.Local;
};

interface ILocalAllocator {
  allocateLocal(
    valueType: IR.NumberType,
    decl?: ASTNode,
    name?: string
  ): LocalAllocation;
  deallocateLocal(offset: LocalAllocation): void;
  allocateStack(
    dataType: BaseType,
    decl: ASTNode,
    name?: string
  ): StackStorageLocation;
}

export class NeverAllocator implements ILocalAllocator {
  allocateLocal(): LocalAllocation {
    throw new Error('this should never be used. please refactor');
  }
  deallocateLocal() {
    throw new Error('this should never be used. please refactor');
  }
  allocateStack(): StackStorageLocation {
    throw new Error('this should never be used. please refactor');
  }
  get parentAllocator() {
    return this;
  }
}

class FuncLocalAllocator implements ILocalAllocator {
  private allocationMap: AllocationMap;
  private localsOffset = 0;
  private localIdCounter = 0;
  private stackOffset = 0;

  locals: LocalAllocation[] = [];
  stack: StackStorageLocation[] = [];
  arp: LocalAllocation;

  constructor(allocationMap: AllocationMap, params: ParameterList) {
    this.allocationMap = allocationMap;

    for (const param of params.fields.parameters) {
      const id = `p${this.localsOffset}:${param.fields.symbol}`;
      this.allocationMap.set(param, {
        area: LOCALS,
        offset: this.localsOffset++,
        id,
      });
    }
    this.arp = this.makeLocalAllocation(IR.NumberType.i32, 'arp');
  }

  private makeLocalAllocation(valueType: IR.NumberType, name?: string) {
    const localAllocation = {
      offset: this.localsOffset++,
      live: true,
      local: new Wasm.Local(
        valueType,
        `<${name ?? 'temp'}>r${this.localIdCounter++}:${valueType}`
      ),
    };
    this.locals.push(localAllocation);
    return localAllocation;
  }

  allocateStack(type: BaseType, decl: ASTNode, name?: string) {
    const stackLoc: StackStorageLocation = {
      area: STACK,
      offset: this.stackOffset,
      dataType: type,
      id: `<${name ?? 'temp'}>s${this.stackOffset}-${
        this.stackOffset + type.numBytes
      }`,
    };
    this.allocationMap.set(decl, stackLoc);
    this.stack.push(stackLoc);
    this.stackOffset += type.numBytes;
    return stackLoc;
  }

  allocateLocal(
    valueType: IR.NumberType,
    decl?: ASTNode,
    name?: string
  ): LocalAllocation {
    let localAllocation: LocalAllocation;
    let freeLocal = this.locals.find(
      (l) => !l.live && l.local.fields.valueType === valueType
    );
    if (freeLocal) {
      freeLocal.live = true;
      localAllocation = freeLocal;
    } else {
      localAllocation = this.makeLocalAllocation(valueType, name);
    }

    if (decl) {
      this.allocationMap.set(decl, {
        area: LOCALS,
        offset: localAllocation.offset,
        id: localAllocation.local.fields.id,
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

class BlockAllocator implements ILocalAllocator {
  private parentAllocator: ILocalAllocator;
  private liveLocals: LocalAllocation[] = [];

  constructor(funcAllocator: ILocalAllocator) {
    this.parentAllocator = funcAllocator;
  }

  allocateStack(
    dataType: BaseType,
    decl: ASTNode,
    name?: string
  ): StackStorageLocation {
    return this.parentAllocator.allocateStack(dataType, decl, name);
  }

  allocateLocal(
    valueType: IR.NumberType,
    decl?: ASTNode,
    name?: string
  ): LocalAllocation {
    let localOffset = this.parentAllocator.allocateLocal(valueType, decl, name);
    this.liveLocals.push(localOffset);
    return localOffset;
  }

  deallocateLocal(offset: LocalAllocation): void {
    this.parentAllocator.deallocateLocal(offset);
    this.liveLocals = this.liveLocals.filter((o) => o !== offset);
  }

  deallocateBlock() {
    for (const offset of this.liveLocals) {
      this.parentAllocator.deallocateLocal(offset);
    }
  }
}

export function resolveMemory(root: ASTNode, typeMap: ResolvedTypeMap) {
  const moduleAllocator = new ModuleAllocator();

  recurse(root, moduleAllocator, typeMap);

  return moduleAllocator;
}

function recurse(
  root: ASTNode,
  moduleAllocator: ModuleAllocator,
  typeMap: ResolvedTypeMap,
  localAllocator?: ILocalAllocator
) {
  function assertLocal(a: ILocalAllocator | undefined): a is ILocalAllocator {
    if (!a) {
      throw new Error(`Need to have a local allocator for ${root.name} node`);
    }
    return true;
  }

  switch (root.name) {
    case 'File': {
      for (const decl of root.fields.decls) {
        if (isExternDecl(decl)) {
          recurse(decl, moduleAllocator, typeMap, localAllocator);
        }
      }
      [...root.fields.globals, ...root.fields.funcs].forEach((child) =>
        recurse(child, moduleAllocator, typeMap, localAllocator)
      );
      return;
    }
    case 'FuncDecl': {
      const { localAllocator } = moduleAllocator.allocateFunc(root);
      children(root).forEach((child) =>
        recurse(child, moduleAllocator, typeMap, localAllocator)
      );
      return;
    }
    case 'GlobalDecl':
      moduleAllocator.allocateGlobal(typeMap.get(root).toValueType(), root);
      break;
    case 'Block': {
      if (localAllocator) {
        const blockAllocator = new BlockAllocator(localAllocator);
        children(root).forEach((child) =>
          recurse(child, moduleAllocator, typeMap, blockAllocator)
        );
        blockAllocator.deallocateBlock();
        return;
      }
      break;
    }
    case 'RegStatement': {
      if (assertLocal(localAllocator)) {
        localAllocator.allocateLocal(
          typeMap.get(root).toValueType(),
          root,
          root.fields.symbol
        );
      }
      break;
    }
    case 'LetStatement': {
      if (assertLocal(localAllocator)) {
        localAllocator.allocateStack(
          typeMap.get(root),
          root,
          root.fields.symbol
        );
      }
      break;
    }
    case 'BinaryExpr': {
      if (root.fields.op === BinOp.ASSIGN) {
        const { left } = root.fields;
        if (
          (isUnaryExpr(left) && left.fields.op === UnaryOp.ADDR_OF) ||
          (isBinaryExpr(left) && left.fields.op === BinOp.ARRAY_INDEX)
        ) {
          if (assertLocal(localAllocator)) {
            let tempLocation = localAllocator.allocateLocal(
              typeMap.get(root).toValueType(),
              root
            );
            localAllocator.deallocateLocal(tempLocation);
          }
        }
      }
      break;
    }
    case 'UnaryExpr': {
      if (root.fields.op === UnaryOp.ADDR_OF) {
        if (assertLocal(localAllocator)) {
          root.fields.expr;
          let tempLocation = localAllocator.allocateLocal(
            typeMap.get(root).toValueType(),
            root
          );
          localAllocator.deallocateLocal(tempLocation);
        }
      }
      break;
    }
    case 'DataLiteral':
      moduleAllocator.allocateConstData(root, root.fields.value);
      break;
    case 'CallExpr': // TODO: CallExpr doesn't need a temp local when its not constructing a tuple
    case 'StructLiteral':
    case 'ArrayLiteral':
      if (assertLocal(localAllocator)) {
        let arrayStartPointer = localAllocator.allocateLocal(
          IR.NumberType.i32,
          root
        );
        localAllocator.deallocateLocal(arrayStartPointer);
      }
      break;
  }

  children(root).forEach((child) =>
    recurse(child, moduleAllocator, typeMap, localAllocator)
  );
}
