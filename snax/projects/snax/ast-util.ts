import {
  ASTNode,
  Block,
  makeBlock,
  makeFuncDecl,
  makeFuncDeclWith,
  makeNumberLiteral,
  makeParameterList,
  Parameter,
  Statement,
} from './spec-gen.js';

export function makeNum(
  value: number,
  interpretation: 'int' | 'float' = 'int'
) {
  return makeNumberLiteral(value, interpretation, undefined);
}

export function makeFunc(
  name: string,
  params: Parameter[] = [],
  body: Statement[] | Block = []
) {
  return makeFuncDeclWith({
    symbol: name,
    isPublic: false,
    parameters: makeParameterList(params ?? []),
    returnType: undefined,
    body: body instanceof Array ? makeBlock(body) : body,
  });
}

export function getPropNameOrThrow(node: ASTNode): string {
  switch (node.name) {
    case 'SymbolRef':
      return node.fields.symbol;
    case 'NumberLiteral':
      return String(node.fields.value);
    default:
      throw new Error(`${node.name} is not a valid property node`);
  }
}
