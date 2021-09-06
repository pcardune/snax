import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { ASTNode } from './spec-gen';
import { SymbolTable } from './symbol-resolution';

function isASTNode(node: any): node is ASTNode {
  return typeof node === 'object' && node !== null && node.name && node.fields;
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
    .map(([propName, propValue]) => `${propName}=${JSON.stringify(propValue)}`)
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
  symbolTables: OrderedMap<ASTNode, SymbolTable>
) {
  let props: Record<string, any> = {};
  let childElems: Elem[] = [];

  let symbolTable = symbolTables.get(node);
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

  for (let [fieldName, value] of Object.entries(node.fields)) {
    if (isASTNode(value)) {
      childElems.push(nodeDataToElem(value, symbolTables));
    } else if (value instanceof Array) {
      childElems.push(
        elem(
          fieldName,
          {},
          value.map((v) => nodeDataToElem(v, symbolTables))
        )
      );
    } else {
      props[fieldName] = value;
    }
  }
  return elem(node.name, props, childElems);
}

export function dumpSymbolTables(
  node: ASTNode,
  symbolTables: OrderedMap<ASTNode, SymbolTable>
) {
  return elemToString(nodeDataToElem(node, symbolTables));
}
