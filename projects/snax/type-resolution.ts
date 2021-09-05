import { NodeDataMap } from './ast-compiler';
import { getTypeForBinaryOp, NumberLiteralType, UnaryOp } from './snax-ast';
import {
  ArrayType,
  BaseType,
  FuncType,
  Intrinsics,
  PointerType,
  UnionType,
} from './snax-types';
import {
  ASTNode,
  BooleanLiteral,
  isReturnStatement,
  NumberLiteral,
} from './spec-gen';
import { depthFirstIter } from './spec-util';
import { SymbolRefMap } from './symbol-resolution';

type Fields<N> = N extends { fields: infer F } ? F : never;

const resolvers = {
  BooleanLiteral: (f: Fields<BooleanLiteral>) => Intrinsics.bool,
  NumberLiteral: ({
    explicitType,
    numberType,
  }: Fields<NumberLiteral>): BaseType => {
    if (explicitType) {
      return Intrinsics[explicitType];
    }
    switch (numberType) {
      case NumberLiteralType.Float:
        return Intrinsics.f32;
      case NumberLiteralType.Integer:
        return Intrinsics.i32;
    }
    throw new Error('panic.');
  },
};

class TypeResolutionError extends Error {
  node: ASTNode;
  constructor(node: ASTNode, message: string) {
    super(message);
    this.node = node;
  }
}
export function resolveType(
  node: ASTNode,
  nodeDataMap: NodeDataMap,
  refMap: SymbolRefMap
): BaseType {
  let resolvedType = nodeDataMap.get(node).resolvedType;
  if (!resolvedType) {
    resolvedType = calculateType(node, nodeDataMap, refMap);
    nodeDataMap.get(node).resolvedType = resolvedType;
  }
  return resolvedType;
}
function calculateType(
  node: ASTNode,
  nodeDataMap: NodeDataMap,
  refMap: SymbolRefMap
): BaseType {
  switch (node.name) {
    case 'BooleanLiteral':
      return resolvers[node.name](node.fields);
    case 'NumberLiteral':
      return resolvers[node.name](node.fields);
    case 'StringLiteral':
      return new ArrayType(Intrinsics.u8, node.fields.value.length);
    case 'SymbolRef': {
      const record = refMap.get(node);
      if (!record) {
        throw new TypeResolutionError(
          node,
          `Can't resolve type for undeclard symbol ${node.fields.symbol}`
        );
      }
      const resolvedType = resolveType(record.declNode, nodeDataMap, refMap);
      if (!resolvedType) {
        throw new TypeResolutionError(
          node,
          `Can't resolve type for symbol ${node.fields.symbol}, whose declaration hasn't had its type resolved`
        );
      }
      return resolvedType;
    }
    case 'TypeRef':
      switch (node.fields.symbol) {
        case 'u8':
        case 'u16':
        case 'u32':
        case 'u64':
        case 'i8':
        case 'i16':
        case 'i32':
        case 'i64':
        case 'f32':
        case 'unknown':
          return Intrinsics[node.fields.symbol];
      }
      throw new TypeResolutionError(
        node,
        `TypeRef: Can't resolve type ${node.fields.symbol}`
      );
    case 'PointerTypeExpr':
      return new PointerType(
        resolveType(node.fields.pointerToExpr, nodeDataMap, refMap)
      );
    case 'ExprStatement':
      return Intrinsics.Void;
    case 'GlobalDecl':
    case 'LetStatement': {
      if (node.fields.typeExpr) {
        let explicitType = resolveType(
          node.fields.typeExpr,
          nodeDataMap,
          refMap
        );
        if (explicitType !== Intrinsics.unknown) {
          return explicitType;
        }
      }
      return resolveType(node.fields.expr, nodeDataMap, refMap);
    }
    case 'IfStatement': {
      const thenType = resolveType(node.fields.thenBlock, nodeDataMap, refMap);
      const elseType = resolveType(node.fields.elseBlock, nodeDataMap, refMap);
      if (thenType === elseType) {
        return thenType;
      }
      return new UnionType([thenType, elseType]);
    }
    case 'WhileStatement':
      return Intrinsics.Void;
    case 'Block':
      return Intrinsics.Void;
    case 'BinaryExpr':
      return getTypeForBinaryOp(
        node.fields.op,
        resolveType(node.fields.left, nodeDataMap, refMap),
        resolveType(node.fields.right, nodeDataMap, refMap)
      );
    case 'CallExpr': {
      const leftType = resolveType(node.fields.left, nodeDataMap, refMap);
      if (leftType instanceof FuncType) {
        return leftType.returnType;
      } else {
        throw new TypeResolutionError(
          node,
          "Can't call something that is not a function"
        );
      }
    }
    case 'UnaryExpr': {
      switch (node.fields.op) {
        case UnaryOp.DEREF:
          const exprType = resolveType(node.fields.expr, nodeDataMap, refMap);
          if (exprType instanceof PointerType) {
            return exprType.toType;
          }
          throw new TypeResolutionError(
            node,
            `DEREF: Don't know the type when dereferencing a ${exprType.name}`
          );
        default:
          throw new TypeResolutionError(
            node,
            `UnaryExpr: Don't know how to resolve type for unary operator ${node.fields.op}`
          );
      }
    }
    case 'ArrayLiteral': {
      let type = Intrinsics.void;
      for (const [i, element] of node.fields.elements.entries()) {
        if (i == 0) {
          type = resolveType(element, nodeDataMap, refMap);
        } else if (resolveType(element, nodeDataMap, refMap) !== type) {
          throw new TypeResolutionError(
            node,
            "Can't have an array with mixed types."
          );
        }
      }
      return new ArrayType(type, node.fields.elements.length);
    }
    case 'FuncDecl': {
      let paramTypes = node.fields.parameters.fields.parameters.map((p) =>
        resolveType(p, nodeDataMap, refMap)
      );
      let returnType: BaseType | null = null;
      for (const child of depthFirstIter(node.fields.body)) {
        if (isReturnStatement(child)) {
          let alternativeReturnType = resolveType(child, nodeDataMap, refMap);
          if (returnType === null) {
            returnType = alternativeReturnType;
          } else if (alternativeReturnType !== returnType) {
            throw new TypeResolutionError(
              node,
              `FuncDecl: can't resolve type for function ${node.fields.symbol}: return statements have varying types`
            );
          }
        }
      }
      return new FuncType(paramTypes, returnType ?? Intrinsics.void);
    }
    case 'Parameter':
      return resolveType(node.fields.typeExpr, nodeDataMap, refMap);
    case 'ReturnStatement':
      return node.fields.expr
        ? resolveType(node.fields.expr, nodeDataMap, refMap)
        : Intrinsics.void;
    default:
      throw new TypeResolutionError(node, `No type resolution exists`);
  }
}
