import { OrderedMap } from '../utils/data-structures/OrderedMap';
import {
  ASTNode,
  FuncDecl,
  GlobalDecl,
  isBinaryExpr,
  isUnaryExpr,
  ParameterList,
  StringLiteral,
} from './spec-gen';
import { children } from './spec-util';
import * as Wasm from './wasm-ast';
import * as IR from './stack-ir';
import { ResolvedTypeMap } from './type-resolution';
import { BinaryOp, UnaryOp } from './snax-ast';

type DataLocation = {
  area: 'data';
  offset: number;
  data: string;
  memIndex: number;
};

type StorageLocation =
  | {
      area: 'funcs' | 'locals' | 'globals';
      offset: number;
    }
  | DataLocation;

export type AllocationMap = OrderedMap<ASTNode, StorageLocation>;

interface ConstAllocator {
  allocateConstData(node: StringLiteral, data: string): DataLocation;
}

export class ModuleAllocator implements ConstAllocator {
  funcOffset = 0;
  globalOffset = 0;
  dataOffset = 0;
  memIndex = 0;
  allocationMap: AllocationMap = new OrderedMap();
  funcAllocatorMap: OrderedMap<FuncDecl, FuncLocalAllocator> = new OrderedMap();

  private alloc<Loc extends StorageLocation>(
    node: FuncDecl | GlobalDecl | StringLiteral,
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
    return {
      location: this.alloc(node, { area: 'funcs', offset: this.funcOffset++ }),
      localAllocator: funcLocalAllocator,
    };
  }

  allocateGlobal(node: GlobalDecl) {
    return this.alloc(node, {
      area: 'globals',
      offset: this.globalOffset++,
    });
  }

  allocateConstData(node: StringLiteral, data: string) {
    let memIndex = this.memIndex;
    this.memIndex += data.length;
    return this.alloc(node, {
      area: 'data',
      offset: this.dataOffset++,
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

  locals: LocalAllocation[] = [];

  constructor(allocationMap: AllocationMap, params: ParameterList) {
    this.allocationMap = allocationMap;

    for (const param of params.fields.parameters) {
      this.allocationMap.set(param, {
        area: 'locals',
        offset: this.localsOffset++,
      });
    }
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
      if (root.fields.op === BinaryOp.ASSIGN) {
        const { left } = root.fields;
        if (
          (isUnaryExpr(left) && left.fields.op === UnaryOp.DEREF) ||
          (isBinaryExpr(left) && left.fields.op === BinaryOp.ARRAY_INDEX)
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
    case 'StringLiteral':
      moduleAllocator.allocateConstData(root, root.fields.value);
      break;
  }

  children(root).forEach((child) =>
    recurse(child, moduleAllocator, typeMap, localAllocator)
  );
}
