import type { ASTNode, Location } from './spec-gen.js';

export const atString = (location: Location | undefined) => {
  let atString = '<unknown>';
  if (location) {
    atString = `${location.source} ${location.start.line}:${location.start.column}`;
  }
  return atString;
};

export class CompilerError extends Error {
  node: ASTNode;

  constructor(node: ASTNode, message: string) {
    const location = node.location;
    super(`CompilerError at ${atString(location)}: ${message}`);

    this.node = node;
  }
}

export class SymbolResolutionError extends Error {
  node: ASTNode;
  constructor(node: ASTNode, message: string) {
    super(`SymbolResolutionError at ${atString(node.location)}: ${message}`);
    this.node = node;
  }
}
