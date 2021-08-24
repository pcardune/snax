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

export function compileAST(block: AST.Block): string {
  let locals: string[] = [];
  const instructions = block.toStackIR();
  let returnType;
  switch (block.resolveType()) {
    case AST.ASTValueType.Float:
      returnType = 'f32';
      break;
    case AST.ASTValueType.Integer:
      returnType = 'i32';
      break;
    case AST.ASTValueType.Void:
      returnType = '';
      break;
    default:
      throw new Error(
        `can't compile instructions for block with type ${block.resolveType()}`
      );
  }
  const mainBody = instructions
    .map((ins) => {
      if (ins instanceof StackIR.LocalSet) {
        locals.push('(local i32)');
      }
      return ins.toWAT();
    })
    .join('\n');
  const moduleBody = `(func (export "main") (result ${returnType})\n${locals.join(
    ' '
  )}\n${mainBody})`;
  return `(module ${moduleBody})`;
}
