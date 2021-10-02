import { BinOp, UnaryOp } from './snax-ast.js';
import {
  ASTNode,
  makeBinaryExprWith,
  makeDataLiteral,
  makeExprStatement,
  makeNumberLiteral,
  makeStructDecl,
  makeStructLiteral,
  makeStructLiteralProp,
  makeStructLiteralWith,
  makeStructProp,
  makeSymbolRef,
  makeUnaryExpr,
} from './spec-gen.js';
import { children, depthFirstIter } from './spec-util.js';

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
        const structLiteral = makeStructLiteralWith({
          symbol: makeSymbolRef('String'),
          props: [
            makeStructLiteralProp(
              'buffer',
              makeUnaryExpr(UnaryOp.ADDR_OF, makeDataLiteral(node.fields.value))
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
          const i = parent.fields.statements.indexOf(node);
          parent.fields.statements.splice(
            i + 1,
            0,
            makeExprStatement(
              makeBinaryExprWith({
                op: BinOp.ASSIGN,
                left: makeSymbolRef(symbol),
                right: expr,
              })
            )
          );
        }
        break;
      }
    }
  }
}
