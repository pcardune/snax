import {
  Block,
  makeBlock,
  makeFuncDecl,
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
  return makeFuncDecl(
    name,
    makeParameterList(params ?? []),
    undefined,
    body instanceof Array ? makeBlock(body) : body
  );
}
