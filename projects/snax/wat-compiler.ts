import { err, ok, Result } from 'neverthrow';
import * as AST from './snax-ast';
import { SNAXParser } from './snax-parser';
import * as StackIR from './stack-ir';

export interface HasWAT {
  toWAT(): string;
}
export function hasWAT(item: any): item is HasWAT {
  return !!item.toStackIR;
}

export function compileStr(input: string): Result<string, any> {
  const maybeAST = SNAXParser.parseStr(input);
  if (maybeAST.isOk()) {
    const ast = maybeAST.value;
    if (!(ast instanceof AST.Block)) {
      return err(new Error('parsed input did not yield a block...'));
    }
    try {
      return ok(compileAST(ast));
    } catch (e) {
      return err(e);
    }
  } else {
    return err(maybeAST.error);
  }
}

function getWASMType(valueType: AST.ASTValueType) {
  switch (valueType) {
    case AST.ASTValueType.Float:
      return 'f32';
    case AST.ASTValueType.Integer:
      return 'i32';
    case AST.ASTValueType.Void:
      return '';
  }
}

export function compileAST(block: AST.Block): string {
  const instructions = block.toStackIR();
  let returnType = getWASMType(block.resolveType());
  let locals: string[] = [...block.resolveSymbols().values()].map((e) =>
    getWASMType(e.valueType)
  );
  const mainBody = instructions.map((ins) => ins.toWAT()).join('\n');
  const moduleBody = `
(func (export "main") (result ${returnType})
  (local ${locals.join(' ')})
  ${mainBody}
)`;
  return `(module ${moduleBody})`;
}
