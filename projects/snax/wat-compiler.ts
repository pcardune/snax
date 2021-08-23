import { Instruction } from './stack-ir';

export interface HasWAT {
  toWAT(): string;
}
export function hasWAT(item: any): item is HasWAT {
  return !!item.toStackIR;
}

export function compileInstructions(instructions: Instruction[]) {
  const mainBody = instructions.map((ins) => ins.toWAT()).join('\n');
  const moduleBody = `(func (export "main") (result i32) ${mainBody})`;
  return `(module ${moduleBody})`;
}
