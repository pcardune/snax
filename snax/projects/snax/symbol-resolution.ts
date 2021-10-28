import { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import { atString, SymbolResolutionError } from './errors.js';
import { BaseType, isIntrinsicSymbol } from './snax-types.js';
import {
  ASTNode,
  Block,
  FuncDecl,
  isFile,
  SymbolRef,
  File,
  TypeRef,
  isMemberAccessExpr,
  ExternFuncDecl,
  isFuncDecl,
  ModuleDecl,
  isModuleDecl,
  NamespacedRef,
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
    if (this.table.has(symbol)) {
      throw new SymbolResolutionError(
        declNode,
        `Redeclaration of symbol ${symbol} in the same scope, first declared at ${atString(
          this.table.get(symbol)!.declNode.location
        )}`
      );
    }
    this.table.set(symbol, { declNode });
  }
}

export type SymbolTableMap = OrderedMap<
  Block | FuncDecl | ExternFuncDecl | ModuleDecl | File,
  SymbolTable
>;
export type SymbolRefMap = OrderedMap<
  SymbolRef | TypeRef | NamespacedRef,
  SymbolRecord
>;

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
    case 'RegStatement':
    case 'LetStatement': {
      currentTable.declare(astNode.fields.symbol, astNode);
      break;
    }
    case 'TypeRef': {
      if (!isIntrinsicSymbol(astNode.fields.symbol)) {
        const symbolRecord = currentTable.get(astNode.fields.symbol);
        if (!symbolRecord) {
          throw new SymbolResolutionError(
            astNode,
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
        throw new SymbolResolutionError(
          astNode,
          `Reference to undeclared symbol ${astNode.fields.symbol}`
        );
      }
      refMap.set(astNode, symbolRecord);
      break;
    }
    case 'NamespacedRef': {
      const { path } = astNode.fields;
      const namesToLookup = [...path];
      let table = currentTable;
      while (namesToLookup.length > 1) {
        const symbol = namesToLookup.shift()!;
        const namespaceRecord = table.get(symbol);
        if (!namespaceRecord) {
          throw new SymbolResolutionError(
            astNode,
            `No declaration found for ${symbol}`
          );
        }
        const moduleDecl = namespaceRecord.declNode;
        if (moduleDecl.name !== 'ModuleDecl') {
          throw new SymbolResolutionError(
            astNode,
            `Can't resolve namespace access to a ${moduleDecl.name}`
          );
        }
        const moduleSymbolTable = tables.get(moduleDecl);
        if (!moduleSymbolTable) {
          throw new SymbolResolutionError(
            astNode,
            `No symbol table found for namespace ${moduleDecl.fields.symbol}`
          );
        }
        table = moduleSymbolTable;
      }
      const symbol = namesToLookup.shift()!;
      const symbolRecord = table.get(symbol);
      if (!symbolRecord) {
        throw new SymbolResolutionError(
          astNode,
          `Reference to undeclared symbol ${symbol}`
        );
      }
      refMap.set(astNode, symbolRecord);
    }
  }

  // some nodes cause a new scope to be created
  switch (astNode.name) {
    case 'File':
    case 'FuncDecl':
    case 'ExternFuncDecl':
    case 'Block': {
      currentTable = new SymbolTable(currentTable);
      tables.set(astNode, currentTable);
    }
  }

  // descend into the child nodes to continue resolving symbols.
  if (isFile(astNode) || isModuleDecl(astNode)) {
    for (const decl of astNode.fields.decls) {
      switch (decl.name) {
        case 'ExternDecl': {
          for (const funcDecl of decl.fields.funcs) {
            currentTable.declare(funcDecl.fields.symbol, funcDecl);
          }
          break;
        }
        case 'GlobalDecl':
        case 'FuncDecl':
        case 'ModuleDecl':
        case 'StructDecl':
        case 'TupleStructDecl': {
          currentTable.declare(decl.fields.symbol, decl);
          break;
        }
      }
    }
    for (const moduleDecl of astNode.fields.decls) {
      if (isModuleDecl(moduleDecl)) {
        const moduleSymbols = new SymbolTable(null);
        tables.set(moduleDecl, moduleSymbols);
        innerResolveSymbols(moduleDecl, moduleSymbols, tables, refMap);
      }
    }

    for (const funcDecl of astNode.fields.decls) {
      if (isFuncDecl(funcDecl)) {
        const funcSymbols = new SymbolTable(currentTable);
        tables.set(funcDecl, funcSymbols);
        innerResolveSymbols(
          funcDecl.fields.parameters,
          funcSymbols,
          tables,
          refMap
        );
        innerResolveSymbols(funcDecl.fields.body, funcSymbols, tables, refMap);
      }
    }

    for (const decl of astNode.fields.decls) {
      switch (decl.name) {
        case 'FuncDecl':
        case 'ModuleDecl':
        case 'GlobalDecl':
          break;
        default:
          childrenOf(decl).forEach((node) =>
            innerResolveSymbols(node, currentTable, tables, refMap)
          );
      }
    }
  } else if (isMemberAccessExpr(astNode)) {
    innerResolveSymbols(astNode.fields.left, currentTable, tables, refMap);
  } else {
    childrenOf(astNode).forEach((node: ASTNode) =>
      innerResolveSymbols(node, currentTable, tables, refMap)
    );
  }
}
