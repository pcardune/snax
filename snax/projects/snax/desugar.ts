import { BinOp, UnaryOp } from './snax-ast.js';
import {
  ASTNode,
  makeBinaryExprWith,
  makeDataLiteral,
  makeExprStatement,
  makeNamespacedRef,
  makeNumberLiteral,
  makeStructDecl,
  makeStructLiteralProp,
  makeStructLiteralWith,
  makeStructProp,
  makeSymbolRef,
  makeUnaryExpr,
} from './spec-gen.js';
import { children } from './spec-util.js';

function* nodesWithParentIter(
  node: ASTNode,
  parent?: ASTNode
): Generator<{ node: ASTNode; parent?: ASTNode }> {
  for (const child of children(node)) {
    yield* nodesWithParentIter(child, node);
  }
  yield { node, parent };
}

function overwriteNode(originalNode: ASTNode, newNode: ASTNode) {
  originalNode.name = newNode.name;
  originalNode.fields = newNode.fields;
}

export function desugar(root: ASTNode) {
  for (const { node, parent } of nodesWithParentIter(root)) {
    switch (node.name) {
      case 'StringLiteral': {
        const dataLiteral = makeDataLiteral(node.fields.value);
        dataLiteral.location = node.location;
        const structLiteral = makeStructLiteralWith({
          symbol: makeNamespacedRef(['snax/string.snx', 'String']),
          props: [
            makeStructLiteralProp(
              'buffer',
              makeUnaryExpr(UnaryOp.ADDR_OF, dataLiteral)
            ),
            makeStructLiteralProp(
              'length',
              makeNumberLiteral(node.fields.value.length, 'int', 'usize')
            ),
          ],
        });
        overwriteNode(node, structLiteral);
        break;
      }
      case 'TupleStructDecl': {
        const objStruct = makeStructDecl(
          node.fields.symbol,
          node.fields.elements.map((typeExpr, i) =>
            makeStructProp(String(i), typeExpr)
          )
        );
        overwriteNode(node, objStruct);
        break;
      }
      case 'LetStatement': {
        if (node.fields.expr) {
          // statement of the form
          //   let a = 4;
          // will be desugared to:
          //   let a;
          //   a = 4;
          const { expr, symbol } = node.fields;
          node.fields.expr = undefined;
          if (parent?.name !== 'Block') {
            throw new Error(`Expected ${node.name} to appear within a Block`);
          }
          const assignExpr = makeExprStatement(
            makeBinaryExprWith({
              op: BinOp.ASSIGN,
              left: makeSymbolRef(symbol),
              right: expr,
            })
          );
          assignExpr.location = node.location;
          const i = parent.fields.statements.indexOf(node);
          parent.fields.statements.splice(i + 1, 0, assignExpr);
        }
        break;
      }
    }
  }
}
