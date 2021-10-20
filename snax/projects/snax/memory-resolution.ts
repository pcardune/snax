import { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import {
  ASTNode,
  FuncDecl,
  GlobalDecl,
  isExternDecl,
  ParameterList,
  DataLiteral,
  ExternFuncDecl,
} from './spec-gen.js';
import { children } from './spec-util.js';
import { NumberType } from './numbers.js';
import type { ResolvedTypeMap } from './type-resolution.js';
import { BinOp, UnaryOp } from './snax-ast.js';
import { BaseType, FuncType } from './snax-types.js';

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
  valueType: NumberType;
};

export type LocalStorageLocation = BaseStorageLocation<Area.LOCALS> & {
  valueType: NumberType;
};

export type FuncStorageLocation = BaseStorageLocation<Area.FUNCS> & {
  funcType: FuncType;
};

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
  getFuncOrThrow(func: FuncDecl | ExternFuncDecl): FuncStorageLocation {
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
  locals: { id: string; valueType: NumberType }[];
  arp: LocalStorageLocation;
  stack: StackStorageLocation[];
};

export class FuncAllocatorMap extends OrderedMap<
  FuncDecl | ExternFuncDecl,
  FuncLocalAllocator
> {
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
    node: FuncDecl | ExternFuncDecl | GlobalDecl | DataLiteral,
    location: Loc
  ) {
    this.allocationMap.set(node, location);
    return location;
  }

  allocateFunc(node: FuncDecl | ExternFuncDecl, typeMap: ResolvedTypeMap) {
    const funcType = typeMap.get(node);
    if (!(funcType instanceof FuncType)) {
      throw new Error(`expected funcdecl to have func type`);
    }
    const funcLocalAllocator = new FuncLocalAllocator(
      this.allocationMap,
      node.fields.parameters,
      typeMap
    );
    this.funcAllocatorMap.set(node, funcLocalAllocator);
    const id = `<${node.fields.symbol}>f${this.funcOffset}`;
    return {
      location: this.alloc(node, {
        area: FUNCS,
        offset: this.funcOffset++,
        id,
        funcType,
      }),
      localAllocator: funcLocalAllocator,
    };
  }

  allocateGlobal(valueType: NumberType, node: GlobalDecl) {
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
        id: funcAllocator.arp.local.id,
        valueType: funcAllocator.arp.local.valueType,
      },
      stack: funcAllocator.stack,
    };
  }
}

export type LocalAllocation = {
  offset: number;
  live: boolean;
  local: { id: string; valueType: NumberType };
};

interface ILocalAllocator {
  allocateLocal(
    valueType: NumberType,
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

  constructor(
    allocationMap: AllocationMap,
    params: ParameterList,
    typeMap: ResolvedTypeMap
  ) {
    this.allocationMap = allocationMap;

    for (const param of params.fields.parameters) {
      const id = `p${this.localsOffset}:${param.fields.symbol}`;
      this.allocationMap.set(param, {
        area: LOCALS,
        offset: this.localsOffset++,
        id,
        valueType: typeMap.get(param).toValueTypeOrThrow(),
      });
    }
    this.arp = this.makeLocalAllocation(NumberType.i32, 'arp');
  }

  private makeLocalAllocation(valueType: NumberType, name?: string) {
    const localAllocation = {
      offset: this.localsOffset++,
      live: true,
      local: {
        valueType,
        id: `<${name ?? 'temp'}>r${this.localIdCounter++}:${valueType}`,
      },
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
    valueType: NumberType,
    decl?: ASTNode,
    name?: string
  ): LocalAllocation {
    let localAllocation: LocalAllocation;
    let freeLocal = this.locals.find(
      (l) => !l.live && l.local.valueType === valueType
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
        id: localAllocation.local.id,
        valueType,
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
    valueType: NumberType,
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
  const resolver = new MemoryResolver(typeMap);
  resolver.resolve(root);
  return resolver.moduleAllocator;
}

class MemoryResolver {
  typeMap: ResolvedTypeMap;
  moduleAllocator = new ModuleAllocator();

  constructor(typeMap: ResolvedTypeMap) {
    this.typeMap = typeMap;
  }

  resolve(root: ASTNode, localAllocator?: ILocalAllocator) {
    function assertLocal(a: ILocalAllocator | undefined): a is ILocalAllocator {
      if (!a) {
        throw new Error(`Need to have a local allocator for ${root.name} node`);
      }
      return true;
    }

    const resolveChildren = (localAllocator?: ILocalAllocator) => {
      children(root).forEach((child) => this.resolve(child, localAllocator));
    };

    const allocateTemp = (valueType: NumberType) => {
      if (assertLocal(localAllocator)) {
        const temp = localAllocator.allocateLocal(valueType, root);
        resolveChildren(localAllocator);
        localAllocator.deallocateLocal(temp);
      }
    };

    switch (root.name) {
      case 'File': {
        for (const decl of root.fields.decls) {
          if (isExternDecl(decl)) {
            this.resolve(decl);
          }
        }
        [...root.fields.globals, ...root.fields.funcs].forEach((child) =>
          this.resolve(child)
        );
        return;
      }
      case 'ExternFuncDecl':
      case 'FuncDecl': {
        resolveChildren(
          this.moduleAllocator.allocateFunc(root, this.typeMap).localAllocator
        );
        return;
      }
      case 'GlobalDecl':
        this.moduleAllocator.allocateGlobal(
          this.typeMap.get(root).toValueTypeOrThrow(),
          root
        );
        break;
      case 'Block': {
        if (localAllocator) {
          const blockAllocator = new BlockAllocator(localAllocator);
          resolveChildren(blockAllocator);
          blockAllocator.deallocateBlock();
          return;
        }
        break;
      }
      case 'RegStatement': {
        if (assertLocal(localAllocator)) {
          localAllocator.allocateLocal(
            this.typeMap.get(root).toValueTypeOrThrow(),
            root,
            root.fields.symbol
          );
        }
        break;
      }
      case 'LetStatement': {
        if (assertLocal(localAllocator)) {
          localAllocator.allocateStack(
            this.typeMap.get(root),
            root,
            root.fields.symbol
          );
        }
        break;
      }
      case 'BinaryExpr': {
        if (root.fields.op === BinOp.ASSIGN) {
          allocateTemp(NumberType.i32);
          return;
        }
        break;
      }
      case 'UnaryExpr': {
        if (root.fields.op === UnaryOp.ADDR_OF) {
          allocateTemp(this.typeMap.get(root).toValueTypeOrThrow());
          return;
        }
        break;
      }
      case 'DataLiteral':
        this.moduleAllocator.allocateConstData(root, root.fields.value);
        break;
      case 'CallExpr': {
        // TODO: CallExpr doesn't need a temp local when its not constructing a tuple
        const type = this.typeMap.get(root).toValueType();
        allocateTemp(type ?? NumberType.i32);
        return;
      }
      case 'ArrayLiteral':
        allocateTemp(NumberType.i32);
        return;
      case 'StructLiteral':
        allocateTemp(NumberType.i32);
        return;
    }

    resolveChildren(localAllocator);
  }
}
