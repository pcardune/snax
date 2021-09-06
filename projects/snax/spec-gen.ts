type BooleanLiteralFields = { value: boolean };

export type BooleanLiteral = {
  name: 'BooleanLiteral';
  fields: BooleanLiteralFields;
};

export function isBooleanLiteral(node: ASTNode): node is BooleanLiteral {
  return node.name === 'BooleanLiteral';
}

export function makeBooleanLiteral(value: boolean): BooleanLiteral {
  return {
    name: 'BooleanLiteral',
    fields: {
      value,
    },
  };
}

export function makeBooleanLiteralWith(fields: {
  value: boolean;
}): BooleanLiteral {
  return {
    name: 'BooleanLiteral',
    fields,
  };
}

type NumberLiteralFields = {
  value: number;
  numberType: 'int' | 'float';
  explicitType?: string;
};

export type NumberLiteral = {
  name: 'NumberLiteral';
  fields: NumberLiteralFields;
};

export function isNumberLiteral(node: ASTNode): node is NumberLiteral {
  return node.name === 'NumberLiteral';
}

export function makeNumberLiteral(
  value: number,
  numberType: 'int' | 'float',
  explicitType: string | undefined
): NumberLiteral {
  return {
    name: 'NumberLiteral',
    fields: {
      value,
      numberType,
      explicitType,
    },
  };
}

export function makeNumberLiteralWith(fields: {
  value: number;
  numberType: 'int' | 'float';
  explicitType?: string;
}): NumberLiteral {
  return {
    name: 'NumberLiteral',
    fields,
  };
}

type StringLiteralFields = { value: string };

export type StringLiteral = {
  name: 'StringLiteral';
  fields: StringLiteralFields;
};

export function isStringLiteral(node: ASTNode): node is StringLiteral {
  return node.name === 'StringLiteral';
}

export function makeStringLiteral(value: string): StringLiteral {
  return {
    name: 'StringLiteral',
    fields: {
      value,
    },
  };
}

export function makeStringLiteralWith(fields: {
  value: string;
}): StringLiteral {
  return {
    name: 'StringLiteral',
    fields,
  };
}

type SymbolRefFields = { symbol: string };

export type SymbolRef = {
  name: 'SymbolRef';
  fields: SymbolRefFields;
};

export function isSymbolRef(node: ASTNode): node is SymbolRef {
  return node.name === 'SymbolRef';
}

export function makeSymbolRef(symbol: string): SymbolRef {
  return {
    name: 'SymbolRef',
    fields: {
      symbol,
    },
  };
}

export function makeSymbolRefWith(fields: { symbol: string }): SymbolRef {
  return {
    name: 'SymbolRef',
    fields,
  };
}

type TypeRefFields = { symbol: string };

export type TypeRef = {
  name: 'TypeRef';
  fields: TypeRefFields;
};

export function isTypeRef(node: ASTNode): node is TypeRef {
  return node.name === 'TypeRef';
}

export function makeTypeRef(symbol: string): TypeRef {
  return {
    name: 'TypeRef',
    fields: {
      symbol,
    },
  };
}

export function makeTypeRefWith(fields: { symbol: string }): TypeRef {
  return {
    name: 'TypeRef',
    fields,
  };
}

type PointerTypeExprFields = { pointerToExpr: TypeExpr };

export type PointerTypeExpr = {
  name: 'PointerTypeExpr';
  fields: PointerTypeExprFields;
};

export function isPointerTypeExpr(node: ASTNode): node is PointerTypeExpr {
  return node.name === 'PointerTypeExpr';
}

export function makePointerTypeExpr(pointerToExpr: TypeExpr): PointerTypeExpr {
  return {
    name: 'PointerTypeExpr',
    fields: {
      pointerToExpr,
    },
  };
}

export function makePointerTypeExprWith(fields: {
  pointerToExpr: TypeExpr;
}): PointerTypeExpr {
  return {
    name: 'PointerTypeExpr',
    fields,
  };
}

type GlobalDeclFields = {
  symbol: string;
  typeExpr?: TypeExpr;
  expr: Expression;
};

export type GlobalDecl = {
  name: 'GlobalDecl';
  fields: GlobalDeclFields;
};

export function isGlobalDecl(node: ASTNode): node is GlobalDecl {
  return node.name === 'GlobalDecl';
}

export function makeGlobalDecl(
  symbol: string,
  typeExpr: TypeExpr | undefined,
  expr: Expression
): GlobalDecl {
  return {
    name: 'GlobalDecl',
    fields: {
      symbol,
      typeExpr,
      expr,
    },
  };
}

export function makeGlobalDeclWith(fields: {
  symbol: string;
  typeExpr?: TypeExpr;
  expr: Expression;
}): GlobalDecl {
  return {
    name: 'GlobalDecl',
    fields,
  };
}

type LetStatementFields = {
  symbol: string;
  typeExpr?: TypeExpr;
  expr: Expression;
};

export type LetStatement = {
  name: 'LetStatement';
  fields: LetStatementFields;
};

export function isLetStatement(node: ASTNode): node is LetStatement {
  return node.name === 'LetStatement';
}

export function makeLetStatement(
  symbol: string,
  typeExpr: TypeExpr | undefined,
  expr: Expression
): LetStatement {
  return {
    name: 'LetStatement',
    fields: {
      symbol,
      typeExpr,
      expr,
    },
  };
}

export function makeLetStatementWith(fields: {
  symbol: string;
  typeExpr?: TypeExpr;
  expr: Expression;
}): LetStatement {
  return {
    name: 'LetStatement',
    fields,
  };
}

type IfStatementFields = {
  condExpr: Expression;
  thenBlock: Block;
  elseBlock: Block;
};

export type IfStatement = {
  name: 'IfStatement';
  fields: IfStatementFields;
};

export function isIfStatement(node: ASTNode): node is IfStatement {
  return node.name === 'IfStatement';
}

export function makeIfStatement(
  condExpr: Expression,
  thenBlock: Block,
  elseBlock: Block
): IfStatement {
  return {
    name: 'IfStatement',
    fields: {
      condExpr,
      thenBlock,
      elseBlock,
    },
  };
}

export function makeIfStatementWith(fields: {
  condExpr: Expression;
  thenBlock: Block;
  elseBlock: Block;
}): IfStatement {
  return {
    name: 'IfStatement',
    fields,
  };
}

type WhileStatementFields = { condExpr: Expression; thenBlock: Block };

export type WhileStatement = {
  name: 'WhileStatement';
  fields: WhileStatementFields;
};

export function isWhileStatement(node: ASTNode): node is WhileStatement {
  return node.name === 'WhileStatement';
}

export function makeWhileStatement(
  condExpr: Expression,
  thenBlock: Block
): WhileStatement {
  return {
    name: 'WhileStatement',
    fields: {
      condExpr,
      thenBlock,
    },
  };
}

export function makeWhileStatementWith(fields: {
  condExpr: Expression;
  thenBlock: Block;
}): WhileStatement {
  return {
    name: 'WhileStatement',
    fields,
  };
}

type BlockFields = { statements: Statement[] };

export type Block = {
  name: 'Block';
  fields: BlockFields;
};

export function isBlock(node: ASTNode): node is Block {
  return node.name === 'Block';
}

export function makeBlock(statements: Statement[]): Block {
  return {
    name: 'Block',
    fields: {
      statements,
    },
  };
}

export function makeBlockWith(fields: { statements: Statement[] }): Block {
  return {
    name: 'Block',
    fields,
  };
}

type BinaryExprFields = { op: string; left: Expression; right: Expression };

export type BinaryExpr = {
  name: 'BinaryExpr';
  fields: BinaryExprFields;
};

export function isBinaryExpr(node: ASTNode): node is BinaryExpr {
  return node.name === 'BinaryExpr';
}

export function makeBinaryExpr(
  op: string,
  left: Expression,
  right: Expression
): BinaryExpr {
  return {
    name: 'BinaryExpr',
    fields: {
      op,
      left,
      right,
    },
  };
}

export function makeBinaryExprWith(fields: {
  op: string;
  left: Expression;
  right: Expression;
}): BinaryExpr {
  return {
    name: 'BinaryExpr',
    fields,
  };
}

type CallExprFields = { left: Expression; right: ArgList };

export type CallExpr = {
  name: 'CallExpr';
  fields: CallExprFields;
};

export function isCallExpr(node: ASTNode): node is CallExpr {
  return node.name === 'CallExpr';
}

export function makeCallExpr(left: Expression, right: ArgList): CallExpr {
  return {
    name: 'CallExpr',
    fields: {
      left,
      right,
    },
  };
}

export function makeCallExprWith(fields: {
  left: Expression;
  right: ArgList;
}): CallExpr {
  return {
    name: 'CallExpr',
    fields,
  };
}

type CastExprFields = { left: Expression; right: TypeExpr };

export type CastExpr = {
  name: 'CastExpr';
  fields: CastExprFields;
};

export function isCastExpr(node: ASTNode): node is CastExpr {
  return node.name === 'CastExpr';
}

export function makeCastExpr(left: Expression, right: TypeExpr): CastExpr {
  return {
    name: 'CastExpr',
    fields: {
      left,
      right,
    },
  };
}

export function makeCastExprWith(fields: {
  left: Expression;
  right: TypeExpr;
}): CastExpr {
  return {
    name: 'CastExpr',
    fields,
  };
}

type UnaryExprFields = { op: string; expr: Expression };

export type UnaryExpr = {
  name: 'UnaryExpr';
  fields: UnaryExprFields;
};

export function isUnaryExpr(node: ASTNode): node is UnaryExpr {
  return node.name === 'UnaryExpr';
}

export function makeUnaryExpr(op: string, expr: Expression): UnaryExpr {
  return {
    name: 'UnaryExpr',
    fields: {
      op,
      expr,
    },
  };
}

export function makeUnaryExprWith(fields: {
  op: string;
  expr: Expression;
}): UnaryExpr {
  return {
    name: 'UnaryExpr',
    fields,
  };
}

type ArrayLiteralFields = { elements: Expression[] };

export type ArrayLiteral = {
  name: 'ArrayLiteral';
  fields: ArrayLiteralFields;
};

export function isArrayLiteral(node: ASTNode): node is ArrayLiteral {
  return node.name === 'ArrayLiteral';
}

export function makeArrayLiteral(elements: Expression[]): ArrayLiteral {
  return {
    name: 'ArrayLiteral',
    fields: {
      elements,
    },
  };
}

export function makeArrayLiteralWith(fields: {
  elements: Expression[];
}): ArrayLiteral {
  return {
    name: 'ArrayLiteral',
    fields,
  };
}

type ParameterListFields = { parameters: Parameter[] };

export type ParameterList = {
  name: 'ParameterList';
  fields: ParameterListFields;
};

export function isParameterList(node: ASTNode): node is ParameterList {
  return node.name === 'ParameterList';
}

export function makeParameterList(parameters: Parameter[]): ParameterList {
  return {
    name: 'ParameterList',
    fields: {
      parameters,
    },
  };
}

export function makeParameterListWith(fields: {
  parameters: Parameter[];
}): ParameterList {
  return {
    name: 'ParameterList',
    fields,
  };
}

type ParameterFields = { symbol: string; typeExpr: TypeExpr };

export type Parameter = {
  name: 'Parameter';
  fields: ParameterFields;
};

export function isParameter(node: ASTNode): node is Parameter {
  return node.name === 'Parameter';
}

export function makeParameter(symbol: string, typeExpr: TypeExpr): Parameter {
  return {
    name: 'Parameter',
    fields: {
      symbol,
      typeExpr,
    },
  };
}

export function makeParameterWith(fields: {
  symbol: string;
  typeExpr: TypeExpr;
}): Parameter {
  return {
    name: 'Parameter',
    fields,
  };
}

type FuncDeclFields = {
  symbol: string;
  parameters: ParameterList;
  returnType?: TypeExpr;
  body: Block;
};

export type FuncDecl = {
  name: 'FuncDecl';
  fields: FuncDeclFields;
};

export function isFuncDecl(node: ASTNode): node is FuncDecl {
  return node.name === 'FuncDecl';
}

export function makeFuncDecl(
  symbol: string,
  parameters: ParameterList,
  returnType: TypeExpr | undefined,
  body: Block
): FuncDecl {
  return {
    name: 'FuncDecl',
    fields: {
      symbol,
      parameters,
      returnType,
      body,
    },
  };
}

export function makeFuncDeclWith(fields: {
  symbol: string;
  parameters: ParameterList;
  returnType?: TypeExpr;
  body: Block;
}): FuncDecl {
  return {
    name: 'FuncDecl',
    fields,
  };
}

type ReturnStatementFields = { expr: Expression };

export type ReturnStatement = {
  name: 'ReturnStatement';
  fields: ReturnStatementFields;
};

export function isReturnStatement(node: ASTNode): node is ReturnStatement {
  return node.name === 'ReturnStatement';
}

export function makeReturnStatement(expr: Expression): ReturnStatement {
  return {
    name: 'ReturnStatement',
    fields: {
      expr,
    },
  };
}

export function makeReturnStatementWith(fields: {
  expr: Expression;
}): ReturnStatement {
  return {
    name: 'ReturnStatement',
    fields,
  };
}

type ExprStatementFields = { expr: Expression };

export type ExprStatement = {
  name: 'ExprStatement';
  fields: ExprStatementFields;
};

export function isExprStatement(node: ASTNode): node is ExprStatement {
  return node.name === 'ExprStatement';
}

export function makeExprStatement(expr: Expression): ExprStatement {
  return {
    name: 'ExprStatement',
    fields: {
      expr,
    },
  };
}

export function makeExprStatementWith(fields: {
  expr: Expression;
}): ExprStatement {
  return {
    name: 'ExprStatement',
    fields,
  };
}

type ArgListFields = { args: Expression[] };

export type ArgList = {
  name: 'ArgList';
  fields: ArgListFields;
};

export function isArgList(node: ASTNode): node is ArgList {
  return node.name === 'ArgList';
}

export function makeArgList(args: Expression[]): ArgList {
  return {
    name: 'ArgList',
    fields: {
      args,
    },
  };
}

export function makeArgListWith(fields: { args: Expression[] }): ArgList {
  return {
    name: 'ArgList',
    fields,
  };
}

type FileFields = {
  funcs: FuncDecl[];
  globals: GlobalDecl[];
  decls: ExternDecl[];
};

export type File = {
  name: 'File';
  fields: FileFields;
};

export function isFile(node: ASTNode): node is File {
  return node.name === 'File';
}

export function makeFile(
  funcs: FuncDecl[],
  globals: GlobalDecl[],
  decls: ExternDecl[]
): File {
  return {
    name: 'File',
    fields: {
      funcs,
      globals,
      decls,
    },
  };
}

export function makeFileWith(fields: {
  funcs: FuncDecl[];
  globals: GlobalDecl[];
  decls: ExternDecl[];
}): File {
  return {
    name: 'File',
    fields,
  };
}

type ExternDeclFields = { libName: string; funcs: FuncDecl[] };

export type ExternDecl = {
  name: 'ExternDecl';
  fields: ExternDeclFields;
};

export function isExternDecl(node: ASTNode): node is ExternDecl {
  return node.name === 'ExternDecl';
}

export function makeExternDecl(libName: string, funcs: FuncDecl[]): ExternDecl {
  return {
    name: 'ExternDecl',
    fields: {
      libName,
      funcs,
    },
  };
}

export function makeExternDeclWith(fields: {
  libName: string;
  funcs: FuncDecl[];
}): ExternDecl {
  return {
    name: 'ExternDecl',
    fields,
  };
}

export type TypeExpr = PointerTypeExpr | TypeRef;
export function isTypeExpr(node: ASTNode): node is TypeExpr {
  return isPointerTypeExpr(node) || isTypeRef(node);
}

export type LiteralExpr =
  | NumberLiteral
  | StringLiteral
  | ArrayLiteral
  | BooleanLiteral
  | SymbolRef;
export function isLiteralExpr(node: ASTNode): node is LiteralExpr {
  return (
    isNumberLiteral(node) ||
    isStringLiteral(node) ||
    isArrayLiteral(node) ||
    isBooleanLiteral(node) ||
    isSymbolRef(node)
  );
}

export type Expression =
  | BinaryExpr
  | UnaryExpr
  | LiteralExpr
  | CallExpr
  | CastExpr
  | ArgList;
export function isExpression(node: ASTNode): node is Expression {
  return (
    isBinaryExpr(node) ||
    isUnaryExpr(node) ||
    isLiteralExpr(node) ||
    isCallExpr(node) ||
    isCastExpr(node) ||
    isArgList(node)
  );
}

export type Statement =
  | ReturnStatement
  | WhileStatement
  | IfStatement
  | LetStatement
  | ExprStatement
  | Block;
export function isStatement(node: ASTNode): node is Statement {
  return (
    isReturnStatement(node) ||
    isWhileStatement(node) ||
    isIfStatement(node) ||
    isLetStatement(node) ||
    isExprStatement(node) ||
    isBlock(node)
  );
}
export type ASTNode =
  | BooleanLiteral
  | NumberLiteral
  | StringLiteral
  | SymbolRef
  | TypeRef
  | PointerTypeExpr
  | GlobalDecl
  | LetStatement
  | IfStatement
  | WhileStatement
  | Block
  | BinaryExpr
  | CallExpr
  | CastExpr
  | UnaryExpr
  | ArrayLiteral
  | ParameterList
  | Parameter
  | FuncDecl
  | ReturnStatement
  | ExprStatement
  | ArgList
  | File
  | ExternDecl
  | TypeExpr
  | LiteralExpr
  | Expression
  | Statement;
export type ASTNodeName =
  | 'BooleanLiteral'
  | 'NumberLiteral'
  | 'StringLiteral'
  | 'SymbolRef'
  | 'TypeRef'
  | 'PointerTypeExpr'
  | 'GlobalDecl'
  | 'LetStatement'
  | 'IfStatement'
  | 'WhileStatement'
  | 'Block'
  | 'BinaryExpr'
  | 'CallExpr'
  | 'CastExpr'
  | 'UnaryExpr'
  | 'ArrayLiteral'
  | 'ParameterList'
  | 'Parameter'
  | 'FuncDecl'
  | 'ReturnStatement'
  | 'ExprStatement'
  | 'ArgList'
  | 'File'
  | 'ExternDecl';
