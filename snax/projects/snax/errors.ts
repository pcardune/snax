import type { FileCompiler } from './ast-compiler.js';
import type { ASTNode, Location } from './spec-gen.js';
import type { TypeResolver } from './type-resolution.js';

export const atString = (location: Location | undefined) => {
  let atString = '<unknown>';
  if (location) {
    atString = `${location.source}:${location.start.line}:${location.start.column}`;
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

export class NodeError extends Error {
  readonly node: ASTNode;
  constructor(node: ASTNode, message: string) {
    super(message);
    this.node = node;
  }
}

export class TypeResolutionError extends NodeError {
  resolver: TypeResolver;

  constructor(resolver: TypeResolver, node: ASTNode, message: string) {
    super(
      node,
      `TypeResolutionError at ${atString(node.location)}: ${message}`
    );
    this.resolver = resolver;
  }
}

export class CompilerError extends NodeError {
  private _message: string;
  private source?: string;
  moduleCompiler?: FileCompiler;

  constructor(node: ASTNode, message: string) {
    super(node, message);
    this._message = message;
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

export class SymbolResolutionError extends NodeError {
  constructor(node: ASTNode, message: string) {
    super(
      node,
      `SymbolResolutionError at ${atString(node.location)}: ${message}`
    );
  }
}
