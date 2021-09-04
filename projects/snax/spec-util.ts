import { NodeDataMap } from './ast-compiler';
import { ASTNode } from './spec-gen';

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

export function* depthFirstIter(node: ASTNode): Generator<ASTNode> {
  for (const child of children(node)) {
    for (const iterNode of depthFirstIter(child)) {
      yield iterNode;
    }
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

function nodeDataToElem(node: ASTNode, nodeDataMap: NodeDataMap) {
  let props: Record<string, any> = {};
  let childElems: Elem[] = [];

  let data = nodeDataMap.get(node);
  if (data.symbolTable) {
    childElems.push(
      elem(
        'SymbolTable',
        { id: data.symbolTable.id, parent: data.symbolTable.parent?.id },
        data.symbolTable.table
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
      childElems.push(nodeDataToElem(value, nodeDataMap));
    } else if (value instanceof Array) {
      childElems.push(
        elem(
          fieldName,
          {},
          value.map((v) => nodeDataToElem(v, nodeDataMap))
        )
      );
    } else {
      props[fieldName] = value;
    }
  }
  return elem(node.name, props, childElems);
}

export function dumpData(node: ASTNode, nodeDataMap: NodeDataMap) {
  return elemToString(nodeDataToElem(node, nodeDataMap));
}
