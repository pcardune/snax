import {
  ASTNode,
  makeDataLiteral,
  makeNumberLiteral,
  makeStructLiteral,
  makeStructLiteralProp,
  makeStructLiteralWith,
  makeSymbolRef,
} from './spec-gen.js';
import { children, depthFirstIter } from './spec-util.js';

function* nodesWithParentIter(
  node: ASTNode,
  parent?: ASTNode
): Generator<{ node: ASTNode; parent?: ASTNode }> {
  yield { node, parent };
  for (const child of children(node)) {
    yield* nodesWithParentIter(child, node);
  }
}

function overwriteNode(originalNode: ASTNode, newNode: ASTNode) {
  originalNode.name = newNode.name;
  originalNode.fields = newNode.fields;
}

export function desugar(root: ASTNode) {
  for (const node of depthFirstIter(root)) {
    if (node.name === 'StringLiteral') {
      const structLiteral = makeStructLiteralWith({
        symbol: makeSymbolRef('String'),
        props: [
          makeStructLiteralProp('buffer', makeDataLiteral(node.fields.value)),
          makeStructLiteralProp(
            'length',
            makeNumberLiteral(node.fields.value.length, 'int', 'usize')
          ),
        ],
      });
      overwriteNode(node, structLiteral);
    }
  }
}
