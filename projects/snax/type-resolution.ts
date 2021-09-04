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
export function resolveType(node: ASTNode, nodeDataMap: NodeDataMap): BaseType {
  let resolvedType = nodeDataMap.get(node).resolvedType;
  if (!resolvedType) {
    resolvedType = calculateType(node, nodeDataMap);
    nodeDataMap.get(node).resolvedType = resolvedType;
  }
  return resolvedType;
}
function calculateType(node: ASTNode, nodeDataMap: NodeDataMap): BaseType {
  switch (node.name) {
    case 'BooleanLiteral':
      return resolvers[node.name](node.fields);
    case 'NumberLiteral':
      return resolvers[node.name](node.fields);
    case 'StringLiteral':
      return new ArrayType(Intrinsics.u8, node.fields.value.length);
    case 'SymbolRef': {
      let symbolTable = nodeDataMap.get(node).symbolTable;
      if (!symbolTable) {
        throw new TypeResolutionError(
          node,
          `Can't resolve type for symbol ref without an attached symbol table`
        );
      }
      const record = symbolTable.get(node.fields.symbol);
      if (!record) {
        throw new TypeResolutionError(
          node,
          `Can't resolve type for undeclard symbol ${node.fields.symbol}`
        );
      }
      const resolvedType = resolveType(record.declNode, nodeDataMap);
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
        resolveType(node.fields.pointerToExpr, nodeDataMap)
      );
    case 'ExprStatement':
      return Intrinsics.Void;
    case 'GlobalDecl':
    case 'LetStatement': {
      if (node.fields.typeExpr) {
        let explicitType = resolveType(node.fields.typeExpr, nodeDataMap);
        if (explicitType !== Intrinsics.unknown) {
          return explicitType;
        }
      }
      return resolveType(node.fields.expr, nodeDataMap);
    }
    case 'IfStatement': {
      const thenType = resolveType(node.fields.thenBlock, nodeDataMap);
      const elseType = resolveType(node.fields.elseBlock, nodeDataMap);
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
        resolveType(node.fields.left, nodeDataMap),
        resolveType(node.fields.right, nodeDataMap)
      );
    case 'CallExpr': {
      const leftType = resolveType(node.fields.left, nodeDataMap);
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
          const exprType = resolveType(node.fields.expr, nodeDataMap);
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
          type = resolveType(element, nodeDataMap);
        } else if (resolveType(element, nodeDataMap) !== type) {
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
        resolveType(p, nodeDataMap)
      );
      let returnType: BaseType | null = null;
      for (const child of depthFirstIter(node.fields.body)) {
        if (isReturnStatement(child)) {
          let alternativeReturnType = resolveType(child, nodeDataMap);
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
      return resolveType(node.fields.typeExpr, nodeDataMap);
    case 'ReturnStatement':
      return node.fields.expr
        ? resolveType(node.fields.expr, nodeDataMap)
        : Intrinsics.void;
    default:
      throw new TypeResolutionError(node, `No type resolution exists`);
  }
}
