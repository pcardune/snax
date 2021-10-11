export type FieldSpec = {
  type: string;
  optional?: boolean;
  list?: boolean;
};
export type NodeSpec = {
  fields?: Record<string, FieldSpec>;
  union?: string[];
};

const specInput: Record<
  string,
  {
    fields?: Record<string, string | FieldSpec>;
    union?: string[];
  }
> = {
  BooleanLiteral: {
    fields: {
      value: 'boolean',
    },
  },
  NumberLiteral: {
    fields: {
      value: 'number',
      numberType: '"int"|"float"',
      explicitType: { type: 'string', optional: true },
    },
  },
  StringLiteral: {
    fields: {
      value: 'string',
    },
  },
  DataLiteral: {
    fields: {
      value: 'string',
    },
  },
  CharLiteral: {
    fields: {
      value: 'number',
    },
  },
  SymbolRef: {
    fields: {
      symbol: 'string',
    },
  },
  TypeRef: {
    fields: {
      symbol: 'string',
    },
  },
  PointerTypeExpr: {
    fields: {
      pointerToExpr: 'TypeExpr',
    },
  },
  GlobalDecl: {
    fields: {
      symbol: 'string',
      typeExpr: { type: 'TypeExpr', optional: true },
      expr: 'Expression',
    },
  },
  RegStatement: {
    fields: {
      symbol: 'string',
      typeExpr: { type: 'TypeExpr', optional: true },
      expr: { type: 'Expression', optional: true },
    },
  },
  LetStatement: {
    fields: {
      symbol: 'string',
      typeExpr: { type: 'TypeExpr', optional: true },
      expr: { type: 'Expression', optional: true },
    },
  },
  IfStatement: {
    fields: {
      condExpr: 'Expression',
      thenBlock: 'Block',
      elseBlock: 'Block',
    },
  },
  WhileStatement: {
    fields: {
      condExpr: 'Expression',
      thenBlock: 'Block',
    },
  },
  Block: {
    fields: {
      statements: { type: 'Statement', list: true },
    },
  },
  BinaryExpr: {
    fields: {
      op: 'string',
      left: 'Expression',
      right: 'Expression',
    },
  },
  CallExpr: {
    fields: {
      left: 'Expression',
      right: 'ArgList',
    },
  },
  MemberAccessExpr: {
    fields: {
      left: 'Expression',
      right: 'Expression',
    },
  },
  CastExpr: {
    fields: {
      expr: 'Expression',
      typeExpr: 'TypeExpr',
      force: 'boolean',
    },
  },
  UnaryExpr: {
    fields: {
      op: 'string',
      expr: 'Expression',
    },
  },
  ArrayLiteral: {
    fields: {
      elements: { type: 'Expression', list: true },
    },
  },
  TupleStructDecl: {
    fields: {
      symbol: 'string',
      elements: { type: 'TypeExpr', list: true },
    },
  },
  StructDecl: {
    fields: {
      symbol: 'string',
      props: { type: 'StructField', list: true },
    },
  },
  StructProp: {
    fields: {
      symbol: 'string',
      type: 'TypeExpr',
    },
  },
  StructLiteral: {
    fields: {
      symbol: 'SymbolRef',
      props: { type: 'StructLiteralProp', list: true },
    },
  },
  StructLiteralProp: {
    fields: {
      symbol: 'string',
      expr: 'Expression',
    },
  },
  ParameterList: {
    fields: {
      parameters: { type: 'Parameter', list: true },
    },
  },
  Parameter: {
    fields: {
      symbol: 'string',
      typeExpr: 'TypeExpr',
    },
  },
  FuncDecl: {
    fields: {
      symbol: 'string',
      parameters: 'ParameterList',
      returnType: { type: 'TypeExpr', optional: true },
      body: 'Block',
    },
  },
  ReturnStatement: {
    fields: {
      expr: 'Expression',
    },
  },
  ExprStatement: {
    fields: {
      expr: 'Expression',
    },
  },
  ArgList: {
    fields: {
      args: { type: 'Expression', list: true },
    },
  },
  File: {
    fields: {
      funcs: { type: 'FuncDecl', list: true },
      globals: { type: 'GlobalDecl', list: true },
      decls: { type: 'TopLevelDecl', list: true },
    },
  },
  ExternDecl: {
    fields: {
      libName: 'string',
      funcs: { type: 'FuncDecl', list: true },
    },
  },
  StructField: {
    union: ['StructProp', 'FuncDecl'],
  },
  TypeExpr: {
    union: ['PointerTypeExpr', 'TypeRef'],
  },
  LiteralExpr: {
    union: [
      'NumberLiteral',
      'DataLiteral',
      'CharLiteral',
      'ArrayLiteral',
      'BooleanLiteral',
      'SymbolRef',
      'StructLiteral',
    ],
  },
  TopLevelDecl: {
    union: ['ExternDecl', 'TupleStructDecl', 'StructDecl'],
  },
  Expression: {
    union: [
      'BinaryExpr',
      'UnaryExpr',
      'CastExpr',
      'LiteralExpr',
      'CallExpr',
      'CastExpr',
      'ArgList',
      'MemberAccessExpr',
    ],
  },
  Statement: {
    union: [
      'ReturnStatement',
      'WhileStatement',
      'IfStatement',
      'RegStatement',
      'LetStatement',
      'ExprStatement',
      'Block',
    ],
  },
};

export const nodes: Record<string, NodeSpec> = {};
for (const [key, value] of Object.entries(specInput)) {
  let nodeSpec: NodeSpec = {
    union: value.union,
  };
  if (value.fields) {
    let fields: Record<string, FieldSpec> = {};
    for (const [fieldName, fieldValue] of Object.entries(value.fields)) {
      if (typeof fieldValue === 'string') {
        fields[fieldName] = { type: fieldValue };
      } else {
        fields[fieldName] = fieldValue;
      }
    }
    nodeSpec.fields = fields;
  }
  nodes[key] = nodeSpec;
}

import { URL } from 'url';
const __dirname = new URL('.', import.meta.url).pathname;

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

function write() {
  let out: string[] = [];
  const emit = (s: string) => out.push(s);
  const emitLn = (...s: string[]) => emit(s.join('') + '\n');

  emitLn(`
export type Location = {
  source: string,
  start: {offset: number, line: number, column: number},
  end: {offset: number, line: number, column: number},
};
`);

  const emitNode = (name: string, fields: Record<string, FieldSpec>) => {
    emitLn();

    const argTypeSpec = (fieldName: string, spec: FieldSpec) =>
      `${fieldName}: ${spec.type}${spec.list ? '[]' : ''}${
        spec.optional ? '|undefined' : ''
      }`;
    const typeSpec = (fieldName: string, spec: FieldSpec) =>
      `${fieldName}${spec.optional ? '?' : ''}: ${spec.type}${
        spec.list ? '[]' : ''
      }`;

    let fieldType = `{`;
    Object.entries(fields).forEach(([fieldName, spec]) => {
      fieldType += typeSpec(fieldName, spec) + `; `;
    });
    fieldType += '}';

    emitLn(`type ${name}Fields = ${fieldType};`);

    emitLn(`
      export type ${name} = {
        name:"${name}",
        fields:${name}Fields,
        location?: Location,
      };
    `);
    emitLn(`
      export function is${name}(node: ASTNode): node is ${name} {
        return node.name === "${name}";
      }
    `);
    let args: string[] = [];
    Object.entries(fields).forEach(([fieldName, spec]) => {
      args.push(argTypeSpec(fieldName, spec));
    });
    emitLn(`
      export function make${name}(${args.join(', ')}): ${name} {
        return {
          name: "${name}",
          fields: {
            ${Object.keys(fields).join(', ')}
          }
        };
      }
    `);

    emitLn(`
      export function make${name}With(fields:${fieldType}): ${name} {
        return {
          name: "${name}",
          fields,
        };
      }
    `);
  };

  const emitUnionNode = (name: string, union: string[]) => {
    emitLn();
    emitLn(`export type ${name} = ${union.join(' | ')};`);
    emitLn(`export function is${name}(node: ASTNode): node is ${name} {
      return ${union.map((u) => `is${u}(node)`).join(' || ')};
    }`);
  };

  let allTypes: string[] = [];
  let allNames: string[] = [];
  for (const key in nodes) {
    const { fields, union } = nodes[key];
    if (fields) {
      emitNode(key, fields);
      allNames.push(key);
    } else if (union) {
      emitUnionNode(key, union);
    }
    allTypes.push(key);
  }

  emitLn(`export type ASTNode = ${allTypes.join(' | ')};`);
  emitLn(
    `export type ASTNodeName = ${allNames
      .map((name) => `"${name}"`)
      .join(' | ')};`
  );
  let outPath = path.join(__dirname, 'spec-gen.ts');
  fs.writeFileSync(outPath, out.join(''));

  exec(`npx prettier --write ${outPath}`, (error, stdout, stderr) => {
    if (error) {
      console.log(`error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.log(`stderr: ${stderr}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
  });
}
write();
