import * as spec from '../spec-gen';

export function makeNum(
  value: number,
  interpretation: 'int' | 'float' = 'int'
) {
  return spec.makeNumberLiteral(value, interpretation, null);
}

export function makeFunc(
  name: string,
  params: spec.Parameter[] = [],
  body: spec.Statement[] | spec.Block = []
) {
  return spec.makeFuncDecl(
    name,
    spec.makeParameterList(params ?? []),
    null,
    body instanceof Array ? spec.makeBlock(body) : body
  );
}
