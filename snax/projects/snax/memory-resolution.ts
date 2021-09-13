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

export enum Area {
  FUNCS = 'funcs',
  LOCALS = 'locals',
  GLOBALS = 'globals',
  DATA = 'data',
}
const { FUNCS, LOCALS, GLOBALS, DATA } = Area;

type BaseStorageLocation<T extends Area> = {
  area: T;
  offset: number;
  id: string;
};

export type GlobalStorageLocation = BaseStorageLocation<Area.GLOBALS>;

export type LocalStorageLocation = BaseStorageLocation<Area.LOCALS>;

export type FuncStorageLocation = BaseStorageLocation<Area.FUNCS>;

export type DataLocation = BaseStorageLocation<Area.DATA> & {
  data: string;
  memIndex: number;
};

export type StorageLocation =
  | FuncStorageLocation
  | GlobalStorageLocation
  | LocalStorageLocation
  | DataLocation;

export class AllocationMap extends OrderedMap<ASTNode, StorageLocation> {
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

export class ModuleAllocator implements ConstAllocator {
  funcOffset = 0;
  globalOffset = 0;
  dataOffset = 0;
  memIndex = 0;
  allocationMap = new AllocationMap();
  funcAllocatorMap: OrderedMap<FuncDecl, FuncLocalAllocator> = new OrderedMap();

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
    const id = `f${this.funcOffset}:${node.fields.symbol}`;
    return {
      location: this.alloc(node, {
        area: FUNCS,
        offset: this.funcOffset++,
        id,
      }),
      localAllocator: funcLocalAllocator,
    };
  }

  allocateGlobal(node: GlobalDecl) {
    const id = `g${this.globalOffset}:${node.fields.symbol}`;
    return this.alloc(node, {
      area: GLOBALS,
      offset: this.globalOffset++,
      id,
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

  getLocalsForFunc(node: FuncDecl): Wasm.Local[] {
    let funcAllocator = this.funcAllocatorMap.get(node);
    if (!funcAllocator) {
      throw 'bad';
    }
    return funcAllocator.locals.map((l) => l.local);
  }
}

export type LocalAllocation = {
  offset: number;
  live: boolean;
  local: Wasm.Local;
};

interface ILocalAllocator {
  allocateLocal(valueType: IR.NumberType, decl?: ASTNode): LocalAllocation;
  deallocateLocal(offset: LocalAllocation): void;
}

export class NeverAllocator implements ILocalAllocator {
  allocateLocal(): LocalAllocation {
    throw new Error('this should never be used. please refactor');
  }
  deallocateLocal() {
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

  locals: LocalAllocation[] = [];
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

  private makeLocalAllocation(valueType: IR.NumberType, id?: string) {
    if (!id) {
      id = `l${this.localIdCounter++}:${valueType}`;
    }
    const localAllocation = {
      offset: this.localsOffset++,
      live: true,
      local: new Wasm.Local(valueType, id),
    };
    this.locals.push(localAllocation);
    return localAllocation;
  }

  allocateLocal(valueType: IR.NumberType, decl?: ASTNode): LocalAllocation {
    let localAllocation: LocalAllocation;
    let freeLocal = this.locals.find(
      (l) => !l.live && l.local.fields.valueType === valueType
    );
    if (freeLocal) {
      freeLocal.live = true;
      localAllocation = freeLocal;
    } else {
      localAllocation = this.makeLocalAllocation(valueType);
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

  allocateLocal(valueType: IR.NumberType, decl?: ASTNode): LocalAllocation {
    let localOffset = this.parentAllocator.allocateLocal(valueType, decl);
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
      moduleAllocator.allocateGlobal(root);
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
    case 'LetStatement': {
      if (assertLocal(localAllocator)) {
        localAllocator.allocateLocal(typeMap.get(root).toValueType(), root);
      }
      break;
    }
    case 'BinaryExpr': {
      if (root.fields.op === BinOp.ASSIGN) {
        const { left } = root.fields;
        if (
          (isUnaryExpr(left) && left.fields.op === UnaryOp.DEREF) ||
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
