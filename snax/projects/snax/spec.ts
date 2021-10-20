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
  ExternFuncDecl: {
    fields: {
      symbol: 'string',
      parameters: 'ParameterList',
      returnType: { type: 'TypeExpr' },
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
      funcs: { type: 'ExternFuncDecl', list: true},
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
