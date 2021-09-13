import * as IR from './stack-ir.js';
import type { HasWAT } from './wat-compiler.js';

export const PAGE_SIZE = 65536;

abstract class Node<Fields> {
  fields: Fields;
  constructor(fields: Fields) {
    this.fields = fields;
  }
}
type ModuleFields = {
  funcs: Func[];
  globals: Global[];
  imports: Import[];
  memory: { min: number; max?: number };
  datas: Data[];
};
export class Module extends Node<ModuleFields> implements HasWAT {
  constructor(fields: Partial<ModuleFields>) {
    super({
      funcs: fields.funcs ?? [],
      globals: fields.globals ?? [],
      imports: fields.imports ?? [],
      memory: fields.memory ?? { min: 1 },
      datas: fields.datas ?? [],
    });
  }
  toWAT() {
    const globals = (this.fields.globals ?? []).map((g) => g.toWAT()).join(' ');
    const body = (this.fields.funcs ?? []).map((f) => f.toWAT()).join('\n');
    const imports = this.fields.imports.map((im) => im.toWAT()).join('\n');
    const datas = this.fields.datas.map((d) => d.toWAT()).join('\n');
    return sexpr(
      'module',
      imports,
      sexpr('memory', this.fields.memory.min, this.fields.memory.max),
      sexpr('export', '"memory"', '(memory 0)'),
      datas,
      globals,
      body
    );
  }
}

function sexpr(...parts: (string | number | undefined)[]) {
  return '(' + parts.filter((s) => s !== undefined && s !== '').join(' ') + ')';
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

export class Data extends Node<{
  id?: string;
  offset: number;
  datastring: string;
}> {
  toWAT() {
    return sexpr(
      'data',
      this.fields.id ? `$${this.fields.id}` : '',
      sexpr('memory', '0'),
      sexpr(
        'offset',
        new IR.PushConst(IR.NumberType.i32, this.fields.offset).toWAT()
      ),
      JSON.stringify(this.fields.datastring)
    );
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
  params: { valtype: IR.NumberType; id?: string }[];
  results: IR.NumberType[];
};
export class FuncTypeUse extends Node<TypeUseFields> {
  toWAT() {
    const { params, results } = this.fields;
    const paramsStr = params
      .map((param) =>
        sexpr('param', param.id ? '$' + param.id : undefined, param.valtype)
      )
      .join(' ');
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

    return sexpr(
      'func',
      id,
      inlineExport,
      this.fields.funcType.toWAT(),
      locals,
      body
    );
  }
}

export class Local
  extends Node<{ id: string; valueType: IR.NumberType }>
  implements HasWAT
{
  constructor(valueType: IR.NumberType, id: string) {
    super({ valueType, id });
  }
  toWAT() {
    let id = this.fields.id ? `$${this.fields.id}` : undefined;
    return sexpr('local', id, this.fields.valueType);
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
