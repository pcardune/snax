import * as IR from './stack-ir';
import { HasWAT } from './wat-compiler';

abstract class Node<Fields> {
  fields: Fields;
  constructor(fields: Fields) {
    this.fields = fields;
  }
}

export class Module
  extends Node<{ funcs: Func[]; globals: Global[] }>
  implements HasWAT
{
  constructor(fields: { funcs?: Func[]; globals?: Global[] }) {
    super({ funcs: fields.funcs ?? [], globals: fields.globals ?? [] });
  }
  toWAT() {
    const globals = (this.fields.globals ?? []).map((g) => g.toWAT()).join(' ');
    const body = (this.fields.funcs ?? []).map((f) => f.toWAT()).join('\n');
    return `(module (memory 1) (export "mem" (memory 0)) ${globals}\n${body}\n)`;
  }
}

export class Global extends Node<{
  id?: string;
  globalType: IR.NumberType;
  expr: IR.Instruction[];
}> {
  toWAT() {
    let parts = [
      'global',
      this.fields.id ? `$${this.fields.id}` : '',
      this.fields.globalType,
      ...this.fields.expr.map((i) => i.toWAT()),
    ];
    return `(${parts.join(' ')})`;
  }
}

export class FuncType extends Node<{
  params: IR.NumberType[];
  results: IR.NumberType[];
}> {}

export class Func
  extends Node<{
    funcType: FuncType;
    locals: Local[];
    id?: string;
    body: IR.Instruction[];
    exportName?: string;
  }>
  implements HasWAT
{
  constructor(parts: {
    funcType?: FuncType;
    locals?: Local[];
    id?: string;
    exportName?: string;
    body?: IR.Instruction[];
  }) {
    super({
      funcType: new FuncType({ params: [], results: [] }),
      locals: [],
      body: [],
      ...parts,
    });
  }

  toWAT() {
    const id = this.fields.id ? `$${this.fields.id}` : '';
    const locals = this.fields.locals.map((local) => local.toWAT()).join(' ');
    const body = this.fields.body.map((ins) => '  ' + ins.toWAT()).join('\n');
    const inlineExport = this.fields.exportName
      ? `(export "${this.fields.exportName}")`
      : '';
    const { params, results } = this.fields.funcType.fields;
    const paramsStr = params.length > 0 ? `(param ${params.join(' ')})` : '';
    const resultsStr =
      results.length > 0 ? `(result ${results.join(' ')})` : '';
    return `(func ${id} ${inlineExport} ${paramsStr} ${resultsStr} ${locals}\n${body}\n)`;
  }
}

export class Local
  extends Node<{ id?: string; valueType: IR.NumberType }>
  implements HasWAT
{
  constructor(valueType: IR.NumberType, id?: string) {
    super({ valueType, id });
  }
  toWAT() {
    let id = this.fields.id ? `"${this.fields.id}"` : '';
    return `(local ${id} ${this.fields.valueType})`;
  }
}

export class IfBlock extends Node<{
  then: IR.Instruction[];
  else: IR.Instruction[];
}> {
  toWAT() {
    return [
      'if',
      ...this.fields.then.map((i) => i.toWAT()),
      'else',
      ...this.fields.else.map((i) => i.toWAT()),
      'end',
    ].join('\n');
  }
}

export class LoopBlock extends Node<{
  label: string;
  instr: IR.Instruction[];
}> {
  toWAT() {
    return [
      `loop $${this.fields.label ?? ''}`,
      ...this.fields.instr.map((i) => i.toWAT()),
      `end $${this.fields.label ?? ''}`,
    ].join('\n');
  }
}
