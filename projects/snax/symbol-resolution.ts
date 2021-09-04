import { NodeDataMap, SymbolTable } from './ast-compiler';
import { ASTNode, isFile } from './spec-gen';
import { children as childrenOf, debugStr } from './spec-util';

export function resolveSymbols(
  astNode: ASTNode,
  nodeDataMap: NodeDataMap,
  currentScope: SymbolTable | null
) {
  if (nodeDataMap.get(astNode).symbolTable) {
    return;
  }
  if (!currentScope) {
    currentScope = new SymbolTable(null);
  }

  // add declarations in the current scope
  switch (astNode.name) {
    case 'Parameter':
    case 'LetStatement': {
      if (currentScope.has(astNode.fields.symbol)) {
        throw new Error(
          `Redeclaration of symbol ${astNode.fields.symbol} in the same scope`
        );
      }
      currentScope.declare(astNode.fields.symbol, astNode);
      break;
    }
    case 'SymbolRef': {
      const symbolRecord = currentScope.get(astNode.fields.symbol);
      if (!symbolRecord) {
        throw new Error(
          `Reference to undeclared symbol ${astNode.fields.symbol}`
        );
      }
      nodeDataMap.get(astNode).symbolRecord = symbolRecord;
      break;
    }
  }

  // some nodes cause a new scope to be created
  switch (astNode.name) {
    case 'File':
    case 'FuncDecl':
    case 'Block': {
      currentScope = new SymbolTable(currentScope);
    }
  }

  nodeDataMap.get(astNode).symbolTable = currentScope;
  // descend into the child nodes to continue resolving symbols.
  if (isFile(astNode)) {
    for (const globalDecl of astNode.fields.globals) {
      currentScope.declare(globalDecl.fields.symbol, globalDecl);
    }
    for (const funcDecl of astNode.fields.funcs) {
      currentScope.declare(funcDecl.fields.symbol, funcDecl);
    }
    for (const funcDecl of astNode.fields.funcs) {
      resolveSymbols(funcDecl.fields.parameters, nodeDataMap, currentScope);
      resolveSymbols(funcDecl.fields.body, nodeDataMap, currentScope);
    }
  } else {
    childrenOf(astNode).forEach((node: ASTNode) =>
      resolveSymbols(node, nodeDataMap, currentScope)
    );
  }
}
