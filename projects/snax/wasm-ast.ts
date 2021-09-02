import * as IR from './stack-ir';
import { HasWAT } from './wat-compiler';

abstract class Node<Fields> {
  fields: Fields;
  constructor(fields: Fields) {
    this.fields = fields;
  }
}
type ModuleFields = { funcs: Func[]; globals: Global[]; imports: Import[] };
export class Module extends Node<ModuleFields> implements HasWAT {
  constructor(fields: Partial<ModuleFields>) {
    super({
      funcs: fields.funcs ?? [],
      globals: fields.globals ?? [],
      imports: fields.imports ?? [],
    });
  }
  toWAT() {
    const globals = (this.fields.globals ?? []).map((g) => g.toWAT()).join(' ');
    const body = (this.fields.funcs ?? []).map((f) => f.toWAT()).join('\n');
    const imports = this.fields.imports.map((im) => im.toWAT()).join('\n');
    return `(module ${imports} (memory 1) (export "memory" (memory 0)) ${globals}\n${body}\n)`;
  }
}

function sexpr(...parts: (string | undefined)[]) {
  return '(' + parts.filter((s) => !!s).join(' ') + ')';
}

type ImportDesc = { kind: 'func'; id?: string; typeuse: TypeUseFields };
export class Import extends Node<{
  mod: string;
  nm: string;
  importdesc: ImportDesc;
}> {
  toWAT() {
    const { kind, id, typeuse } = this.fields.importdesc;
    const importdescStr = sexpr(
      kind,
      id ? `$${id}` : '',
      new FuncTypeUse(typeuse).toWAT()
    );
    return `(import "${this.fields.mod}" "${this.fields.nm}" ${importdescStr} )`;
  }
}

export class Global extends Node<{
  id?: string;
  globalType: GlobalType;
  expr: IR.Instruction[];
}> {
  toWAT() {
    let parts = [
      'global',
      this.fields.id ? `$${this.fields.id}` : '',
      this.fields.globalType.toWAT(),
      ...this.fields.expr.map((i) => i.toWAT()),
    ];
    return `(${parts.join(' ')})`;
  }
}

export class GlobalType extends Node<{ valtype: IR.NumberType; mut: boolean }> {
  toWAT() {
    return this.fields.mut
      ? `(mut ${this.fields.valtype})`
      : this.fields.valtype;
  }
}
type TypeUseFields = {
  params: IR.NumberType[];
  results: IR.NumberType[];
};
export class FuncTypeUse extends Node<TypeUseFields> {
  toWAT() {
    const { params, results } = this.fields;
    const paramsStr = params.length > 0 ? `(param ${params.join(' ')})` : '';
    const resultsStr =
      results.length > 0 ? `(result ${results.join(' ')})` : '';
    return `${paramsStr} ${resultsStr}`;
  }
}

export class Func
  extends Node<{
    funcType: FuncTypeUse;
    locals: Local[];
    id?: string;
    body: IR.Instruction[];
    exportName?: string;
  }>
  implements HasWAT
{
  constructor(parts: {
    funcType?: FuncTypeUse;
    locals?: Local[];
    id?: string;
    exportName?: string;
    body?: IR.Instruction[];
  }) {
    super({
      funcType: new FuncTypeUse({ params: [], results: [] }),
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
