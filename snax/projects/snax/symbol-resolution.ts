import { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import { BaseType, isIntrinsicSymbol } from './snax-types.js';
import {
  ASTNode,
  Block,
  FuncDecl,
  isFile,
  SymbolRef,
  File,
  TypeRef,
} from './spec-gen.js';
import { children as childrenOf } from './spec-util.js';

export type SymbolRecord = {
  valueType?: BaseType;
  declNode: ASTNode;
};

export class SymbolTable {
  table: OrderedMap<string, SymbolRecord> = new OrderedMap();
  parent: SymbolTable | null;
  readonly id: number;
  private static nextId = 0;
  constructor(parent: SymbolTable | null = null) {
    this.parent = parent;
    this.id = SymbolTable.nextId++;
  }

  get(symbol: string): SymbolRecord | undefined {
    return this.table.get(symbol) ?? this.parent?.get(symbol);
  }

  has(symbol: string): boolean {
    return this.table.has(symbol);
  }

  records() {
    return this.table.values();
  }

  declare(symbol: string, declNode: ASTNode) {
    this.table.set(symbol, { declNode });
  }
}

export type SymbolTableMap = OrderedMap<Block | FuncDecl | File, SymbolTable>;
export type SymbolRefMap = OrderedMap<SymbolRef | TypeRef, SymbolRecord>;

export function resolveSymbols(astNode: ASTNode) {
  const tables: SymbolTableMap = new OrderedMap();
  const refMap: SymbolRefMap = new OrderedMap();
  innerResolveSymbols(astNode, new SymbolTable(null), tables, refMap);
  return { tables, refMap };
}

function innerResolveSymbols(
  astNode: ASTNode,
  currentTable: SymbolTable,
  tables: SymbolTableMap,
  refMap: SymbolRefMap
) {
  // add declarations in the current scope
  switch (astNode.name) {
    case 'Parameter':
    case 'LetStatement': {
      if (currentTable.has(astNode.fields.symbol)) {
        throw new Error(
          `Redeclaration of symbol ${astNode.fields.symbol} in the same scope`
        );
      }
      currentTable.declare(astNode.fields.symbol, astNode);
      break;
    }
    case 'TypeRef': {
      if (!isIntrinsicSymbol(astNode.fields.symbol)) {
        const symbolRecord = currentTable.get(astNode.fields.symbol);
        if (!symbolRecord) {
          throw new Error(
            `Reference to undeclared type ${astNode.fields.symbol}`
          );
        }
        refMap.set(astNode, symbolRecord);
      }
      break;
    }
    case 'SymbolRef': {
      const symbolRecord = currentTable.get(astNode.fields.symbol);
      if (!symbolRecord) {
        throw new Error(
          `Reference to undeclared symbol ${astNode.fields.symbol}`
        );
      }
      refMap.set(astNode, symbolRecord);
      break;
    }
  }

  // some nodes cause a new scope to be created
  switch (astNode.name) {
    case 'File':
    case 'FuncDecl':
    case 'Block': {
      currentTable = new SymbolTable(currentTable);
      tables.set(astNode, currentTable);
    }
  }

  // descend into the child nodes to continue resolving symbols.
  if (isFile(astNode)) {
    for (const decl of astNode.fields.decls) {
      switch (decl.name) {
        case 'ExternDecl': {
          for (const funcDecl of decl.fields.funcs) {
            currentTable.declare(funcDecl.fields.symbol, funcDecl);
          }
          break;
        }
        case 'TupleStructDecl': {
          currentTable.declare(decl.fields.symbol, decl);
          break;
        }
      }
    }
    for (const globalDecl of astNode.fields.globals) {
      currentTable.declare(globalDecl.fields.symbol, globalDecl);
    }
    for (const funcDecl of astNode.fields.funcs) {
      currentTable.declare(funcDecl.fields.symbol, funcDecl);
    }
    for (const funcDecl of astNode.fields.funcs) {
      innerResolveSymbols(
        funcDecl.fields.parameters,
        currentTable,
        tables,
        refMap
      );
      innerResolveSymbols(funcDecl.fields.body, currentTable, tables, refMap);
    }
  } else {
    childrenOf(astNode).forEach((node: ASTNode) =>
      innerResolveSymbols(node, currentTable, tables, refMap)
    );
  }
}
