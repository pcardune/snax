import type { ASTCompiler } from './ast-compiler.js';
import type { ASTNode, Location } from './spec-gen.js';

export const atString = (location: Location | undefined) => {
  let atString = '<unknown>';
  if (location) {
    atString = `${location.source} ${location.start.line}:${location.start.column}`;
  }
  return atString;
};

export class CompilerError extends Error {
  compiler: ASTCompiler;

  constructor(compiler: ASTCompiler, message: string) {
    const location = compiler.root.location;
    super(`CompilerError at ${atString(location)}: ${message}`);

    this.compiler = compiler;
  }
}

export class SymbolResolutionError extends Error {
  node: ASTNode;
  constructor(node: ASTNode, message: string) {
    super(`SymbolResolutionError at ${atString(node.location)}: ${message}`);
    this.node = node;
  }
}
