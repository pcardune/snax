export type Location = {
  source: string;
  start: { offset: number; line: number; column: number };
  end: { offset: number; line: number; column: number };
};

type BooleanLiteralFields = { value: boolean };

export type BooleanLiteral = {
  name: 'BooleanLiteral';
  fields: BooleanLiteralFields;
  location?: Location;
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
  location?: Location;
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
  location?: Location;
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

type DataLiteralFields = { value: string };

export type DataLiteral = {
  name: 'DataLiteral';
  fields: DataLiteralFields;
  location?: Location;
};

export function isDataLiteral(node: ASTNode): node is DataLiteral {
  return node.name === 'DataLiteral';
}

export function makeDataLiteral(value: string): DataLiteral {
  return {
    name: 'DataLiteral',
    fields: {
      value,
    },
  };
}

export function makeDataLiteralWith(fields: { value: string }): DataLiteral {
  return {
    name: 'DataLiteral',
    fields,
  };
}

type CharLiteralFields = { value: number };

export type CharLiteral = {
  name: 'CharLiteral';
  fields: CharLiteralFields;
  location?: Location;
};

export function isCharLiteral(node: ASTNode): node is CharLiteral {
  return node.name === 'CharLiteral';
}

export function makeCharLiteral(value: number): CharLiteral {
  return {
    name: 'CharLiteral',
    fields: {
      value,
    },
  };
}

export function makeCharLiteralWith(fields: { value: number }): CharLiteral {
  return {
    name: 'CharLiteral',
    fields,
  };
}

type NamespacedRefFields = { path: string[] };

export type NamespacedRef = {
  name: 'NamespacedRef';
  fields: NamespacedRefFields;
  location?: Location;
};

export function isNamespacedRef(node: ASTNode): node is NamespacedRef {
  return node.name === 'NamespacedRef';
}

export function makeNamespacedRef(path: string[]): NamespacedRef {
  return {
    name: 'NamespacedRef',
    fields: {
      path,
    },
  };
}

export function makeNamespacedRefWith(fields: {
  path: string[];
}): NamespacedRef {
  return {
    name: 'NamespacedRef',
    fields,
  };
}

type SymbolRefFields = { symbol: string };

export type SymbolRef = {
  name: 'SymbolRef';
  fields: SymbolRefFields;
  location?: Location;
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

type TypeRefFields = { symbol: NamedSymbol };

export type TypeRef = {
  name: 'TypeRef';
  fields: TypeRefFields;
  location?: Location;
};

export function isTypeRef(node: ASTNode): node is TypeRef {
  return node.name === 'TypeRef';
}

export function makeTypeRef(symbol: NamedSymbol): TypeRef {
  return {
    name: 'TypeRef',
    fields: {
      symbol,
    },
  };
}

export function makeTypeRefWith(fields: { symbol: NamedSymbol }): TypeRef {
  return {
    name: 'TypeRef',
    fields,
  };
}

type PointerTypeExprFields = { pointerToExpr: TypeExpr };

export type PointerTypeExpr = {
  name: 'PointerTypeExpr';
  fields: PointerTypeExprFields;
  location?: Location;
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

type ArrayTypeExprFields = { valueTypeExpr: TypeExpr; size: number };

export type ArrayTypeExpr = {
  name: 'ArrayTypeExpr';
  fields: ArrayTypeExprFields;
  location?: Location;
};

export function isArrayTypeExpr(node: ASTNode): node is ArrayTypeExpr {
  return node.name === 'ArrayTypeExpr';
}

export function makeArrayTypeExpr(
  valueTypeExpr: TypeExpr,
  size: number
): ArrayTypeExpr {
  return {
    name: 'ArrayTypeExpr',
    fields: {
      valueTypeExpr,
      size,
    },
  };
}

export function makeArrayTypeExprWith(fields: {
  valueTypeExpr: TypeExpr;
  size: number;
}): ArrayTypeExpr {
  return {
    name: 'ArrayTypeExpr',
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
  location?: Location;
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

type RegStatementFields = {
  symbol: string;
  typeExpr?: TypeExpr;
  expr?: Expression;
};

export type RegStatement = {
  name: 'RegStatement';
  fields: RegStatementFields;
  location?: Location;
};

export function isRegStatement(node: ASTNode): node is RegStatement {
  return node.name === 'RegStatement';
}

export function makeRegStatement(
  symbol: string,
  typeExpr: TypeExpr | undefined,
  expr: Expression | undefined
): RegStatement {
  return {
    name: 'RegStatement',
    fields: {
      symbol,
      typeExpr,
      expr,
    },
  };
}

export function makeRegStatementWith(fields: {
  symbol: string;
  typeExpr?: TypeExpr;
  expr?: Expression;
}): RegStatement {
  return {
    name: 'RegStatement',
    fields,
  };
}

type LetStatementFields = {
  symbol: string;
  typeExpr?: TypeExpr;
  expr?: Expression;
};

export type LetStatement = {
  name: 'LetStatement';
  fields: LetStatementFields;
  location?: Location;
};

export function isLetStatement(node: ASTNode): node is LetStatement {
  return node.name === 'LetStatement';
}

export function makeLetStatement(
  symbol: string,
  typeExpr: TypeExpr | undefined,
  expr: Expression | undefined
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
  expr?: Expression;
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
  location?: Location;
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
  location?: Location;
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
  location?: Location;
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
  location?: Location;
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

type CompilerCallExprFields = { symbol: string; right: ArgList };

export type CompilerCallExpr = {
  name: 'CompilerCallExpr';
  fields: CompilerCallExprFields;
  location?: Location;
};

export function isCompilerCallExpr(node: ASTNode): node is CompilerCallExpr {
  return node.name === 'CompilerCallExpr';
}

export function makeCompilerCallExpr(
  symbol: string,
  right: ArgList
): CompilerCallExpr {
  return {
    name: 'CompilerCallExpr',
    fields: {
      symbol,
      right,
    },
  };
}

export function makeCompilerCallExprWith(fields: {
  symbol: string;
  right: ArgList;
}): CompilerCallExpr {
  return {
    name: 'CompilerCallExpr',
    fields,
  };
}

type CallExprFields = { left: Expression; right: ArgList };

export type CallExpr = {
  name: 'CallExpr';
  fields: CallExprFields;
  location?: Location;
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

type MemberAccessExprFields = { left: Expression; right: Expression };

export type MemberAccessExpr = {
  name: 'MemberAccessExpr';
  fields: MemberAccessExprFields;
  location?: Location;
};

export function isMemberAccessExpr(node: ASTNode): node is MemberAccessExpr {
  return node.name === 'MemberAccessExpr';
}

export function makeMemberAccessExpr(
  left: Expression,
  right: Expression
): MemberAccessExpr {
  return {
    name: 'MemberAccessExpr',
    fields: {
      left,
      right,
    },
  };
}

export function makeMemberAccessExprWith(fields: {
  left: Expression;
  right: Expression;
}): MemberAccessExpr {
  return {
    name: 'MemberAccessExpr',
    fields,
  };
}

type CastExprFields = { expr: Expression; typeExpr: TypeExpr; force: boolean };

export type CastExpr = {
  name: 'CastExpr';
  fields: CastExprFields;
  location?: Location;
};

export function isCastExpr(node: ASTNode): node is CastExpr {
  return node.name === 'CastExpr';
}

export function makeCastExpr(
  expr: Expression,
  typeExpr: TypeExpr,
  force: boolean
): CastExpr {
  return {
    name: 'CastExpr',
    fields: {
      expr,
      typeExpr,
      force,
    },
  };
}

export function makeCastExprWith(fields: {
  expr: Expression;
  typeExpr: TypeExpr;
  force: boolean;
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
  location?: Location;
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

type ArrayLiteralFields = { elements: Expression[]; size?: NumberLiteral };

export type ArrayLiteral = {
  name: 'ArrayLiteral';
  fields: ArrayLiteralFields;
  location?: Location;
};

export function isArrayLiteral(node: ASTNode): node is ArrayLiteral {
  return node.name === 'ArrayLiteral';
}

export function makeArrayLiteral(
  elements: Expression[],
  size: NumberLiteral | undefined
): ArrayLiteral {
  return {
    name: 'ArrayLiteral',
    fields: {
      elements,
      size,
    },
  };
}

export function makeArrayLiteralWith(fields: {
  elements: Expression[];
  size?: NumberLiteral;
}): ArrayLiteral {
  return {
    name: 'ArrayLiteral',
    fields,
  };
}

type TupleStructDeclFields = { symbol: string; elements: TypeExpr[] };

export type TupleStructDecl = {
  name: 'TupleStructDecl';
  fields: TupleStructDeclFields;
  location?: Location;
};

export function isTupleStructDecl(node: ASTNode): node is TupleStructDecl {
  return node.name === 'TupleStructDecl';
}

export function makeTupleStructDecl(
  symbol: string,
  elements: TypeExpr[]
): TupleStructDecl {
  return {
    name: 'TupleStructDecl',
    fields: {
      symbol,
      elements,
    },
  };
}

export function makeTupleStructDeclWith(fields: {
  symbol: string;
  elements: TypeExpr[];
}): TupleStructDecl {
  return {
    name: 'TupleStructDecl',
    fields,
  };
}

type StructDeclFields = { symbol: string; props: StructField[] };

export type StructDecl = {
  name: 'StructDecl';
  fields: StructDeclFields;
  location?: Location;
};

export function isStructDecl(node: ASTNode): node is StructDecl {
  return node.name === 'StructDecl';
}

export function makeStructDecl(
  symbol: string,
  props: StructField[]
): StructDecl {
  return {
    name: 'StructDecl',
    fields: {
      symbol,
      props,
    },
  };
}

export function makeStructDeclWith(fields: {
  symbol: string;
  props: StructField[];
}): StructDecl {
  return {
    name: 'StructDecl',
    fields,
  };
}

type StructPropFields = { symbol: string; type: TypeExpr };

export type StructProp = {
  name: 'StructProp';
  fields: StructPropFields;
  location?: Location;
};

export function isStructProp(node: ASTNode): node is StructProp {
  return node.name === 'StructProp';
}

export function makeStructProp(symbol: string, type: TypeExpr): StructProp {
  return {
    name: 'StructProp',
    fields: {
      symbol,
      type,
    },
  };
}

export function makeStructPropWith(fields: {
  symbol: string;
  type: TypeExpr;
}): StructProp {
  return {
    name: 'StructProp',
    fields,
  };
}

type StructLiteralFields = { symbol: NamedSymbol; props: StructLiteralProp[] };

export type StructLiteral = {
  name: 'StructLiteral';
  fields: StructLiteralFields;
  location?: Location;
};

export function isStructLiteral(node: ASTNode): node is StructLiteral {
  return node.name === 'StructLiteral';
}

export function makeStructLiteral(
  symbol: NamedSymbol,
  props: StructLiteralProp[]
): StructLiteral {
  return {
    name: 'StructLiteral',
    fields: {
      symbol,
      props,
    },
  };
}

export function makeStructLiteralWith(fields: {
  symbol: NamedSymbol;
  props: StructLiteralProp[];
}): StructLiteral {
  return {
    name: 'StructLiteral',
    fields,
  };
}

type StructLiteralPropFields = { symbol: string; expr: Expression };

export type StructLiteralProp = {
  name: 'StructLiteralProp';
  fields: StructLiteralPropFields;
  location?: Location;
};

export function isStructLiteralProp(node: ASTNode): node is StructLiteralProp {
  return node.name === 'StructLiteralProp';
}

export function makeStructLiteralProp(
  symbol: string,
  expr: Expression
): StructLiteralProp {
  return {
    name: 'StructLiteralProp',
    fields: {
      symbol,
      expr,
    },
  };
}

export function makeStructLiteralPropWith(fields: {
  symbol: string;
  expr: Expression;
}): StructLiteralProp {
  return {
    name: 'StructLiteralProp',
    fields,
  };
}

type ParameterListFields = { parameters: Parameter[] };

export type ParameterList = {
  name: 'ParameterList';
  fields: ParameterListFields;
  location?: Location;
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
  location?: Location;
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

type ExternFuncDeclFields = {
  symbol: string;
  parameters: ParameterList;
  returnType: TypeExpr;
};

export type ExternFuncDecl = {
  name: 'ExternFuncDecl';
  fields: ExternFuncDeclFields;
  location?: Location;
};

export function isExternFuncDecl(node: ASTNode): node is ExternFuncDecl {
  return node.name === 'ExternFuncDecl';
}

export function makeExternFuncDecl(
  symbol: string,
  parameters: ParameterList,
  returnType: TypeExpr
): ExternFuncDecl {
  return {
    name: 'ExternFuncDecl',
    fields: {
      symbol,
      parameters,
      returnType,
    },
  };
}

export function makeExternFuncDeclWith(fields: {
  symbol: string;
  parameters: ParameterList;
  returnType: TypeExpr;
}): ExternFuncDecl {
  return {
    name: 'ExternFuncDecl',
    fields,
  };
}

type FuncDeclFields = {
  isPublic?: boolean;
  symbol: string;
  parameters: ParameterList;
  returnType?: TypeExpr;
  body: Block;
};

export type FuncDecl = {
  name: 'FuncDecl';
  fields: FuncDeclFields;
  location?: Location;
};

export function isFuncDecl(node: ASTNode): node is FuncDecl {
  return node.name === 'FuncDecl';
}

export function makeFuncDecl(
  isPublic: boolean | undefined,
  symbol: string,
  parameters: ParameterList,
  returnType: TypeExpr | undefined,
  body: Block
): FuncDecl {
  return {
    name: 'FuncDecl',
    fields: {
      isPublic,
      symbol,
      parameters,
      returnType,
      body,
    },
  };
}

export function makeFuncDeclWith(fields: {
  isPublic?: boolean;
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
  location?: Location;
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
  location?: Location;
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
  location?: Location;
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

type FileFields = { decls: TopLevelDecl[] };

export type File = {
  name: 'File';
  fields: FileFields;
  location?: Location;
};

export function isFile(node: ASTNode): node is File {
  return node.name === 'File';
}

export function makeFile(decls: TopLevelDecl[]): File {
  return {
    name: 'File',
    fields: {
      decls,
    },
  };
}

export function makeFileWith(fields: { decls: TopLevelDecl[] }): File {
  return {
    name: 'File',
    fields,
  };
}

type ImportDeclFields = { symbol: string; path: string };

export type ImportDecl = {
  name: 'ImportDecl';
  fields: ImportDeclFields;
  location?: Location;
};

export function isImportDecl(node: ASTNode): node is ImportDecl {
  return node.name === 'ImportDecl';
}

export function makeImportDecl(symbol: string, path: string): ImportDecl {
  return {
    name: 'ImportDecl',
    fields: {
      symbol,
      path,
    },
  };
}

export function makeImportDeclWith(fields: {
  symbol: string;
  path: string;
}): ImportDecl {
  return {
    name: 'ImportDecl',
    fields,
  };
}

type ModuleDeclFields = {
  symbol: string;
  globalNamespace?: boolean;
  decls: TopLevelDecl[];
};

export type ModuleDecl = {
  name: 'ModuleDecl';
  fields: ModuleDeclFields;
  location?: Location;
};

export function isModuleDecl(node: ASTNode): node is ModuleDecl {
  return node.name === 'ModuleDecl';
}

export function makeModuleDecl(
  symbol: string,
  globalNamespace: boolean | undefined,
  decls: TopLevelDecl[]
): ModuleDecl {
  return {
    name: 'ModuleDecl',
    fields: {
      symbol,
      globalNamespace,
      decls,
    },
  };
}

export function makeModuleDeclWith(fields: {
  symbol: string;
  globalNamespace?: boolean;
  decls: TopLevelDecl[];
}): ModuleDecl {
  return {
    name: 'ModuleDecl',
    fields,
  };
}

type ExternDeclFields = { libName: string; funcs: ExternFuncDecl[] };

export type ExternDecl = {
  name: 'ExternDecl';
  fields: ExternDeclFields;
  location?: Location;
};

export function isExternDecl(node: ASTNode): node is ExternDecl {
  return node.name === 'ExternDecl';
}

export function makeExternDecl(
  libName: string,
  funcs: ExternFuncDecl[]
): ExternDecl {
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
  funcs: ExternFuncDecl[];
}): ExternDecl {
  return {
    name: 'ExternDecl',
    fields,
  };
}

export type StructField = StructProp | FuncDecl;
export function isStructField(node: ASTNode): node is StructField {
  return isStructProp(node) || isFuncDecl(node);
}

export type TypeExpr = PointerTypeExpr | ArrayTypeExpr | TypeRef;
export function isTypeExpr(node: ASTNode): node is TypeExpr {
  return isPointerTypeExpr(node) || isArrayTypeExpr(node) || isTypeRef(node);
}

export type NamedSymbol = SymbolRef | NamespacedRef;
export function isNamedSymbol(node: ASTNode): node is NamedSymbol {
  return isSymbolRef(node) || isNamespacedRef(node);
}

export type LiteralExpr =
  | NumberLiteral
  | DataLiteral
  | CharLiteral
  | ArrayLiteral
  | BooleanLiteral
  | SymbolRef
  | NamespacedRef
  | StructLiteral;
export function isLiteralExpr(node: ASTNode): node is LiteralExpr {
  return (
    isNumberLiteral(node) ||
    isDataLiteral(node) ||
    isCharLiteral(node) ||
    isArrayLiteral(node) ||
    isBooleanLiteral(node) ||
    isSymbolRef(node) ||
    isNamespacedRef(node) ||
    isStructLiteral(node)
  );
}

export type TopLevelDecl =
  | ExternDecl
  | TupleStructDecl
  | StructDecl
  | GlobalDecl
  | FuncDecl
  | ModuleDecl
  | ImportDecl;
export function isTopLevelDecl(node: ASTNode): node is TopLevelDecl {
  return (
    isExternDecl(node) ||
    isTupleStructDecl(node) ||
    isStructDecl(node) ||
    isGlobalDecl(node) ||
    isFuncDecl(node) ||
    isModuleDecl(node) ||
    isImportDecl(node)
  );
}

export type Expression =
  | BinaryExpr
  | UnaryExpr
  | CastExpr
  | LiteralExpr
  | CallExpr
  | CompilerCallExpr
  | CastExpr
  | ArgList
  | MemberAccessExpr;
export function isExpression(node: ASTNode): node is Expression {
  return (
    isBinaryExpr(node) ||
    isUnaryExpr(node) ||
    isCastExpr(node) ||
    isLiteralExpr(node) ||
    isCallExpr(node) ||
    isCompilerCallExpr(node) ||
    isCastExpr(node) ||
    isArgList(node) ||
    isMemberAccessExpr(node)
  );
}

export type Statement =
  | ReturnStatement
  | WhileStatement
  | IfStatement
  | RegStatement
  | LetStatement
  | ExprStatement
  | Block;
export function isStatement(node: ASTNode): node is Statement {
  return (
    isReturnStatement(node) ||
    isWhileStatement(node) ||
    isIfStatement(node) ||
    isRegStatement(node) ||
    isLetStatement(node) ||
    isExprStatement(node) ||
    isBlock(node)
  );
}
export type ASTNode =
  | BooleanLiteral
  | NumberLiteral
  | StringLiteral
  | DataLiteral
  | CharLiteral
  | NamespacedRef
  | SymbolRef
  | TypeRef
  | PointerTypeExpr
  | ArrayTypeExpr
  | GlobalDecl
  | RegStatement
  | LetStatement
  | IfStatement
  | WhileStatement
  | Block
  | BinaryExpr
  | CompilerCallExpr
  | CallExpr
  | MemberAccessExpr
  | CastExpr
  | UnaryExpr
  | ArrayLiteral
  | TupleStructDecl
  | StructDecl
  | StructProp
  | StructLiteral
  | StructLiteralProp
  | ParameterList
  | Parameter
  | ExternFuncDecl
  | FuncDecl
  | ReturnStatement
  | ExprStatement
  | ArgList
  | File
  | ImportDecl
  | ModuleDecl
  | ExternDecl
  | StructField
  | TypeExpr
  | NamedSymbol
  | LiteralExpr
  | TopLevelDecl
  | Expression
  | Statement;
export type ASTNodeName =
  | 'BooleanLiteral'
  | 'NumberLiteral'
  | 'StringLiteral'
  | 'DataLiteral'
  | 'CharLiteral'
  | 'NamespacedRef'
  | 'SymbolRef'
  | 'TypeRef'
  | 'PointerTypeExpr'
  | 'ArrayTypeExpr'
  | 'GlobalDecl'
  | 'RegStatement'
  | 'LetStatement'
  | 'IfStatement'
  | 'WhileStatement'
  | 'Block'
  | 'BinaryExpr'
  | 'CompilerCallExpr'
  | 'CallExpr'
  | 'MemberAccessExpr'
  | 'CastExpr'
  | 'UnaryExpr'
  | 'ArrayLiteral'
  | 'TupleStructDecl'
  | 'StructDecl'
  | 'StructProp'
  | 'StructLiteral'
  | 'StructLiteralProp'
  | 'ParameterList'
  | 'Parameter'
  | 'ExternFuncDecl'
  | 'FuncDecl'
  | 'ReturnStatement'
  | 'ExprStatement'
  | 'ArgList'
  | 'File'
  | 'ImportDecl'
  | 'ModuleDecl'
  | 'ExternDecl';
