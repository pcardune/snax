import type { FileCompiler } from './ast-compiler.js';
import type { ASTNode, Location } from './spec-gen.js';
import type { TypeResolver } from './type-resolution.js';

export const atString = (location: Location | undefined) => {
  let atString = '<unknown>';
  if (location) {
    atString = `${location.source} ${location.start.line}:${location.start.column}`;
  }
  return atString;
};

const atSource = (source: string, location: Location): string[] => {
  const lines = source.split('\n');
  const prefix = `${location.start.line}: `;
  const output = [
    `${prefix}${lines[location.start.line - 1]}`,
    '^'.padStart(prefix.length + location.start.column, '-'),
  ];
  return output;
};

export class TypeResolutionError extends Error {
  node: ASTNode;
  resolver: TypeResolver;

  constructor(resolver: TypeResolver, node: ASTNode, message: string) {
    super(`TypeResolutionError at ${atString(node.location)}: ${message}`);
    this.node = node;
    this.resolver = resolver;
  }
}

export class CompilerError extends Error {
  node: ASTNode;
  private _message: string;
  private source?: string;
  moduleCompiler?: FileCompiler;

  constructor(node: ASTNode, message: string) {
    super();
    this._message = message;
    this.node = node;
    this.message = this.getMessage();
  }

  getMessage() {
    const lines = [
      `CompilerError at ${atString(this.node.location)}: ${this._message}`,
    ];
    if (this.source && this.node.location) {
      lines.push(
        ...atSource(this.source, this.node.location).map((line) => `  ` + line)
      );
    }
    return lines.join('\n');
  }

  attachSource(source: string) {
    this.source = source;
    this.message = this.getMessage();
  }
  attachModuleCompiler(moduleCompiler: FileCompiler) {
    this.moduleCompiler = moduleCompiler;
  }
}

export class SymbolResolutionError extends Error {
  node: ASTNode;
  constructor(node: ASTNode, message: string) {
    super(`SymbolResolutionError at ${atString(node.location)}: ${message}`);
    this.node = node;
  }
}
