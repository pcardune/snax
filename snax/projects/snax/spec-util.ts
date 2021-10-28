import type { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import type { ASTNode } from './spec-gen.js';
import type { SymbolTable } from './symbol-resolution.js';
import type { ResolvedTypeMap } from './type-resolution.js';

function isASTNode(node: any): node is ASTNode {
  return typeof node === 'object' && node !== null && node.name && node.fields;
}

export function pretty(node: ASTNode): string {
  switch (node.name) {
    case 'SymbolRef':
      return node.fields.symbol;
    case 'NamespacedRef':
      return node.fields.path.join('::');
    default:
      return node.name;
  }
}

export function children(node: ASTNode): ASTNode[] {
  let children: ASTNode[] = [];
  if (isASTNode(node)) {
    for (let field of Object.values(node.fields)) {
      if (field instanceof Array) {
        children.push(...field);
      } else if (isASTNode(field)) {
        children.push(field);
      }
    }
  }
  return children;
}

export function* preorderIter(node: ASTNode): Generator<ASTNode> {
  yield node;
  for (const child of children(node)) {
    yield* preorderIter(child);
  }
}

export function* depthFirstIter(node: ASTNode): Generator<ASTNode> {
  for (const child of children(node)) {
    yield* depthFirstIter(child);
  }
  yield node;
}

export function debugStr(node: ASTNode) {
  let s = `<${node.name} `;
  for (let [fieldName, value] of Object.entries(node.fields)) {
    if (isASTNode(value) || value instanceof Array) {
      continue;
    }
    s += `${fieldName}=${JSON.stringify(value)} `;
  }
  s += '/>';
  return s;
}

type Elem = { tag: string; props: Record<string, any>; children: Elem[] };
function elem(tag: string, props: Record<string, any>, children: Elem[]): Elem {
  return {
    tag,
    props,
    children,
  };
}

function elemToString(elem: Elem, indent = '') {
  let s = `${indent}<${elem.tag}`;

  let props = Object.entries(elem.props)
    .map(
      ([propName, propValue]) => `${propName}=${JSON.stringify('' + propValue)}`
    )
    .join(' ');
  if (props.length > 0) {
    s += ' ' + props;
  }
  if (elem.children.length == 0) {
    return s + '/>';
  }

  s += '>\n';

  for (const child of elem.children) {
    s += elemToString(child, indent + '  ') + '\n';
  }

  s += `${indent}</${elem.tag}>`;
  return s;
}

function nodeDataToElem(
  node: ASTNode,
  data: {
    symbolTables?: OrderedMap<ASTNode, SymbolTable>;
    typeMap?: ResolvedTypeMap;
  }
) {
  let props: Record<string, any> = {};
  let childElems: Elem[] = [];

  if (data.symbolTables) {
    let symbolTable = data.symbolTables.get(node);
    if (symbolTable) {
      childElems.push(
        elem(
          'SymbolTable',
          { id: symbolTable.id, parent: symbolTable.parent?.id },
          symbolTable.table
            .entries()
            .map(([i, symbol, record]) => {
              let props = {};
              return elem(symbol, props, []);
            })
            .toArray()
        )
      );
    }
  }

  for (let [fieldName, value] of Object.entries(node.fields)) {
    if (isASTNode(value)) {
      childElems.push(nodeDataToElem(value, data));
    } else if (value instanceof Array) {
      childElems.push(
        elem(
          fieldName,
          {},
          value.map((v) => nodeDataToElem(v, data))
        )
      );
    } else {
      props[fieldName] = value;
    }
  }

  if (node.location) {
    const { line, column } = node.location.start;
    props['_loc'] = `${node.location.source}:${line}:${column}`;
  }
  if (data.typeMap) {
    if (data.typeMap.has(node)) {
      props['_type'] = data.typeMap.get(node).name;
    } else {
      props['_type'] = 'MISSING';
    }
  }

  return elem(node.name, props, childElems);
}

export function dumpASTData(
  node: ASTNode,
  {
    symbolTables,
    typeMap,
  }: {
    symbolTables?: OrderedMap<ASTNode, SymbolTable>;
    typeMap?: ResolvedTypeMap;
  }
) {
  return elemToString(nodeDataToElem(node, { symbolTables, typeMap }));
}
