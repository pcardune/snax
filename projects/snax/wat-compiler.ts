import * as StackIR from './stack-ir';

export interface HasWAT {
  toWAT(): string;
}
export function hasWAT(item: any): item is HasWAT {
  return !!item.toStackIR;
}

export function compileInstructions(instructions: StackIR.Instruction[]) {
  let locals: string[] = [];
  const mainBody = instructions
    .map((ins) => {
      if (ins instanceof StackIR.LocalSet) {
        locals.push('(local i32)');
      }
      return ins.toWAT();
    })
    .join('\n');
  const moduleBody = `(func (export "main") (result i32) ${locals.join(
    ' '
  )} ${mainBody})`;
  return `(module ${moduleBody})`;
}
